/**
 * Синхронизация портал → Trello: при смене статуса портальной задачи двигаем связанную карточку
 * клиентской доски в нужную колонку. Связь задача↔карточка — по ссылке `trello.com/c/<id>` в описании задачи.
 * Креды Trello — в meta.customFields.trello (key/token/board), как поле каталога. Server-side only.
 */
import { getBackend } from "./tasks";
import { getProjectFull } from "./db";
import { statusBucket, type Bucket } from "./statuses";
import type { ProjectMeta } from "./tasks/types";
import { PORTAL_BASE } from "./dev-protocol";

export interface TrelloCfg { key: string; token: string; board: string }

export function trelloCfg(meta: ProjectMeta): TrelloCfg | null {
  const t = meta.customFields?.trello;
  return t?.key && t?.token && t?.board ? { key: t.key, token: t.token, board: t.board } : null;
}

/** id/shortLink карточки из текста (ссылка trello.com/c/<id>). */
export function cardIdFromText(text: string): string | null {
  const m = String(text || "").match(/trello\.com\/c\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

/** Ключевые слова колонки доски по корзине статуса (под их доску: Беклог · В процесі · Тестування · Є блокер · Виконано). */
const BUCKET_KEYWORDS: Partial<Record<Bucket, string[]>> = {
  inProgress: ["в процес", "в процессе", "in progress", "doing", "wip"],
  review: ["тестуван", "тестиров", "review", "ревью", "qa", "test"],
  done: ["викона", "выполн", "done", "готов", "complete"],
  blocked: ["блокер", "block", "заблок", "hold"],
  rework: ["в процес", "доопрац", "rework", "доработ"], // на доработку — назад в работу
  notStarted: ["беклог", "backlog", "to do", "todo", "тиждень"],
};

/**
 * Обратное сопоставление: имя колонки клиентской Trello-доски → корзина статуса портала.
 * Нужно вебхуку, чтобы ручное перетаскивание карточки клиентом/их разработчиком отражалось в статусе
 * портальной задачи (Trello → портал). Порядок проверок важен (done/blocked/review раньше inProgress).
 * «В процесі» → inProgress (а не rework): отдельной колонки доработки на доске нет, «назад в работу» = In Progress.
 * Возвращает null для неузнанных/плановых колонок (Беклог, Поточний тиждень, Архів) — их вебхук не синкает.
 */
export function bucketFromListName(name: string): Bucket | null {
  const s = String(name || "").toLowerCase();
  if (/(викона|выполн|\bdone\b|complete|готов)/.test(s)) return "done";
  if (/(блокер|заблок|block|hold)/.test(s)) return "blocked";
  if (/(тестуван|тестиров|review|ревью|\bqa\b|test)/.test(s)) return "review";
  if (/(в процес|в процессе|in progress|doing|wip|доопрац|rework|доработ)/.test(s)) return "inProgress";
  return null;
}

async function trello(cfg: TrelloCfg, method: string, path: string, params: Record<string, string> = {}): Promise<unknown> {
  const u = new URL("https://api.trello.com/1" + path);
  u.searchParams.set("key", cfg.key);
  u.searchParams.set("token", cfg.token);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { method, cache: "no-store" });
  return r.ok ? r.json().catch(() => null) : null;
}

/** id участника Trello, которому принадлежит наш токен (кэш по токену). Нужно вебхуку, чтобы
 *  НЕ втягивать обратно на портал наши же зеркалированные комменты (защита от петли). */
const memberIdCache = new Map<string, string>();
export async function trelloMemberId(cfg: TrelloCfg): Promise<string | null> {
  const cached = memberIdCache.get(cfg.token);
  if (cached) return cached;
  const me = (await trello(cfg, "GET", "/members/me", { fields: "id" })) as { id?: string } | null;
  if (me?.id) memberIdCache.set(cfg.token, me.id);
  return me?.id ?? null;
}

/** HTML портального коммента → текст для Trello-коммента (Markdown Trello). */
function htmlToTrello(html: string): string {
  return String(html || "")
    .replace(/<br\s*\/?>(?!\n)/gi, "\n")
    .replace(/<\/(p|div)>/gi, "\n")
    .replace(/<(b|strong)>/gi, "**").replace(/<\/(b|strong)>/gi, "**")
    .replace(/<(i|em)>/gi, "_").replace(/<\/(i|em)>/gi, "_")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/\/api\/files\//g, `${PORTAL_BASE}/api/files/`)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Добавить коммент на карточку. */
export async function trelloComment(cfg: TrelloCfg, cardId: string, text: string): Promise<void> {
  if (!text.trim()) return;
  await trello(cfg, "POST", `/cards/${cardId}/actions/comments`, { text: text.slice(0, 16000) });
}

/**
 * Зеркалирование портал → Trello: наш/командный клиент-видимый коммент по задаче →
 * комментом на связанной Trello-карточке. Best-effort, no-op если у проекта нет Trello или связи с карточкой.
 * Петля не образуется: вебхук пропускает комменты, автор которых = наш Trello-аккаунт (trelloMemberId).
 */
export async function mirrorCommentToTrello(taskId: string, body: string): Promise<void> {
  try {
    const task = await getBackend().getTask(taskId).catch(() => null);
    if (!task) return;
    const cardId = cardIdFromText(task.description || "");
    if (!cardId) return;
    const proj = await getProjectFull(task.projectKey).catch(() => null);
    const cfg = proj ? trelloCfg(proj.meta) : null;
    if (!cfg) return;
    const text = htmlToTrello(body);
    if (text) await trelloComment(cfg, cardId, text);
  } catch {
    // best-effort — не валим основной поток
  }
}

/** Переместить Trello-карточку задачи в колонку, соответствующую корзине статуса. Best-effort (тихо выходит, если нет конфига/карточки/колонки). */
export async function moveTrelloCardForTask(description: string, meta: ProjectMeta, bucket: Bucket): Promise<void> {
  const cfg = trelloCfg(meta);
  if (!cfg) return;
  const cardId = cardIdFromText(description);
  if (!cardId) return;
  const kws = BUCKET_KEYWORDS[bucket];
  if (!kws) return;
  const lists = (await trello(cfg, "GET", `/boards/${cfg.board}/lists`, { fields: "id,name" })) as { id: string; name: string }[] | null;
  if (!Array.isArray(lists)) return;
  const target = lists.find((l) => kws.some((kw) => l.name.toLowerCase().includes(kw)));
  if (!target) return;
  await trello(cfg, "PUT", `/cards/${cardId}`, { idList: target.id });
}

/** Удобный хук: по taskId и новому статусу подтянуть задачу+meta и подвинуть Trello-карточку. */
export async function syncTaskToTrello(taskId: string, status: string): Promise<void> {
  try {
    const task = await getBackend().getTask(taskId).catch(() => null);
    if (!task) return;
    const proj = await getProjectFull(task.projectKey).catch(() => null);
    if (!proj || !proj.meta.customFields?.trello) return;
    await moveTrelloCardForTask(task.description || "", proj.meta, statusBucket(status));
  } catch {
    // best-effort — не валим основной поток
  }
}
