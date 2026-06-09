/**
 * Авторизация Telegram Mini App: фронт присылает initData,
 * сервер валидирует подпись, при наличии инвайта привязывает пользователя,
 * ставит сессионную куку и возвращает роль.
 */
import { NextResponse } from "next/server";
import { validateInitData } from "@/lib/telegram-auth";
import { redeemInvite } from "@/lib/invites";
import { setSession } from "@/lib/auth";
import { getLinkByTgId } from "@/lib/db";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { initData?: string };
  const result = validateInitData(body.initData || "");
  if (!result) {
    return NextResponse.json({ ok: false, error: "invalid initData" }, { status: 401 });
  }

  const { user, startParam } = result;
  const adminId = process.env.ADMIN_TELEGRAM_ID ? Number(process.env.ADMIN_TELEGRAM_ID) : null;

  // Инвайт в start_param — пробуем привязать.
  if (startParam) await redeemInvite(startParam, user);

  // Резолвим роль.
  let role: string | null = null;
  if (adminId && user.id === adminId) {
    role = "admin";
  } else {
    const link = await getLinkByTgId(user.id);
    role = link?.role ?? null;
  }

  if (!role) {
    // Авторизация Telegram прошла, но пользователь не привязан — нужен инвайт.
    return NextResponse.json({ ok: false, error: "not_linked", needInvite: true }, { status: 403 });
  }

  await setSession(`tg:${user.id}`);
  return NextResponse.json({ ok: true, role });
}
