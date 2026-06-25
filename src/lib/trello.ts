/**
 * Синхронизация портал → Trello: при смене статуса портальной задачи двигаем связанную карточку
 * клиентской доски в нужную колонку. Связь задача↔карточка — по ссылке `trello.com/c/<id>` в описании задачи.
 * Креды Trello — в meta.customFields.trello (key/token/board), как поле каталога. Server-side only.
 */
import { getBackend } from "./tasks";
import { getProjectFull } from "./db";
import { statusBucket, type Bucket } from "./statuses";
import type { ProjectMeta } from "./tasks/types";

interface TrelloCfg { key: string; token: string; board: string }

function trelloCfg(meta: ProjectMeta): TrelloCfg | null {
  const t = meta.customFields?.trello;
  return t?.key && t?.token && t?.board ? { key: t.key, token: t.token, board: t.board } : null;
}

/** id карточки из текста (ссылка trello.com/c/<id>). */
function cardIdFromText(text: string): string | null {
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

async function trello(cfg: TrelloCfg, method: string, path: string, params: Record<string, string> = {}): Promise<unknown> {
  const u = new URL("https://api.trello.com/1" + path);
  u.searchParams.set("key", cfg.key);
  u.searchParams.set("token", cfg.token);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { method, cache: "no-store" });
  return r.ok ? r.json().catch(() => null) : null;
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
