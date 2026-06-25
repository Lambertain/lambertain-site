/**
 * Карточка участника по логину: роль, Telegram-ник, проекты.
 * GET /api/admin/member?login=apalonov
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { memberCard } from "@/lib/db";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function GET(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  const login = new URL(req.url).searchParams.get("login");
  if (!login) return NextResponse.json({ error: "login required" }, { status: 400 });
  const card = await memberCard(login);
  if (!card) return NextResponse.json({ error: `участник ${login} не найден` }, { status: 404 });
  return NextResponse.json(card);
}
