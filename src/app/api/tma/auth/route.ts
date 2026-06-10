/**
 * Авторизация Telegram Mini App: фронт присылает initData, сервер валидирует подпись.
 * - admin / привязанный пользователь -> сессия + роль.
 * - есть инвайт в start_param -> привязка и вход.
 * - иначе -> needRole: апка покажет выбор роли.
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
  if (startParam) await redeemInvite(startParam, user);

  let role: string | null = null;
  if (adminId && user.id === adminId) role = "admin";
  else role = (await getLinkByTgId(user.id))?.role ?? null;

  if (!role) {
    return NextResponse.json({
      ok: false,
      needRole: true,
      user: { id: user.id, firstName: user.firstName, username: user.username },
    });
  }

  await setSession(`tg:${user.id}`);
  return NextResponse.json({ ok: true, role });
}
