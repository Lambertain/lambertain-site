/**
 * Перенумеровать задачи проекта без пропусков (после удаления задач появляются дыры в номерах).
 * POST /api/admin/project/renumber  { projectKey, dryRun? }
 *   dryRun:true — вернуть маппинг изменений, ничего не меняя.
 * Меняет num/readable_id задач на 1..N по порядку; комменты/события висят на int id и переживают.
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { readJsonSmart } from "@/lib/req-body";
import { renumberProjectTasks } from "@/lib/db";
import { revalidatePath } from "next/cache";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let body: { projectKey?: string; dryRun?: boolean };
  try { body = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const projectKey = String(body.projectKey || "").trim();
  if (!projectKey) return NextResponse.json({ error: "projectKey required" }, { status: 400 });

  const res = await renumberProjectTasks(projectKey, { dryRun: !!body.dryRun });
  if ("error" in res) return NextResponse.json(res, { status: 404 });
  if (!body.dryRun) {
    revalidatePath("/admin");
    revalidatePath("/admin/tasks");
  }
  return NextResponse.json({ ok: true, projectKey, dryRun: !!body.dryRun, changed: res.changes.length, changes: res.changes });
}
