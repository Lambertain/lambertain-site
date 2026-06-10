/**
 * Новый пользователь выбрал роль (Клиент/Разработчик) в Mini App.
 * Сохраняем заявку и уведомляем админа. Доступ активирует админ вручную.
 */
import { NextResponse } from "next/server";
import { validateInitData } from "@/lib/telegram-auth";
import { upsertAccessRequest } from "@/lib/db";
import { notifyAdmin } from "@/lib/notify";
import type { Role } from "@/lib/tasks/types";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { initData?: string; role?: string };
  const result = validateInitData(body.initData || "");
  if (!result) {
    return NextResponse.json({ ok: false, error: "invalid initData" }, { status: 401 });
  }
  const role: Role | null =
    body.role === "client" ? "client" : body.role === "contributor" ? "contributor" : null;
  if (!role) {
    return NextResponse.json({ ok: false, error: "bad role" }, { status: 400 });
  }

  const { user } = result;
  await upsertAccessRequest(user.id, user.username ?? null, user.firstName ?? null, role);

  const roleRu = role === "client" ? "Клиент" : "Разработчик";
  const uname = user.username ? `@${user.username}` : `id ${user.id}`;
  await notifyAdmin(
    `🔑 <b>Заявка на доступ</b>\n${user.firstName || ""} (${uname})\nРоль: <b>${roleRu}</b>\n` +
      `Подтвердить: раздел «Команда» в портале.`,
  );

  return NextResponse.json({ ok: true });
}
