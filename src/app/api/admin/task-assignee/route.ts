/**
 * Назначить исполнителя задачи (assignee) + уведомить его.
 * POST /api/admin/task-assignee  { readableId, assigneeLogin }
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { assignTask, q } from "@/lib/db";
import { getBackend } from "@/lib/tasks";
import { notifyLogins, taskTag } from "@/lib/notify";
import { readJsonSmart } from "@/lib/req-body";
import { PORTAL_BASE } from "@/lib/dev-protocol";
import { revalidatePath } from "next/cache";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let body: { readableId?: string; assigneeLogin?: string };
  try { body = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const readableId = String(body.readableId || "").trim();
  const assigneeLogin = String(body.assigneeLogin || "").trim();
  if (!readableId || !assigneeLogin) return NextResponse.json({ error: "readableId и assigneeLogin обязательны" }, { status: 400 });

  const member = await q<{ id: number }>("SELECT id FROM members WHERE login = $1", [assigneeLogin]);
  if (!member[0]) return NextResponse.json({ error: `логин ${assigneeLogin} не найден` }, { status: 404 });
  let task;
  try { task = await getBackend().getTask(readableId); } catch { return NextResponse.json({ error: `задача ${readableId} не найдена` }, { status: 404 }); }

  await assignTask(readableId, assigneeLogin);
  await notifyLogins([assigneeLogin], `🆕 <b>Задача призначена вам</b> · ${await taskTag(readableId)}: ${task.summary}`, [], { text: "Открыть задачу", url: `${PORTAL_BASE}/admin/tasks/${readableId}` }).catch(() => {});
  revalidatePath("/admin/tasks");
  revalidatePath(`/admin/tasks/${readableId}`);
  return NextResponse.json({ ok: true, readableId, assigneeLogin });
}
