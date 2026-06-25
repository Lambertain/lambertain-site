/**
 * Назначить постановщика (reporter) задачи.
 * POST /api/admin/task-reporter  { readableId, reporterLogin }
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { setTaskReporter, projectReporterLogin } from "@/lib/db";
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

  let body: { readableId?: string; reporterLogin?: string };
  try { body = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const readableId = String(body.readableId || "").trim();
  let reporterLogin = String(body.reporterLogin || "").trim();
  if (!readableId || !reporterLogin) return NextResponse.json({ error: "readableId и reporterLogin обязательны" }, { status: 400 });

  // reporterLogin:"client" — поставить постановщиком клиента проекта (логин резолвится из проекта).
  if (reporterLogin === "client") {
    const client = await projectReporterLogin(readableId.split("-")[0]);
    if (!client) return NextResponse.json({ error: "у проекта нет зарегистрированного клиента" }, { status: 400 });
    reporterLogin = client;
  }

  const ok = await setTaskReporter(readableId, reporterLogin);
  if (!ok) return NextResponse.json({ error: `задача ${readableId} или логин ${reporterLogin} не найдены` }, { status: 404 });
  revalidatePath(`/admin/tasks/${readableId}`);
  return NextResponse.json({ ok: true, readableId, reporterLogin });
}
