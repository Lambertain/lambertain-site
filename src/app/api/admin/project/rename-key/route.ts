/**
 * Переименовать ключ (слаг) проекта: oldKey → newKey.
 * Меняет readable_id всех задач и project_key во всех связанных таблицах. Токен проекта НЕ меняется.
 * POST /api/admin/project/rename-key  { oldKey, newKey }
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>. Откат — повторный вызов с обратными ключами.
 */
import { NextResponse } from "next/server";
import { renameProjectKey } from "@/lib/db";
import { readJsonSmart } from "@/lib/req-body";
import { revalidatePath } from "next/cache";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let body: { oldKey?: string; newKey?: string };
  try { body = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const oldKey = String(body.oldKey || "").trim().toUpperCase();
  const newKey = String(body.newKey || "").trim().toUpperCase();
  if (!oldKey || !newKey) return NextResponse.json({ error: "oldKey и newKey обязательны" }, { status: 400 });
  if (!/^[A-Z][A-Z0-9]{0,9}$/.test(newKey)) return NextResponse.json({ error: "newKey: A-Z0-9, до 10 символов" }, { status: 400 });

  const res = await renameProjectKey(oldKey, newKey);
  if ("error" in res) return NextResponse.json(res, { status: 404 });
  revalidatePath("/admin");
  revalidatePath("/admin/tasks");
  return NextResponse.json({ ok: true, oldKey, newKey, tasks: res.tasks });
}
