/**
 * Точечная «прочитка» уведомлений-ошибок поллера/авто-синка в колокольчике админа.
 * Нужна, чтобы разгрести флуд разрешённых сбоев (напр. шторм GitHub rate-limit, уже устранён),
 * НЕ трогая настоящие уведомления (комменты/задачи/ответы клиента). Получатель — админ (TELEGRAM_CHAT_ID).
 *   GET  /api/admin/notify-cleanup  → предпросмотр: какие непрочитанные попадут под пометку (dry-run).
 *   POST /api/admin/notify-cleanup  → пометить их прочитанными; вернёт сколько помечено и сколько осталось.
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { listPollerErrorNotifications, markPollerErrorNotificationsRead, countUnreadNotifications } from "@/lib/db";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

function adminTg(): number | null {
  const chat = process.env.TELEGRAM_CHAT_ID;
  return chat ? Number(chat) : null;
}

export async function GET(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });
  const tg = adminTg();
  if (tg == null) return NextResponse.json({ error: "TELEGRAM_CHAT_ID not configured" }, { status: 503 });

  const rows = await listPollerErrorNotifications(tg);
  const totalUnread = await countUnreadNotifications(tg);
  return NextResponse.json({ matched: rows.length, totalUnread, titles: rows.map((r) => r.title) });
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });
  const tg = adminTg();
  if (tg == null) return NextResponse.json({ error: "TELEGRAM_CHAT_ID not configured" }, { status: 503 });

  const marked = await markPollerErrorNotificationsRead(tg);
  const remainingUnread = await countUnreadNotifications(tg);
  return NextResponse.json({ ok: true, marked, remainingUnread });
}
