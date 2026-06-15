/**
 * Записать спеку проекта (meta.spec) — её пишет Claude Code и кладёт сюда; портал отдаёт её разработчику
 * как projectSpec и использует для kickoffFromSpec.
 * POST /api/admin/project/spec  { projectKey, spec }
 * GET  /api/admin/project/spec?projectKey=PLAN  — прочитать текущую спеку.
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { getProjectFull, setProjectMeta } from "@/lib/db";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}
function auth(req: Request): NextResponse | null {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });
  return null;
}

export async function POST(req: Request) {
  const bad = auth(req); if (bad) return bad;
  let body: { projectKey?: string; spec?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const projectKey = String(body.projectKey || "").trim();
  if (!projectKey) return NextResponse.json({ error: "projectKey required" }, { status: 400 });
  const proj = await getProjectFull(projectKey);
  if (!proj) return NextResponse.json({ error: `project ${projectKey} not found` }, { status: 404 });
  await setProjectMeta(projectKey, proj.name, { ...proj.meta, spec: String(body.spec ?? "") });
  return NextResponse.json({ ok: true, projectKey, length: String(body.spec ?? "").length });
}

export async function GET(req: Request) {
  const bad = auth(req); if (bad) return bad;
  const projectKey = new URL(req.url).searchParams.get("projectKey")?.trim() || "";
  if (!projectKey) return NextResponse.json({ error: "projectKey required" }, { status: 400 });
  const proj = await getProjectFull(projectKey);
  if (!proj) return NextResponse.json({ error: `project ${projectKey} not found` }, { status: 404 });
  return NextResponse.json({ projectKey, spec: proj.meta.spec ?? null });
}
