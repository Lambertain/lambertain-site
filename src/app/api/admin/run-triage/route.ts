/**
 * Запуск ОТЛОЖЕННОГО ИИ-триажа задачи. Дёргается поллером через ~5 минут после создания задачи
 * (окно, чтобы автор успел отредактировать задачу/коммент до обработки и уведомления разработчика).
 * POST /api/admin/run-triage  { taskId }
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse, after } from "next/server";
import { claimTaskForTriage } from "@/lib/db";
import { draftTask } from "@/lib/drafter";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  const token = bearer(req);
  if (!token || token !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let body: { taskId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const taskId = String(body.taskId || "").trim();
  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

  // Атомарный захват: только если задача ещё pending. Иначе кто-то уже взял её в триаж — пропускаем.
  const claimed = await claimTaskForTriage(taskId);
  if (!claimed) return NextResponse.json({ taskId, skipped: true });

  after(() => draftTask(taskId));
  return NextResponse.json({ taskId, triage: "started" });
}
