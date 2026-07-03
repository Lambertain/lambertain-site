/**
 * Зеркалирование код-ревью из GitHub PR в задачу портала.
 * Вебхук на клиентском репо нам недоступен (нет admin-прав как у коллаборатора), поэтому тянем
 * поллингом в цикле deploy-sync: ревьюер клиента пишет фидбек в PR (inline-комменты, ревью с
 * вердиктом, общие комменты) → портал кладёт их ВНУТРЕННИМ комментом в задачу, чтобы Claude-разработчик
 * видел фидбек прямо в задаче, а не ходил в GitHub. Клиенту эти комменты не видны (visibility:internal).
 *
 * Дедуп: курсор task_prs.review_synced_at per-PR (created_at последнего зазеркаленного). Первый проход не
 * тянет историю (ставит курсор = now()), дальше — только то, что новее курсора. Server-side only.
 */
import { getBackend } from "./tasks";
import { setPrReviewSynced } from "./db";
import { ghFetchRetry, GitHubError } from "./github";

const API = "https://api.github.com";
const GH = { Authorization: `Bearer ${process.env.GITHUB_TOKEN || ""}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };

function parsePr(prUrl: string): { owner: string; repo: string; num: string } | null {
  const m = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  return m ? { owner: m[1], repo: m[2], num: m[3] } : null;
}

async function ghJson<T>(path: string): Promise<T> {
  const r = await ghFetchRetry(API + path, { headers: GH, cache: "no-store" }, 3); // 3 ретрая с бэкоффом на транзиентные 401/403/429/5xx
  if (!r.ok) throw new GitHubError(r.status, `GitHub ${r.status} GET ${path}: ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<T>;
}

function esc(s: string): string {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function clip(s: string, n = 2000): string {
  const t = String(s || "").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

interface GhUser { login?: string }
interface ReviewComment { user?: GhUser; body?: string; created_at: string; html_url?: string; path?: string; line?: number | null; original_line?: number | null }
interface Review { user?: GhUser; body?: string; state?: string; submitted_at?: string | null; html_url?: string }
interface IssueComment { user?: GhUser; body?: string; created_at: string; html_url?: string }

interface MirrorItem { ts: string; text: string }

/**
 * Синхронизировать код-ревью одного PR в задачу. Возвращает число зазеркаленных комментов.
 * Бросает при ошибке GitHub — её ловит вызывающий и показывает на портале (reportTaskError).
 */
export async function syncPrReview(taskId: string, prUrl: string, syncedAt: Date | null): Promise<number> {
  const p = parsePr(prUrl);
  if (!p) throw new Error(`не GitHub PR URL: ${prUrl}`);

  // Первый проход (курсор пуст) — не тянем всю историю ревью, просто ставим курсор «отсюда и далее».
  if (!syncedAt) { await setPrReviewSynced(taskId, prUrl); return 0; }
  const since = syncedAt.toISOString();
  const newer = (ts?: string | null) => !!ts && ts > since; // ISO-строки сравнимы лексикографически = хронологически

  const base = `/repos/${p.owner}/${p.repo}`;
  const [inline, reviews, issueComments] = await Promise.all([
    ghJson<ReviewComment[]>(`${base}/pulls/${p.num}/comments?sort=created&direction=asc&since=${encodeURIComponent(since)}&per_page=100`),
    ghJson<Review[]>(`${base}/pulls/${p.num}/reviews?per_page=100`),
    ghJson<IssueComment[]>(`${base}/issues/${p.num}/comments?since=${encodeURIComponent(since)}&per_page=100`),
  ]);

  const items: MirrorItem[] = [];

  for (const c of inline) {
    if (!newer(c.created_at)) continue;
    const loc = c.path ? ` · <code>${esc(c.path)}${c.line ?? c.original_line ? ":" + (c.line ?? c.original_line) : ""}</code>` : "";
    items.push({ ts: c.created_at, text: `🔎 <b>Код-рев'ю</b> · @${esc(c.user?.login || "?")}${loc}\n\n${esc(clip(c.body || ""))}${c.html_url ? "\n\n" + c.html_url : ""}` });
  }
  for (const r of reviews) {
    // Ревью-вердикт: тянем те, у кого есть тело ИЛИ вердикт меняет статус PR. PENDING/пустой COMMENTED — пропускаем.
    const ts = r.submitted_at || undefined;
    if (!newer(ts)) continue;
    const hasVerdict = r.state === "CHANGES_REQUESTED" || r.state === "APPROVED";
    if (!r.body?.trim() && !hasVerdict) continue;
    const stateLabel = r.state === "CHANGES_REQUESTED" ? "потрібні правки" : r.state === "APPROVED" ? "схвалено" : "коментар";
    items.push({ ts: ts!, text: `🔎 <b>Рев'ю PR: ${stateLabel}</b> · @${esc(r.user?.login || "?")}${r.body?.trim() ? "\n\n" + esc(clip(r.body)) : ""}${r.html_url ? "\n\n" + r.html_url : ""}` });
  }
  for (const c of issueComments) {
    if (!newer(c.created_at)) continue;
    items.push({ ts: c.created_at, text: `💬 <b>Коментар у PR</b> · @${esc(c.user?.login || "?")}\n\n${esc(clip(c.body || ""))}${c.html_url ? "\n\n" + c.html_url : ""}` });
  }

  if (!items.length) return 0;
  items.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0)); // хронологически

  const be = getBackend();
  for (const it of items) {
    await be.addComment(taskId, it.text, "internal", undefined, true, false);
  }
  // Курсор — на время последнего обработанного коммента (per-PR).
  await setPrReviewSynced(taskId, prUrl, items[items.length - 1].ts);
  return items.length;
}
