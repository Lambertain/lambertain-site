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
import { isTransientGhError } from "./github";
import { bumpFailStreak, clearFailStreak } from "./db";

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

/** Порог: сколько проходов поллера подряд должен держаться ТРАНЗИТНЫЙ сбой GitHub, прежде чем эскалировать. */
const TRANSIENT_ESCALATE_AT = 3;

/**
 * Репорт ошибки из ПОЛЛЕРА (deploy-sync и т.п.), терпимый к транзитным сбоям GitHub.
 * Транзитный блип (5xx/429/сеть) самоисправляется следующим проходом — курсоры не двигаются, потерь нет,
 * поэтому админа сразу не дёргаем: копим счётчик per-ключ и эскалируем, только если сбой держится
 * TRANSIENT_ESCALATE_AT проходов подряд (устойчивая деградация). Неретрайные/логические ошибки
 * (404/422/бэд-URL) — эскалируем сразу. На успешном проходе вызвать clearPollError(streakKey).
 * @param streakKey стабильный ключ единицы работы, напр. "ghfail:review:SAD-21:<prUrl>".
 * @returns true, если ошибку эскалировали.
 */
export async function reportPollError(streakKey: string, taskId: string, where: string, err: unknown): Promise<boolean> {
  if (isTransientGhError(err)) {
    const streak = await bumpFailStreak(streakKey).catch(() => TRANSIENT_ESCALATE_AT); // не смогли посчитать → лучше показать
    if (streak < TRANSIENT_ESCALATE_AT) return false; // самоисправляющийся блип — тихо, следующий проход подтянет
    // Уже эскалировали — НЕ долбим админа каждый проход поллера (5 мин): сообщаем на 1-й эскалации (streak===3)
    // и далее лишь раз в ~час (каждый 12-й проход). Иначе стойкий сбой GitHub (напр. rate-limit на 2 часа)
    // заваливает уведомлениями по каждому PR × каждый проход (был флуд ~200 повідомлень).
    if (streak > TRANSIENT_ESCALATE_AT && (streak - TRANSIENT_ESCALATE_AT) % 12 !== 0) return false;
  }
  await reportTaskError(taskId, where, err);
  return true;
}

/** Сбросить счётчик транзитных сбоев (успешный проход поллера по этому ключу). */
export async function clearPollError(streakKey: string): Promise<void> {
  await clearFailStreak(streakKey).catch(() => {});
}
