/**
 * Видимый репорт ошибок: вместо молчаливого `.catch(() => {})` — пишем причину сбоя
 * ВНУТРЕННИМ комментом прямо в задачу (видно на портале) + уведомляем админа в Telegram.
 * Клиенту такие комменты не видны (visibility:internal). Server-side only.
 *
 * Дедуп: поллер дёргает синки каждые 5 мин, поэтому при устойчивой ошибке (PR недоступен,
 * rate limit) не плодим один и тот же коммент — если последний коммент задачи уже про эту же
 * операцию (`where`), новый не добавляем (только при смене текста ошибки).
 */
import { getBackend } from "./tasks";
import { notifyAdmin, taskTag } from "./notify";
import { PORTAL_BASE } from "./dev-protocol";

const MARK = "⚠️ <b>Помилка"; // префикс коммента-ошибки (для дедупа)

/**
 * Записать ошибку в задачу (internal-коммент) и уведомить админа.
 * @param taskId  читаемый id задачи (напр. SAD-20)
 * @param where   что именно сорвалось (короткой фразой, попадёт в заголовок)
 * @param err     ошибка/текст
 * @param opts.dedupe  не дублировать, если такой же коммент уже последний (по умолчанию true)
 */
export async function reportTaskError(
  taskId: string,
  where: string,
  err: unknown,
  opts: { dedupe?: boolean } = {},
): Promise<void> {
  const dedupe = opts.dedupe !== false;
  const msg = (err instanceof Error ? err.message : String(err ?? "невідома помилка")).slice(0, 500);
  const body = `${MARK}: ${where}</b>\n\n<code>${msg}</code>`;
  const be = getBackend();
  try {
    if (dedupe) {
      const comments = await be.getComments(taskId).catch(() => []);
      const last = comments[comments.length - 1];
      // тот же блок ошибки про ту же операцию уже стоит последним — не дублируем
      if (last && last.text.startsWith(`${MARK}: ${where}</b>`) && last.text.includes(msg)) return;
    }
    await be.addComment(taskId, body, "internal", undefined, true, false).catch(() => {});
  } catch { /* даже репорт ошибки не должен ронять фон */ }
  await notifyAdmin(
    `⚠️ <b>${await taskTag(taskId).catch(() => taskId)}</b> · ${where}\n${msg}`,
    { text: "Відкрити задачу", url: `${PORTAL_BASE}/admin/tasks/${taskId}` },
  ).catch(() => {});
}
