/**
 * Массово сменить постановщика задач: все задачи, где reporter = fromLogin, → toLogin.
 * POST /api/admin/reassign-reporter  { fromLogin, toLogin }
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>. Откат — обратный вызов (fromLogin↔toLogin).
 */
import { NextResponse } from "next/server";
import { reassignTasksReporter } from "@/lib/db";
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

  let body: { fromLogin?: string; toLogin?: string };
  try { body = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const fromLogin = String(body.fromLogin || "").trim();
  const toLogin = String(body.toLogin || "").trim();
  if (!fromLogin || !toLogin) return NextResponse.json({ error: "fromLogin и toLogin обязательны" }, { status: 400 });

  const res = await reassignTasksReporter(fromLogin, toLogin);
  if ("error" in res) return NextResponse.json(res, { status: 404 });
  revalidatePath("/admin/tasks");
  return NextResponse.json({ ok: true, fromLogin, toLogin, count: res.tasks.length, tasks: res.tasks });
}
