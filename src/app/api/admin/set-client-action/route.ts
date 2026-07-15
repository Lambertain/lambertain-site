/**
 * Задать/переписать ops-шаг ожидания КЛИЕНТА у задачи (admin-токен): текст инструкции («що зареєструвати/надати»),
 * id гайда-инструкции и поле каталога для данных. Нужно, когда инструкцию нужно поправить вручную
 * (напр. сменили сервис: SendGrid → Resend) — clear-action только снимает, а этот эндпоинт ставит новый текст.
 * НЕ шлёт уведомлений (пуш/коммент клиенту слать отдельно через /api/admin/comment) — только правит поля задачи.
 * POST /api/admin/set-client-action  { readableId, action, guideId?, field? }
 *   action        — текст инструкции клиенту (укр.). Пустая строка/пропуск запрещён (для снятия — /api/admin/clear-action).
 *   guideId?      — id гайда из каталога (число) или null. Если не передан — сохраняется текущий гайд задачи.
 *   field?        — поле каталога "fieldKey.subKey" (куда клиент впишет данные) или null. Если не передан — текущее.
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { readJsonSmart } from "@/lib/req-body";
import { getBackend } from "@/lib/tasks";
import { setClientAction } from "@/lib/db";
import { revalidatePath } from "next/cache";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let b: { readableId?: string; action?: string; guideId?: number | null; field?: string | null };
  try { b = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const readableId = String(b.readableId || "").trim();
  const action = String(b.action ?? "").trim();
  if (!readableId) return NextResponse.json({ error: "readableId обязателен" }, { status: 400 });
  if (!action) return NextResponse.json({ error: "action (текст инструкции) обязателен; для снятия — /api/admin/clear-action" }, { status: 400 });

  const be = getBackend();
  let task;
  try { task = await be.getTask(readableId); } catch { return NextResponse.json({ error: `Задача ${readableId} не найдена` }, { status: 404 }); }

  // guideId/field: если не переданы — сохраняем текущие значения задачи (не обнуляем).
  const guideId = b.guideId === undefined ? (task.clientActionGuide ?? null) : (b.guideId === null ? null : Number(b.guideId));
  const field = b.field === undefined ? (task.clientActionField ?? null) : (b.field === null ? null : String(b.field).trim() || null);
  if (guideId !== null && !Number.isFinite(guideId)) return NextResponse.json({ error: "guideId должен быть числом или null" }, { status: 400 });

  await setClientAction(readableId, action, guideId, field);

  revalidatePath(`/admin/tasks/${readableId}`);
  revalidatePath("/admin");
  return NextResponse.json({ ok: true, readableId, guideId, field });
}
