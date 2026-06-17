/**
 * Модерация клиент-видимых комментов команды.
 * Любой клиент-видимый коммент от команды (кроме супер-админа и самого клиента) создаётся pending
 * (approved=false): клиент его НЕ видит и НЕ получает пуш. Уведомление уходит супер-админу (Никите) на модерацию.
 * После апрува/правки коммент публикуется и клиент получает уведомление. Server-side only.
 */
import { getBackend } from "./tasks";
import { notifyAdmin, notifyProjectClients, attachmentIdsIn, taskTag } from "./notify";
import { q, getProjectFull } from "./db";
import { PORTAL_BASE } from "./dev-protocol";

const taskBtn = (taskId: string) => ({ text: "Открыть задачу", url: `${PORTAL_BASE}/admin/tasks/${taskId}` });

/**
 * Клиент-видимый коммент от команды → на модерацию супер-админу.
 * Создаёт pending-коммент (клиент не видит, без пуша) и уведомляет супер-админа.
 * Исключение — проект с autoApprove (доверенный разработчик): публикуем сразу клиенту, без модерации.
 */
export async function submitForModeration(taskId: string, body: string, opts?: { authorLogin?: string; taskSummary?: string }): Promise<void> {
  const task = await getBackend().getTask(taskId).catch(() => null);
  const summary = opts?.taskSummary ?? task?.summary ?? "";
  const proj = task ? await getProjectFull(task.projectKey).catch(() => null) : null;
  if (proj?.meta.autoApprove) {
    // Доверенный разработчик — без модерации: публикуем клиенту сразу.
    await getBackend().addComment(taskId, body, "client", opts?.authorLogin, true);
    if (task) await notifyProjectClients(task.projectKey, `💬 <b>${await taskTag(taskId)}</b>: ${summary}\n${body.slice(0, 400)}`, attachmentIdsIn(body), taskBtn(taskId)).catch(() => {});
    return;
  }
  await getBackend().addComment(taskId, body, "client", opts?.authorLogin, false);
  await notifyAdmin(`🛡 <b>Коммент на модерацию</b> · ${await taskTag(taskId)}: ${summary}\n${body.slice(0, 400)}`, taskBtn(taskId)).catch(() => {});
}

type Row = { id: number; body: string; readable_id: string; project_key: string; project_name: string; summary: string };
async function commentInfo(commentId: string): Promise<Row | null> {
  const rows = await q<Row>(
    `SELECT c.id, c.body, t.readable_id, p.key AS project_key, p.name AS project_name, t.title AS summary
     FROM comments c JOIN tasks t ON t.id = c.task_id JOIN projects p ON p.id = t.project_id
     WHERE c.id = $1`,
    [commentId],
  );
  return rows[0] ?? null;
}

/** Одобрить pending-коммент → публикуется клиенту + пуш. */
export async function approveModeratedComment(commentId: string): Promise<{ taskId: string } | { error: string }> {
  const r = await commentInfo(commentId);
  if (!r) return { error: "not found" };
  await q("UPDATE comments SET approved = true WHERE id = $1", [commentId]);
  await notifyProjectClients(
    r.project_key,
    `💬 <b>${r.project_name} · ${r.readable_id}</b>: ${r.summary}\n${r.body.slice(0, 400)}`,
    attachmentIdsIn(r.body),
    taskBtn(r.readable_id),
  ).catch(() => {});
  return { taskId: r.readable_id };
}

/** Отредактировать текст и сразу одобрить (→ публикуется клиенту + пуш). */
export async function editModeratedComment(commentId: string, body: string): Promise<{ taskId: string } | { error: string }> {
  if (!body.trim()) return { error: "empty" };
  await q("UPDATE comments SET body = $2 WHERE id = $1", [commentId, body]);
  return approveModeratedComment(commentId);
}

/**
 * Отклонить клиент-facing коммент команды, но ОСТАВИТЬ его внутренним: текст остаётся в треде для команды,
 * клиент не видит, очередь модерации чистится. Полное удаление — отдельной корзиной (deleteCommentAny).
 */
export async function rejectToInternal(commentId: string): Promise<void> {
  await q("UPDATE comments SET approved = true, visibility = 'internal' WHERE id = $1 AND approved = false", [commentId]);
}

/** Автор-член правит СВОЙ pending-коммент (до модерации). Проверяет авторство и что ещё не опубликован. */
export async function editOwnPending(commentId: string, authorLogin: string, body: string): Promise<{ ok: true } | { error: string }> {
  if (!body.trim()) return { error: "empty" };
  const rows = await q<{ approved: boolean; login: string | null }>(
    "SELECT c.approved, m.login FROM comments c LEFT JOIN members m ON m.id = c.author_id WHERE c.id = $1",
    [commentId],
  );
  const r = rows[0];
  if (!r) return { error: "not found" };
  if (r.approved) return { error: "already published" };
  if (!authorLogin || r.login !== authorLogin) return { error: "not your comment" };
  await q("UPDATE comments SET body = $2 WHERE id = $1", [commentId, body]);
  return { ok: true };
}

/**
 * Автор правит СВОЙ уже опубликованный коммент — но ТОЛЬКО пока на него не ответила другая сторона
 * (нет более позднего коммента от другого автора). Так клиент может уточнить мысль до ответа команды.
 */
export async function editOwnPublished(commentId: string, authorLogin: string, body: string): Promise<{ ok: true } | { error: "empty" | "not found" | "not your comment" | "answered" }> {
  if (!body.trim()) return { error: "empty" };
  if (!authorLogin) return { error: "not your comment" };
  const rows = await q<{ task_id: number; created_at: string; login: string | null }>(
    "SELECT c.task_id, c.created_at, m.login FROM comments c LEFT JOIN members m ON m.id = c.author_id WHERE c.id = $1",
    [commentId],
  );
  const r = rows[0];
  if (!r) return { error: "not found" };
  if (r.login !== authorLogin) return { error: "not your comment" };
  // Есть ли в треде более поздний коммент от ДРУГОГО автора (= ответ)? Тогда правка запрещена.
  const later = await q<{ n: number }>(
    `SELECT count(*)::int AS n FROM comments c LEFT JOIN members m ON m.id = c.author_id
     WHERE c.task_id = $1 AND c.created_at > $2 AND (m.login IS DISTINCT FROM $3)`,
    [r.task_id, r.created_at, authorLogin],
  );
  if ((later[0]?.n ?? 0) > 0) return { error: "answered" };
  await q("UPDATE comments SET body = $2 WHERE id = $1", [commentId, body]);
  return { ok: true };
}

/** Автор удаляет СВОЙ опубликованный коммент — пока на него не ответила другая сторона. */
export async function deleteOwnPublished(commentId: string, authorLogin: string): Promise<{ ok: true } | { error: "not found" | "not your comment" | "answered" }> {
  if (!authorLogin) return { error: "not your comment" };
  const rows = await q<{ task_id: number; created_at: string; login: string | null }>(
    "SELECT c.task_id, c.created_at, m.login FROM comments c LEFT JOIN members m ON m.id = c.author_id WHERE c.id = $1",
    [commentId],
  );
  const r = rows[0];
  if (!r) return { error: "not found" };
  if (r.login !== authorLogin) return { error: "not your comment" };
  const later = await q<{ n: number }>(
    `SELECT count(*)::int AS n FROM comments c LEFT JOIN members m ON m.id = c.author_id
     WHERE c.task_id = $1 AND c.created_at > $2 AND (m.login IS DISTINCT FROM $3)`,
    [r.task_id, r.created_at, authorLogin],
  );
  if ((later[0]?.n ?? 0) > 0) return { error: "answered" };
  await q("DELETE FROM comments WHERE id = $1", [commentId]);
  return { ok: true };
}

/** Супер-админ удаляет ЛЮБОЙ коммент (опубликованный или на модерации). */
export async function deleteCommentAny(commentId: string): Promise<void> {
  await q("DELETE FROM comments WHERE id = $1", [commentId]);
}

/** Супер-админ редактирует текст ЛЮБОГО коммента (его собственные комменты тоже — у него нет member-логина,
 *  поэтому «правка своего» по логину ему недоступна). Статус публикации/модерации не трогаем. */
export async function editCommentAny(commentId: string, body: string): Promise<{ ok: true } | { error: string }> {
  if (!body.trim()) return { error: "empty" };
  await q("UPDATE comments SET body = $2 WHERE id = $1", [commentId, body]);
  return { ok: true };
}

/** Автор-член удаляет СВОЙ pending-коммент (до модерации). */
export async function discardOwnPending(commentId: string, authorLogin: string): Promise<{ ok: true } | { error: string }> {
  const rows = await q<{ login: string | null }>(
    "SELECT m.login FROM comments c LEFT JOIN members m ON m.id = c.author_id WHERE c.id = $1 AND c.approved = false",
    [commentId],
  );
  if (!rows[0]) return { error: "not found" };
  if (!authorLogin || rows[0].login !== authorLogin) return { error: "not your comment" };
  await q("DELETE FROM comments WHERE id = $1 AND approved = false", [commentId]);
  return { ok: true };
}
