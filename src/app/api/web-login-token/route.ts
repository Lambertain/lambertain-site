/**
 * Выдаёт одноразовый токен для входа в веб-версию из Mini App.
 * Доступно только авторизованному Telegram-пользователю (есть tgId).
 */
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getPrincipal } from "@/lib/principal";
import { createWebLoginToken } from "@/lib/db";

export async function POST() {
  const me = await getPrincipal();
  if (!me || !me.tgId) {
    return NextResponse.json({ ok: false, error: "no telegram session" }, { status: 403 });
  }
  const token = randomBytes(24).toString("hex");
  await createWebLoginToken(token, me.tgId, 5); // 5 минут
  return NextResponse.json({ ok: true, token });
}
