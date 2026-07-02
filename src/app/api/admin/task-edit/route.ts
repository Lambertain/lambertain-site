/**
 * Редактирование полей задачи админ-токеном (для скриптов/Claude без сессии портала).
 * POST /api/admin/task-edit  { readableId, title?, description?, priority?, assigneeLogin? }
 *   Меняет только переданные поля (undefined — не трогаем). assigneeLogin:null снимает исполнителя.
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { readJsonSmart } from "@/lib/req-body";
import { getBackend } from "@/lib/tasks";
import { updateTaskFields } from "@/lib/db";
import { revalidatePath } from "next/cache";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let b: { readableId?: string; title?: string; description?: string; priority?: string | null; assigneeLogin?: string | null };
  try { b = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const readableId = String(b.readableId || "").trim();
  if (!readableId) return NextResponse.json({ error: "readableId обязателен" }, { status: 400 });

  const be = getBackend();
  try { await be.getTask(readableId); } catch { return NextResponse.json({ error: `Задача ${readableId} не найдена` }, { status: 404 }); }

  const fields: { title?: string; description?: string; priority?: string | null; assigneeLogin?: string | null } = {};
  if (typeof b.title === "string") fields.title = b.title.trim().slice(0, 200);
  if (typeof b.description === "string") fields.description = b.description;
  if (b.priority !== undefined) fields.priority = b.priority;
  if (b.assigneeLogin !== undefined) fields.assigneeLogin = b.assigneeLogin;
  if (!Object.keys(fields).length) return NextResponse.json({ error: "нет полей для изменения" }, { status: 400 });

  await updateTaskFields(readableId, fields);
  revalidatePath(`/admin/tasks/${readableId}`);
  revalidatePath("/admin");
  revalidatePath("/admin/tasks");
  return NextResponse.json({ ok: true, readableId, changed: Object.keys(fields) });
}
