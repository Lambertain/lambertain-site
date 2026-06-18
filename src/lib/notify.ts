/** Отправка уведомлений в Telegram (адресно по ролям + картинки). Server-side only. */
import { q, getAttachment, logNotification } from "./db";
import { PUBLIC_SITE } from "./dev-protocol";

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
export async function sendTo(chatId: number | string, text: string, button?: LinkButton): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;
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
}

/** Уведомление админу (Никите). */
export async function notifyAdmin(text: string, button?: LinkButton, excludeTgId?: number): Promise<void> {
  const chat = process.env.TELEGRAM_CHAT_ID;
  // Не слать автору действия (он сам это сделал) — напр. супер-админ написал коммент.
  if (chat && (excludeTgId == null || Number(chat) !== excludeTgId)) await sendTo(chat, text, button);
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

async function sendWithImages(chatIds: number[], text: string, attachmentIds: number[], button?: LinkButton, excludeTgId?: number): Promise<void> {
  // Исключаем автора действия — он не должен получать пуш о собственном комменте/задаче.
  const targets = excludeTgId != null ? chatIds.filter((id) => id !== excludeTgId) : chatIds;
  if (!targets.length) return;
  // Картинки грузим один раз, шлём каждому.
  const photos = (await Promise.all(attachmentIds.map((id) => getAttachment(id)))).filter(Boolean) as { mime: string | null; data: Buffer }[];
  for (const chatId of targets) {
    await sendTo(chatId, text, button);
    for (const p of photos) await sendPhoto(chatId, p.mime, p.data);
  }
}

/** Уведомить по логинам (разработчик/сотрудник/клиент) с картинками и опц. кнопкой-ссылкой. excludeTgId — автор, ему не слать. */
export async function notifyLogins(logins: string[], text: string, attachmentIds: number[] = [], button?: LinkButton, excludeTgId?: number): Promise<void> {
  await sendWithImages(await tgIdsForLogins(logins), text, attachmentIds, button, excludeTgId);
}

/** Уведомить клиента/сотрудника проекта с картинками и опц. кнопкой-ссылкой. excludeTgId — автор, ему не слать. */
export async function notifyProjectClients(projectKey: string, text: string, attachmentIds: number[] = [], button?: LinkButton, excludeTgId?: number): Promise<void> {
  await sendWithImages(await tgIdsForProject(projectKey, ["client", "employee"]), text, attachmentIds, button, excludeTgId);
}
