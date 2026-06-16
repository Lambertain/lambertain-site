/**
 * Прочитать задачу (поля + комментарии) — для Claude/скриптов, без захода в БД.
 * GET /api/admin/task?id=DEV-4
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { getBackend } from "@/lib/tasks";
import { getTaskTags } from "@/lib/db";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function GET(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id")?.trim() || "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const be = getBackend();
  let task;
  try { task = await be.getTask(id); } catch { return NextResponse.json({ error: `задача ${id} не найдена` }, { status: 404 }); }
  const [comments, tags] = await Promise.all([be.getComments(id).catch(() => []), getTaskTags(id).catch(() => null)]);
  return NextResponse.json({ task, tags, comments });
}
