/**
 * Модерация клиент-видимых комментов команды.
 * Любой клиент-видимый коммент от команды (кроме супер-админа и самого клиента) создаётся pending
 * (approved=false): клиент его НЕ видит и НЕ получает пуш. Уведомление уходит супер-админу (Никите) на модерацию.
 * После апрува/правки коммент публикуется и клиент получает уведомление. Server-side only.
 */
import { after } from "next/server";
import { getBackend } from "./tasks";
import { notifyAdmin, notifyProjectClients, attachmentIdsIn, taskTag, warnClientUnreachable } from "./notify";
import { q, getProjectFull, logTaskEvent } from "./db";
import { statusBucket } from "./statuses";
import { autoDeliverAndNotify } from "./auto-deliver";
import { mirrorCommentToTrello } from "./trello";
import { PORTAL_BASE } from "./dev-protocol";

const taskBtn = (taskId: string) => ({ text: "Відкрити задачу", url: `${PORTAL_BASE}/admin/tasks/${taskId}` });

/**
 * Клиент-видимый коммент от команды → на модерацию супер-админу.
 * Создаёт pending-коммент (клиент не видит, без пуша) и уведомляет супер-админа.
 * Исключение — проект с autoApprove (доверенный разработчик): публикуем сразу клиенту, без модерации.
 */
export async function submitForModeration(taskId: string, body: string, opts?: { authorLogin?: string; taskSummary?: string; devAuthored?: boolean }): Promise<void> {
  const task = await getBackend().getTask(taskId).catch(() => null);
  const summary = opts?.taskSummary ?? task?.summary ?? "";
  const proj = task ? await getProjectFull(task.projectKey).catch(() => null) : null;
  const dev = opts?.devAuthored === true;
  if (proj?.meta.autoApprove) {
    // Доверенный разработчик — без модерации: публикуем клиенту сразу.
    await getBackend().addComment(taskId, body, "client", opts?.authorLogin, true, dev);
    await mirrorCommentToTrello(taskId, body).catch(() => {}); // портал → Trello (если подключена доска)
    if (task) {
      const reached = await notifyProjectClients(task.projectKey, `💬 <b>${await taskTag(taskId)}</b>: ${summary}\n${body.slice(0, 400)}`, attachmentIdsIn(body), taskBtn(taskId)).catch(() => 0);
      if (!reached) await warnClientUnreachable(task.projectKey, taskId, summary, proj?.meta.defaultAssignee).catch(() => {});
    }
    return;
  }
  await getBackend().addComment(taskId, body, "client", opts?.authorLogin, false, dev);
  await notifyAdmin(`🛡 <b>Коммент на модерацию</b> · ${await taskTag(taskId)}: ${summary}\n${body.slice(0, 400)}`, taskBtn(taskId)).catch(() => {});
}

type Row = { id: number; body: string; readable_id: string; project_key: string; project_name: string; summary: string; dev_authored: boolean; status: string | null };
async function commentInfo(commentId: string): Promise<Row | null> {
  const rows = await q<Row>(
    `SELECT c.id, c.body, c.dev_authored, t.status, t.readable_id, p.key AS project_key, p.name AS project_name, t.title AS summary
     FROM comments c JOIN tasks t ON t.id = c.task_id JOIN projects p ON p.id = t.project_id
     WHERE c.id = $1`,
    [commentId],
  );
  return rows[0] ?? null;
}

/** Опубликовать одобренный коммент клиенту проекта (+ пуш, с обработкой недостижимости). */
async function publishApprovedToClient(r: Row): Promise<void> {
  await mirrorCommentToTrello(r.readable_id, r.body).catch(() => {}); // портал → Trello (если подключена доска)
  const reached = await notifyProjectClients(
    r.project_key,
    `💬 <b>${r.project_name} · ${r.readable_id}</b>: ${r.summary}\n${r.body.slice(0, 400)}`,
    attachmentIdsIn(r.body),
    taskBtn(r.readable_id),
  ).catch(() => 0);
  if (!reached) {
    const p = await getProjectFull(r.project_key).catch(() => null);
    await warnClientUnreachable(r.project_key, r.readable_id, r.summary, p?.meta.defaultAssignee).catch(() => {});
  }
}

/**
 * Одобрить pending-коммент → публикуется клиенту + пуш.
 * Ручная доставка (проект БЕЗ autoDeliver/gitflow): одобрение итог-коммента разработчика «Готово до перевірки»
 * (dev_authored + задача в Review) ЗАПУСКАЕТ доставку, а клиент видит «готово» ТОЛЬКО ПОСЛЕ доставки.
 * Так не нужно отдельно «принимать» и потом вручную жать «Доставити» в проекте.
 */
export async function approveModeratedComment(commentId: string): Promise<{ taskId: string } | { error: string }> {
  const r = await commentInfo(commentId);
  if (!r) return { error: "not found" };
  const proj = await getProjectFull(r.project_key).catch(() => null);
  const manualDelivery = !!proj && !proj.meta.autoDeliver && !proj.meta.gitflowDelivery;
  const isReadiness = r.dev_authored && statusBucket(r.status) === "review";

  if (proj && manualDelivery && isReadiness) {
    // Коммент держим непубличным до завершения доставки, затем публикуем клиенту (в фоне, чтобы не блокировать апрув).
    const meta = proj.meta;
    after(async () => {
      try { await autoDeliverAndNotify(r.project_key, meta, r.readable_id); } catch { /* ошибки авто-доставки репортятся внутри */ }
      await q("UPDATE comments SET approved = true WHERE id = $1", [commentId]).catch(() => {});
      await logTaskEvent(r.readable_id, { type: "comment_moderated", to: "approved", actorRole: "admin", trigger: "Lambertain схвалив → доставка → публікація клієнту", details: { commentId } }).catch(() => {});
      await publishApprovedToClient(r).catch(() => {});
    });
    return { taskId: r.readable_id };
  }

  await q("UPDATE comments SET approved = true WHERE id = $1", [commentId]);
  // DEV-32: журнал — коммент команды одобрен модерацией и стал виден клиенту.
  await logTaskEvent(r.readable_id, { type: "comment_moderated", to: "approved", actorRole: "admin", trigger: "Lambertain схвалив → опубліковано клієнту", details: { commentId } });
  await publishApprovedToClient(r);
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
  const r = await commentInfo(commentId);
  await q("UPDATE comments SET approved = true, visibility = 'internal' WHERE id = $1 AND approved = false", [commentId]);
  // DEV-32: журнал — модерация отклонила коммент клиенту (остался внутренним).
  if (r) await logTaskEvent(r.readable_id, { type: "comment_moderated", to: "rejected", actorRole: "admin", trigger: "Lambertain відхилив → лишився внутрішнім", details: { commentId } });
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

/**
 * Супер-админ при редактировании переводит ВНУТРЕННИЙ коммент в ВИДИМЫЙ КЛИЕНТУ: публикует (approved, visibility=client)
 * и уведомляет клиента проекта. Текст можно заодно отредактировать. Так внутреннюю заметку можно «открыть» клиенту.
 */
export async function makeCommentClientVisible(commentId: string, body: string): Promise<{ taskId: string } | { error: string }> {
  if (!body.trim()) return { error: "empty" };
  await q("UPDATE comments SET body = $2, visibility = 'client', approved = true WHERE id = $1", [commentId, body]);
  const r = await commentInfo(commentId);
  if (!r) return { error: "not found" };
  await mirrorCommentToTrello(r.readable_id, r.body).catch(() => {}); // портал → Trello (если подключена доска)
  await notifyProjectClients(
    r.project_key,
    `💬 <b>${r.project_name} · ${r.readable_id}</b>: ${r.summary}\n${r.body.slice(0, 400)}`,
    attachmentIdsIn(r.body),
    taskBtn(r.readable_id),
  ).catch(() => {});
  return { taskId: r.readable_id };
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
