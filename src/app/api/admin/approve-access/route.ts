/**
 * Подтвердить заявку на доступ: привязать Telegram-пользователя к роли и проекту, удалить заявку.
 * POST /api/admin/approve-access  { tgId, projectKey, role? }
 *   role — переопределить роль из заявки (опц.). projectKey обязателен для client/contributor/employee.
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { approveAccessRequest } from "@/lib/db";
import { sendTo, flushPendingForClient } from "@/lib/notify";
import { readJsonSmart } from "@/lib/req-body";
import { revalidatePath } from "next/cache";
import type { Role } from "@/lib/tasks/types";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let body: { tgId?: number | string; projectKey?: string; role?: string };
  try { body = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const tgId = Number(body.tgId);
  const projectKey = String(body.projectKey || "").trim().toUpperCase();
  const role = body.role ? (String(body.role).trim() as Role) : undefined;
  if (!Number.isFinite(tgId)) return NextResponse.json({ error: "tgId обязателен" }, { status: 400 });

  const res = await approveAccessRequest(tgId, projectKey, role);
  if ("error" in res) return NextResponse.json(res, { status: 404 });
  await sendTo(tgId, "✅ Доступ открыт. Откройте PM-портал через меню бота — теперь вы авторизованы.").catch(() => {});
  // Досылаем накопившиеся уведомления проекта (пока клиент/сотрудник не был подключён к боту).
  if ((res.role === "client" || res.role === "employee") && projectKey) await flushPendingForClient(tgId, res.role, [projectKey]).catch(() => {});
  revalidatePath("/admin/team");
  return NextResponse.json({ ok: true, ...res, projectKey });
}
