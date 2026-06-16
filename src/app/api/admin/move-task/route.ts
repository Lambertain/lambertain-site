/**
 * Перенос задачи в другой проект (меняется readable_id на № целевого проекта).
 * POST /api/admin/move-task  { readableId, targetProjectKey }
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 * Откат: вызвать повторно с { readableId: <новый>, targetProjectKey: <исходный проект> }.
 */
import { NextResponse } from "next/server";
import { moveTaskToProject } from "@/lib/db";
import { revalidatePath } from "next/cache";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  const token = bearer(req);
  if (!token || token !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let body: { readableId?: string; targetProjectKey?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const readableId = String(body.readableId || "").trim();
  const targetProjectKey = String(body.targetProjectKey || "").trim();
  if (!readableId || !targetProjectKey) return NextResponse.json({ error: "readableId и targetProjectKey обязательны" }, { status: 400 });

  const res = await moveTaskToProject(readableId, targetProjectKey);
  if ("error" in res) return NextResponse.json(res, { status: 404 });
  revalidatePath("/admin/tasks");
  revalidatePath(`/admin/tasks/${res.to}`);
  return NextResponse.json(res);
}
