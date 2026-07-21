/**
 * Зеркалирование код-ревью из GitHub PR в задачу портала.
 * Вебхук на клиентском репо нам недоступен (нет admin-прав как у коллаборатора), поэтому тянем
 * поллингом в цикле deploy-sync: ревьюер клиента пишет фидбек в PR (inline-комменты, ревью с
 * вердиктом, общие комменты) → портал кладёт их ВНУТРЕННИМ комментом в задачу, чтобы Claude-разработчик
 * видел фидбек прямо в задаче, а не ходил в GitHub. Клиенту эти комменты не видны (visibility:internal).
 *
 * DEV-51 — идемпотентность по стабильному GitHub-id (было: временной курсор → бесконечные дубли).
 * Каждый элемент (review / inline review-comment / issue-comment) мирорим РОВНО ОДИН РАЗ, ключ —
 * (gh_type, gh_id) в таблице mirrored_pr_items (переживает рестарты). Правку оригинала на GitHub
 * (изменился updated_at/длина тела → sig) зеркалим как EDIT уже созданного коммента, а не новый.
 * Курсор task_prs.review_synced_at остаётся ТОЛЬКО как базлайн (не тянуть историю на первом проходе) —
 * НЕ как механизм дедупа. Условные запросы (ETag/If-None-Match): неизменившийся PR → 304, квота не тратится.
 * Server-side only.
 */
import { getBackend } from "./tasks";
import { setPrReviewSynced, taskDbId, getMirroredForPr, markMirroredItem, updateMirroredSig, updateCommentBody, getState, setState, memberByGithubLogin, getProjectFull } from "./db";
import { ghFetchRetry, GitHubError } from "./github";
import { notifyLogins, taskTag } from "./notify";
import { PORTAL_BASE } from "./dev-protocol";

const API = "https://api.github.com";
const GH = { Authorization: `Bearer ${process.env.GITHUB_TOKEN || ""}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };

function parsePr(prUrl: string): { owner: string; repo: string; num: string } | null {
  const m = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  return m ? { owner: m[1], repo: m[2], num: m[3] } : null;
}

/**
 * GET списка с условным запросом по ETag: на неизменившийся ресурс GitHub отвечает 304 (квота НЕ тратится) —
 * возвращаем []. ETag храним per (endpoint+PR) в poller_state. 3 ретрая с бэкоффом на транзиентные 401/403/429/5xx.
 */
async function ghList<T>(path: string, etagKey: string): Promise<T[]> {
  const prev = await getState(etagKey).catch(() => null);
  const headers: Record<string, string> = { ...GH };
  if (prev) headers["If-None-Match"] = prev;
  const r = await ghFetchRetry(API + path, { headers, cache: "no-store" }, 3);
  if (r.status === 304) return []; // не изменилось с прошлого раза — экономим квоту
  if (!r.ok) throw new GitHubError(r.status, `GitHub ${r.status} GET ${path}: ${(await r.text()).slice(0, 200)}`);
  const etag = r.headers.get("etag");
  if (etag) await setState(etagKey, etag).catch(() => {});
  return (await r.json()) as T[];
}

function esc(s: string): string {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function clip(s: string, n = 2000): string {
  const t = String(s || "").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

interface GhUser { login?: string }
interface ReviewComment { id: number; user?: GhUser; body?: string; created_at: string; updated_at?: string; html_url?: string; path?: string; line?: number | null; original_line?: number | null }
interface Review { id: number; user?: GhUser; body?: string; state?: string; submitted_at?: string | null; html_url?: string }
interface IssueComment { id: number; user?: GhUser; body?: string; created_at: string; updated_at?: string; html_url?: string }

interface MirrorItem { type: "review" | "inline" | "issue"; ghId: number; tsMs: number; sig: string; text: string; authorGh?: string }

/**
 * Синхронизировать код-ревью одного PR в задачу. Возвращает число ВНОВЬ зазеркаленных комментов (правки не считаем).
 * Бросает при ошибке GitHub — её ловит вызывающий (deploy-sync) и уводит в лог/админу (НЕ в тред задачи).
 */
export async function syncPrReview(taskId: string, prUrl: string, syncedAt: Date | null): Promise<number> {
  const p = parsePr(prUrl);
  if (!p) throw new Error(`не GitHub PR URL: ${prUrl}`);
  const tid = await taskDbId(taskId);
  if (!tid) return 0;

  const firstPass = syncedAt == null;
  // Курсор = «до этого времени уже учтено». На первом проходе — «сейчас»: вся существующая на момент
  // первой привязки история засевается молча, а постятся только элементы НОВЕЕ курсора (см. цикл ниже).
  const cursorMs = syncedAt ? syncedAt.getTime() : Date.now();

  const base = `/repos/${p.owner}/${p.repo}`;
  // Тянем полные списки (per_page=100) с ETag — дедуп по id, поэтому since как механизм дедупа больше не нужен.
  const [inline, reviews, issues] = await Promise.all([
    ghList<ReviewComment>(`${base}/pulls/${p.num}/comments?sort=created&direction=asc&per_page=100`, `etag:rev:inline:${prUrl}`),
    ghList<Review>(`${base}/pulls/${p.num}/reviews?per_page=100`, `etag:rev:reviews:${prUrl}`),
    ghList<IssueComment>(`${base}/issues/${p.num}/comments?per_page=100`, `etag:rev:issue:${prUrl}`),
  ]);

  const items: MirrorItem[] = [];
  for (const c of inline) {
    const loc = c.path ? ` · <code>${esc(c.path)}${c.line ?? c.original_line ? ":" + (c.line ?? c.original_line) : ""}</code>` : "";
    items.push({
      type: "inline", ghId: c.id, tsMs: Date.parse(c.created_at), sig: `${c.updated_at || c.created_at}#${(c.body || "").length}`, authorGh: c.user?.login,
      text: `🔎 <b>Код-рев'ю</b> · @${esc(c.user?.login || "?")}${loc}\n\n${esc(clip(c.body || ""))}${c.html_url ? "\n\n" + c.html_url : ""}`,
    });
  }
  for (const r of reviews) {
    // Ревью-вердикт: тянем те, у кого есть тело ИЛИ вердикт меняет статус PR. PENDING/пустой COMMENTED — пропускаем.
    const ts = r.submitted_at || undefined;
    if (!ts) continue;
    const hasVerdict = r.state === "CHANGES_REQUESTED" || r.state === "APPROVED";
    if (!r.body?.trim() && !hasVerdict) continue;
    const stateLabel = r.state === "CHANGES_REQUESTED" ? "потрібні правки" : r.state === "APPROVED" ? "схвалено" : "коментар";
    items.push({
      type: "review", ghId: r.id, tsMs: Date.parse(ts), sig: `${ts}#${r.state}#${(r.body || "").length}`, authorGh: r.user?.login,
      text: `🔎 <b>Рев'ю PR: ${stateLabel}</b> · @${esc(r.user?.login || "?")}${r.body?.trim() ? "\n\n" + esc(clip(r.body)) : ""}${r.html_url ? "\n\n" + r.html_url : ""}`,
    });
  }
  for (const c of issues) {
    items.push({
      type: "issue", ghId: c.id, tsMs: Date.parse(c.created_at), sig: `${c.updated_at || c.created_at}#${(c.body || "").length}`, authorGh: c.user?.login,
      text: `💬 <b>Коментар у PR</b> · @${esc(c.user?.login || "?")}\n\n${esc(clip(c.body || ""))}${c.html_url ? "\n\n" + c.html_url : ""}`,
    });
  }

  if (!items.length) return 0;
  items.sort((a, b) => a.tsMs - b.tsMs); // хронологически

  const mirrored = await getMirroredForPr(prUrl);
  // Базлайн — по ВРЕМЕНИ, а не по размеру. Элементы старше курсора (а на первом проходе — вся текущая
  // история) засеваем молча: защита от заваливания задачи историей при первой привязке PR и от дублей
  // старого временного курсора (DEV-51). Всё НОВЕЕ курсора — постим. Прежняя завязка `mirrored.size===0`
  // глушила ПЕРВУЮ волну комментов на каждом PR (наши PR создаются пустыми, комменты приходят позже),
  // из-за чего фидбек ревьюера не попадал в задачу и висел незамеченным в GitHub.
  const be = getBackend();
  const memberCache = new Map<string, { login: string; fullName: string; role: string } | null>();
  const resolveMember = async (gh?: string) => {
    const g = (gh || "").trim();
    if (!g) return null;
    if (!memberCache.has(g)) memberCache.set(g, await memberByGithubLogin(g).catch(() => null));
    return memberCache.get(g) ?? null;
  };
  const postedByMember: { name: string; text: string }[] = [];
  let posted = 0;
  for (const it of items) {
    const key = `${it.type}:${it.ghId}`;
    const ex = mirrored.get(key);
    if (ex) {
      // Уже зазеркалено. Если оригинал отредактировали (sig изменился) и у нас есть зеркальный коммент — обновляем его.
      if (ex.sig !== it.sig && ex.commentId != null) {
        await updateCommentBody(ex.commentId, it.text);
        await updateMirroredSig(it.type, it.ghId, it.sig);
      }
      continue;
    }
    if (it.tsMs <= cursorMs) {
      await markMirroredItem(tid, prUrl, it.type, it.ghId, null, it.sig); // старше курсора → история, seed без коммента
      continue;
    }
    // Новый элемент. Автора (GitHub-логин) атрибутируем участнику портала, если он привязан
    // (напр. клиентский разработчик) — тогда коммент идёт ОТ него, а не анонимно от «Lambertain».
    // visibility=internal: это dev↔dev фидбек, клиенту он не виден.
    const member = await resolveMember(it.authorGh);
    const c = await be.addComment(taskId, it.text, "internal", member?.login, true, false);
    await markMirroredItem(tid, prUrl, it.type, it.ghId, Number(c.id), it.sig);
    posted++;
    if (member) postedByMember.push({ name: member.fullName || member.login, text: it.text });
  }

  // Новое ревью от привязанного участника (клиентского разработчика) → пуш ответственному разработчику,
  // чтобы фидбек не висел незамеченным в GitHub (первопричина затримок з доробками).
  if (postedByMember.length) {
    try {
      const task = await be.getTask(taskId);
      const proj = await getProjectFull(task.projectKey).catch(() => null);
      const dev = task.assignee?.login || proj?.meta.defaultAssignee || null;
      if (dev) {
        const tag = await taskTag(taskId).catch(() => taskId);
        const who = postedByMember[0].name;
        const preview = postedByMember[0].text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 300);
        const more = postedByMember.length > 1 ? ` (+${postedByMember.length - 1})` : "";
        const link = { text: "Відкрити задачу", url: `${PORTAL_BASE}/admin/tasks/${taskId}` };
        await notifyLogins([dev], `🔎 <b>Код-рев'ю у PR</b> · ${who}${more} · ${tag}\n${preview}`, [], link).catch(() => {});
      }
    } catch { /* пуш best-effort — коммент уже додано */ }
  }

  // Курсор-базлайн: первый проход — ставим now() (не тянем историю); дальше — сдвигаем на максимум по времени.
  if (firstPass) {
    await setPrReviewSynced(taskId, prUrl);
  } else {
    const maxMs = Math.max(...items.map((i) => i.tsMs));
    if (cursorMs != null && maxMs > cursorMs) await setPrReviewSynced(taskId, prUrl, new Date(maxMs).toISOString());
  }
  return posted;
}
