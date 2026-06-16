/**
 * Лог отправленных уведомлений (для проверки «дошло/не дошло» — без захода в БД).
 * GET /api/admin/notifications?login=<login>&task=<KEY-N>&limit=50
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { getRecentNotifications } from "@/lib/db";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function GET(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const rows = await getRecentNotifications({
    login: sp.get("login")?.trim() || undefined,
    taskId: sp.get("task")?.trim() || undefined,
    limit: Number(sp.get("limit") || 50),
  });
  return NextResponse.json({ count: rows.length, notifications: rows });
}
