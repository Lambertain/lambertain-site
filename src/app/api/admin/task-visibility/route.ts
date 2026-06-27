/**
 * Сменить видимость задачи (флаг internal) по admin-токену. Для исправления ошибочно созданных
 * internal-задач (клиент их не видит) в клиентских проектах — без захода в БД.
 * POST /api/admin/task-visibility  { readableId, internal: boolean }
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { readJsonSmart } from "@/lib/req-body";
import { setTaskInternal } from "@/lib/db";
import { revalidatePath } from "next/cache";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let b: { readableId?: string; internal?: boolean };
  try { b = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const readableId = String(b.readableId || "").trim();
  if (!readableId || typeof b.internal !== "boolean") return NextResponse.json({ error: "readableId и internal:boolean обязательны" }, { status: 400 });

  const ok = await setTaskInternal(readableId, b.internal);
  if (!ok) return NextResponse.json({ error: `задача ${readableId} не найдена` }, { status: 404 });
  revalidatePath(`/admin/tasks/${readableId}`);
  revalidatePath("/admin/tasks");
  return NextResponse.json({ ok: true, readableId, internal: b.internal });
}
