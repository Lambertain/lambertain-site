/**
 * Утвердить/отклонить задачу, ждущую подтверждения (approval_status), admin-токеном — без сессии портала.
 * Нужно для: (а) апрува задач, созданных сотрудником/младшим админом (иначе они не уходят разработчику);
 * (б) разовой чистки исторических «pending на уже выполненной задаче» (approval стал moot).
 * POST /api/admin/task-approval  { readableId, status: "approved" | "rejected" }
 *   approved + задача ещё НЕ завершена → отдаём разработчику (assignProjectDevAndNotify).
 *   approved + задача уже Done/resolved → просто снимаем флаг (работа сделана, никого не дёргаем).
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { readJsonSmart } from "@/lib/req-body";
import { getBackend } from "@/lib/tasks";
import { setTaskApproval } from "@/lib/db";
import { assignProjectDevAndNotify } from "@/lib/task-intake";
import { statusBucket } from "@/lib/statuses";
import { revalidatePath } from "next/cache";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let b: { readableId?: string; status?: string };
  try { b = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const readableId = String(b.readableId || "").trim();
  const status = String(b.status || "").trim();
  if (!readableId) return NextResponse.json({ error: "readableId обязателен" }, { status: 400 });
  if (status !== "approved" && status !== "rejected") return NextResponse.json({ error: 'status должен быть "approved" или "rejected"' }, { status: 400 });

  const be = getBackend();
  let task;
  try { task = await be.getTask(readableId); } catch { return NextResponse.json({ error: `Задача ${readableId} не найдена` }, { status: 404 }); }

  await setTaskApproval(readableId, status);
  // Живую задачу при апруве отдаём разработчику (как ApprovalBar в UI). Уже завершённую — только снимаем флаг.
  let released = false;
  if (status === "approved" && statusBucket(task.state) !== "done" && !task.resolved) {
    await assignProjectDevAndNotify(readableId).catch(() => {});
    released = true;
  }
  revalidatePath(`/admin/tasks/${readableId}`);
  revalidatePath("/admin");
  return NextResponse.json({ ok: true, readableId, status, releasedToDev: released });
}
