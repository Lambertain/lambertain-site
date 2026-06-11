/** Отправка уведомлений в Telegram (адресно по ролям + картинки). Server-side only. */
import { q, getAttachment } from "./db";

/** Отправка текста в произвольный чат Telegram. */
export async function sendTo(chatId: number | string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
  } catch {
    // best-effort
  }
}

/** Уведомление админу (Никите). */
export async function notifyAdmin(text: string): Promise<void> {
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (chat) await sendTo(chat, text);
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

/** tg_id участников проекта с указанными ролями (клиент/сотрудник). */
async function tgIdsForProject(projectKey: string, roles: string[]): Promise<number[]> {
  const rows = await q<{ tg_id: number }>(
    "SELECT DISTINCT tg_id FROM tg_links WHERE project_key = $1 AND role = ANY($2::text[])",
    [projectKey, roles],
  );
  return rows.map((r) => r.tg_id);
}

async function sendWithImages(chatIds: number[], text: string, attachmentIds: number[]): Promise<void> {
  if (!chatIds.length) return;
  // Картинки грузим один раз, шлём каждому.
  const photos = (await Promise.all(attachmentIds.map((id) => getAttachment(id)))).filter(Boolean) as { mime: string | null; data: Buffer }[];
  for (const chatId of chatIds) {
    await sendTo(chatId, text);
    for (const p of photos) await sendPhoto(chatId, p.mime, p.data);
  }
}

/** Уведомить по логинам (разработчик/сотрудник/клиент) с картинками. */
export async function notifyLogins(logins: string[], text: string, attachmentIds: number[] = []): Promise<void> {
  await sendWithImages(await tgIdsForLogins(logins), text, attachmentIds);
}

/** Уведомить клиента/сотрудника проекта с картинками. */
export async function notifyProjectClients(projectKey: string, text: string, attachmentIds: number[] = []): Promise<void> {
  await sendWithImages(await tgIdsForProject(projectKey, ["client", "employee"]), text, attachmentIds);
}
