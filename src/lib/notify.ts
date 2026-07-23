/** Отправка уведомлений в Telegram (адресно по ролям + картинки). Server-side only. */
import { q, getAttachment, logNotification, createNotification, wasRecentlyNotified, enqueuePendingNotification, takePendingNotifications } from "./db";
import { PUBLIC_SITE, PORTAL_BASE } from "./dev-protocol";

/** Кнопка-ссылка под сообщением. */
export interface LinkButton { text: string; url: string }

/**
 * Inline-кнопка для Telegram. Ссылки на задачу (`/admin/tasks/<id>`) открываем как **web_app** (Mini App):
 * он авторизуется через Telegram (без выброса на логин) и диплинком ведёт на задачу. Домен — публичный (кастомный).
 * Остальные ссылки — обычная url-кнопка.
 */
function inlineButton(button: LinkButton): Record<string, unknown> {
  const m = button.url.match(/\/admin\/tasks\/([^/?#]+)/);
  if (m) return { text: button.text, web_app: { url: `${PUBLIC_SITE}/tma?task=${encodeURIComponent(m[1])}` } };
  return { text: button.text, url: button.url };
}

/** Отправка текста в произвольный чат Telegram (опц. кнопка). Пишет результат в notifications_log. */
export async function sendTo(chatId: number | string, text: string, button?: LinkButton): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return false;
  // DEV-12: схлопывание дублей — не слать тот же текст в тот же чат повторно за короткое окно.
  if (await wasRecentlyNotified(chatId, text)) return false;
  let ok = false;
  let error: string | null = null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(button ? { reply_markup: { inline_keyboard: [[inlineButton(button)]] } } : {}),
      }),
    });
    ok = r.ok;
    if (!r.ok) error = (await r.text().catch(() => "")).slice(0, 300); // напр. «bot was blocked by the user»
  } catch (e) {
    error = e instanceof Error ? e.message : "fetch error";
  }
  await logNotification(chatId, text, ok, error);
  return true;
}

/** Уведомление админу (Никите). */
export async function notifyAdmin(text: string, button?: LinkButton, excludeTgId?: number): Promise<void> {
  const chat = process.env.TELEGRAM_CHAT_ID;
  // Не слать автору действия (он сам это сделал) — напр. супер-админ написал коммент.
  if (chat && (excludeTgId == null || Number(chat) !== excludeTgId)) {
    await recordNotifications([Number(chat)], text, button);
    await sendTo(chat, text, button);
  }
}

/**
 * Единый ярлык задачи для ВСЕХ уведомлений (всем ролям): «Название проекта · СЛАГ».
 * Проектов много, по слагам их не запомнить — поэтому в каждом пуше пишем и имя проекта.
 * Ключ проекта берём из слага (`ZR-12` → `ZR`); если проект не найден — отдаём просто слаг.
 */
export async function taskTag(taskId: string): Promise<string> {
  const key = String(taskId).split("-")[0];
  if (!key) return taskId;
  const rows = await q<{ name: string }>("SELECT name FROM projects WHERE key = $1", [key]);
  return rows[0]?.name ? `${rows[0].name} · ${taskId}` : taskId;
}

/** Telegram @username по числовому tg_id (через getChat). null, если ника нет/недоступен. Best-effort. */
export async function tgUsernameById(tgId: string | number | null | undefined): Promise<string | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !tgId) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${tgId}`, { cache: "no-store" });
    const j = (await r.json()) as { ok?: boolean; result?: { username?: string } };
    return j?.ok ? j.result?.username || null : null;
  } catch {
    return null;
  }
}

/** id вложений (/api/files/<id>) из текста — чтобы дослать их картинками. */
export function attachmentIdsIn(...texts: (string | null | undefined)[]): number[] {
  const ids = new Set<number>();
  for (const t of texts) {
    if (!t) continue;
    const re = /\/api\/files\/(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) ids.add(Number(m[1]));
  }
  return [...ids];
}

/** Отправить картинку (байты из БД) в чат. */
async function sendPhoto(chatId: number | string, mime: string | null, data: Buffer): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("photo", new Blob([new Uint8Array(data)], { type: mime || "image/png" }), "image.png");
    await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: "POST", body: form });
  } catch {
    // best-effort
  }
}

/** Отправить НЕСКОЛЬКО картинок одним альбомом (2..10), чтобы не флудить отдельным сообщением на каждое фото (DEV-20). */
async function sendMediaGroup(chatId: number | string, photos: { mime: string | null; data: Buffer }[]): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("media", JSON.stringify(photos.map((_, i) => ({ type: "photo", media: `attach://p${i}` }))));
    photos.forEach((p, i) => form.append(`p${i}`, new Blob([new Uint8Array(p.data)], { type: p.mime || "image/png" }), `image${i}.png`));
    await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, { method: "POST", body: form });
  } catch {
    // best-effort
  }
}

/** tg_id по логинам (привязанные к боту). */
async function tgIdsForLogins(logins: string[]): Promise<number[]> {
  const arr = logins.filter(Boolean);
  if (!arr.length) return [];
  const rows = await q<{ tg_id: number }>("SELECT DISTINCT tg_id FROM tg_links WHERE youtrack_login = ANY($1::text[])", [arr]);
  return rows.map((r) => r.tg_id);
}

/** tg_id участников проекта с указанными ролями (клиент/сотрудник). Учитывает и tg_links.project_key,
 *  и member_projects (сотрудник может вести несколько проектов — иначе рассылка по «не первому» его пропустит). */
async function tgIdsForProject(projectKey: string, roles: string[]): Promise<number[]> {
  const rows = await q<{ tg_id: number }>(
    `SELECT DISTINCT l.tg_id FROM tg_links l
      WHERE l.role = ANY($2::text[])
        AND ( l.project_key = $1
              OR EXISTS (SELECT 1 FROM member_projects mp WHERE mp.login = l.youtrack_login AND mp.project_key = $1) )`,
    [projectKey, roles],
  );
  return rows.map((r) => r.tg_id);
}

/** Метаданные уведомления (колокольчик) из текста+кнопки: id задачи (из URL), проект, заголовок. */
const TASK_URL_RE = /\/admin\/tasks\/([A-Za-z0-9]+-\d+)/;
function notifMeta(text: string, button?: LinkButton): { taskId: string | null; projectKey: string | null; title: string; link: string | null } {
  const url = button?.url ?? null;
  const m = url ? url.match(TASK_URL_RE) : null;
  const taskId = m ? m[1] : null;
  const title = text.replace(/<[^>]+>/g, "").split("\n").map((s) => s.trim()).filter(Boolean).join(" — ").slice(0, 180);
  return { taskId, projectKey: taskId ? taskId.split("-")[0] : null, title, link: url };
}

/** Записать уведомление в колокольчик каждому получателю (best-effort, не валит отправку). */
async function recordNotifications(targets: number[], text: string, button?: LinkButton): Promise<void> {
  const meta = notifMeta(text, button);
  if (!meta.title) return;
  for (const tg of targets) {
    await createNotification(tg, meta).catch(() => {});
  }
}

/** Возвращает число получателей (привязанных к боту), которым реально ушло уведомление. 0 → доставить было некому. */
async function sendWithImages(chatIds: number[], text: string, attachmentIds: number[], button?: LinkButton, excludeTgId?: number): Promise<number> {
  // Исключаем автора действия — он не должен получать пуш/уведомление о собственном комменте/задаче.
  const targets = excludeTgId != null ? chatIds.filter((id) => id !== excludeTgId) : chatIds;
  if (!targets.length) return 0;
  await recordNotifications(targets, text, button);
  // Картинки грузим один раз, шлём каждому.
  const photos = (await Promise.all(attachmentIds.map((id) => getAttachment(id)))).filter(Boolean) as { mime: string | null; data: Buffer }[];
  for (const chatId of targets) {
    const sent = await sendTo(chatId, text, button);
    if (!sent) continue; // дубль (DEV-12) → фото тоже не шлём
    // Фото — одним альбомом на каждые 10 (Telegram-лимит), а не отдельным сообщением на каждое (DEV-20).
    for (let i = 0; i < photos.length; i += 10) {
      const chunk = photos.slice(i, i + 10);
      if (chunk.length === 1) await sendPhoto(chatId, chunk[0].mime, chunk[0].data);
      else await sendMediaGroup(chatId, chunk);
    }
  }
  return targets.length;
}

/** Уведомить по логинам (разработчик/сотрудник/клиент). Возвращает число получателей. excludeTgId — автор, ему не слать. */
export async function notifyLogins(logins: string[], text: string, attachmentIds: number[] = [], button?: LinkButton, excludeTgId?: number): Promise<number> {
  return sendWithImages(await tgIdsForLogins(logins), text, attachmentIds, button, excludeTgId);
}

/** Уведомить клиента/сотрудника проекта. Возвращает число получателей (0 → клиент не подключён к боту). */
export async function notifyProjectClients(projectKey: string, text: string, attachmentIds: number[] = [], button?: LinkButton, excludeTgId?: number): Promise<number> {
  const ids = await tgIdsForProject(projectKey, ["client", "employee"]);
  const n = await sendWithImages(ids, text, attachmentIds, button, excludeTgId);
  // Никого из клиентов/сотрудников проекта нет в боте → не теряем событие: откладываем до его присоединения.
  if (ids.length === 0) await enqueuePendingNotification(projectKey, text, button).catch(() => {});
  return n;
}

/**
 * Досыл отложенных клиентских уведомлений присоединившемуся клиенту/сотруднику: пока он не был подключён к боту,
 * события копились (enqueuePendingNotification); при привязке доставляем их (пуш + колокольчик) в хронологическом
 * порядке по каждому его проекту. Возвращает число досланных. Вызывать после создания tg-привязки.
 */
export async function flushPendingForClient(tgId: number, role: string, projectKeys: string[]): Promise<number> {
  let sent = 0;
  for (const pk of projectKeys.filter(Boolean)) {
    const rows = await takePendingNotifications(pk, role);
    for (const r of rows) {
      const button = r.button_url ? { text: r.button_text || "Відкрити", url: r.button_url } : undefined;
      await sendWithImages([tgId], r.text, attachmentIdsIn(r.text), button);
      sent++;
    }
  }
  return sent;
}

/** То же по логину (когда tg_id под рукой нет): резолвит привязку и досылает. Для уже привязанного участника,
 *  которого добавили в новый проект с накопленными уведомлениями. */
export async function flushPendingForLogin(login: string, role: string, projectKeys: string[]): Promise<number> {
  let sent = 0;
  for (const tgId of await tgIdsForLogins([login])) sent += await flushPendingForClient(tgId, role, projectKeys);
  return sent;
}

/** Привязан ли к боту хоть один клиент/сотрудник проекта (т.е. дойдёт ли до клиента уведомление). */
export async function hasLinkedClient(projectKey: string): Promise<boolean> {
  return (await tgIdsForProject(projectKey, ["client", "employee"])).length > 0;
}

/**
 * Предупредить команду (постановщика-разработчика + админа), что клиент ещё не подключён к боту.
 * Уведомление не потеряно — оно отложено (pending_notifications) и будет доставлено автоматически при
 * присоединении клиента; предупреждение нужно, чтобы разработчик знал, почему клиент пока молчит по задаче.
 */
export async function warnClientUnreachable(projectKey: string, taskId: string, summary: string, devLogin?: string | null): Promise<void> {
  const btn = { text: "Відкрити задачу", url: `${PORTAL_BASE}/admin/tasks/${taskId}` };
  const msg = `⚠️ <b>Клієнт ще не приєднався</b> · ${await taskTag(taskId)}: ${summary}\nКлієнт проєкту «${projectKey}» не підключений до бота — сповіщення відкладено й буде доставлено автоматично, щойно він приєднається.`;
  await notifyAdmin(msg, btn).catch(() => {});
  if (devLogin) await notifyLogins([devLogin], msg, [], btn).catch(() => {});
}
