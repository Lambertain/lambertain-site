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
import { isTransientGhError, GitHubError } from "./github";
import { bumpFailStreak, clearFailStreak, getState, setState } from "./db";

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

// Глобальный троттл эскалаций ТРАНЗИТНЫХ сбоев GitHub. Инцидент GitHub (5xx/429) роняет СРАЗУ МНОГО PR/задач,
// и раньше каждый ключ эскалировал отдельно → за ночь панель админа забивало десятками ⚠️ (по одному на PR).
// Схлопываем в ОДНО общее уведомление не чаще раза в час, независимо от числа затронутых задач. Деталь по
// каждой задаче остаётся в логе сервера. Ключ/окно храним в poller_state (переживает рестарты).
const GH_TRANSIENT_NOTIFY_KEY = "poller:gh-transient:notifiedAt";
const GH_TRANSIENT_WINDOW_MS = 60 * 60_000;

/**
 * Репорт ошибки из ПОЛЛЕРА (deploy-sync: проверка мержа/публикации, зеркалирование ревью), терпимый к
 * транзитным сбоям GitHub. DEV-51: ошибки синка (rate-limit тощо) в ТРЕД ЗАДАЧИ НЕ пишем — только админу/в лог,
 * иначе сотни одинаковых «⚠️ Помилка … rate limit» забивают тред и топят реальный фидбек ревьюера.
 * Транзитный блип (5xx/429/сеть) самоисправляется следующим проходом — курсоры/маппинг не двигаются, потерь нет,
 * поэтому админа сразу не дёргаем: копим счётчик per-ключ и эскалируем, только если сбой держится
 * TRANSIENT_ESCALATE_AT проходов подряд (устойчивая деградация). Неретрайные/логические ошибки
 * (404/422/бэд-URL) — эскалируем сразу. На успешном проходе вызвать clearPollError(streakKey).
 * @param streakKey стабильный ключ единицы работы, напр. "ghfail:review:SAD-21:<prUrl>".
 * @returns true, если ошибку эскалировали (уведомили админа).
 */
export async function reportPollError(streakKey: string, taskId: string, where: string, err: unknown): Promise<boolean> {
  const msg = (err instanceof Error ? err.message : String(err ?? "невідома помилка")).slice(0, 500);
  if (isTransientGhError(err)) {
    const streak = await bumpFailStreak(streakKey).catch(() => TRANSIENT_ESCALATE_AT); // не смогли посчитать → лучше показать
    if (streak < TRANSIENT_ESCALATE_AT) return false; // самоисправляющийся блип — тихо, следующий проход подтянет
    console.error(`[poll-error] ${taskId} · ${where}: ${msg}`); // деталь по КАЖДОЙ задаче — в лог, не в панель
    // Системная деградация GitHub бьёт по многим ключам разом: НЕ шлём по одному ⚠️ на каждый PR (был флуд —
    // за ночь десятки уведомлений). Одно общее уведомление на окно (раз в час), затронутые задачи видны в логе.
    const now = Date.now();
    const lastMs = Number(await getState(GH_TRANSIENT_NOTIFY_KEY).catch(() => "0")) || 0;
    if (now - lastMs < GH_TRANSIENT_WINDOW_MS) return false; // уже предупредили в этом окне
    await setState(GH_TRANSIENT_NOTIFY_KEY, String(now)).catch(() => {});
    const status = err instanceof GitHubError ? err.status : null;
    await notifyAdmin(
      `⏳ <b>GitHub API тимчасово віддає помилки${status ? ` (${status})` : ""}</b> — автосинхронізація стадій і код-рев'ю кількох задач на паузі. Відновиться сама, дій не потрібно.`,
    ).catch(() => {});
    return true;
  }
  // Неретрайная/логическая ошибка (404/422/бэд-URL) — реальная, редкая, актуальна: эскалируем сразу ПО ЗАДАЧЕ.
  console.error(`[poll-error] ${taskId} · ${where}: ${msg}`);
  await notifyAdmin(
    `⚠️ <b>${await taskTag(taskId).catch(() => taskId)}</b> · ${where}\n${msg}`,
    { text: "Відкрити задачу", url: `${PORTAL_BASE}/admin/tasks/${taskId}` },
  ).catch(() => {});
  return true;
}

/** Сбросить счётчик транзитных сбоев (успешный проход поллера по этому ключу). */
export async function clearPollError(streakKey: string): Promise<void> {
  await clearFailStreak(streakKey).catch(() => {});
}
