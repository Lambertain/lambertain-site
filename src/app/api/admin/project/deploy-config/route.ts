/**
 * Настроить клиентский Railway-деплой проекта (meta.clientDeploy) — чтобы портал апрувил/мониторил деплой клиента.
 * POST /api/admin/project/deploy-config
 *   { projectKey, railwayToken?, projectId?, environmentId?, serviceId?, pgServiceId? }
 * Заданные поля мёржатся в meta.clientDeploy (пустые/отсутствующие — не трогаются).
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { getProjectFull, setProjectMeta } from "@/lib/db";
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

  let body: { projectKey?: string; railwayToken?: string; projectId?: string; environmentId?: string; serviceId?: string; pgServiceId?: string; vercelToken?: string; vercelProjectId?: string; vercelTeamId?: string };
  try { body = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const projectKey = String(body.projectKey || "").trim();
  if (!projectKey) return NextResponse.json({ error: "projectKey required" }, { status: 400 });

  const proj = await getProjectFull(projectKey);
  if (!proj) return NextResponse.json({ error: `project ${projectKey} not found` }, { status: 404 });

  // Railway (clientDeploy)
  const cd = { ...(proj.meta.clientDeploy ?? {}) };
  const set = (k: "railwayToken" | "projectId" | "environmentId" | "serviceId" | "pgServiceId") => {
    const v = body[k] ? String(body[k]).trim() : "";
    if (v) cd[k] = v;
  };
  (["railwayToken", "projectId", "environmentId", "serviceId", "pgServiceId"] as const).forEach(set);

  // Vercel (clientVercel) — деплой клиента на Vercel: токен + projectId (+ teamId, если под командой)
  const cv = { ...(proj.meta.clientVercel ?? {}) };
  const setV = (bodyKey: "vercelToken" | "vercelProjectId" | "vercelTeamId", cvKey: "token" | "projectId" | "teamId") => {
    const v = body[bodyKey] ? String(body[bodyKey]).trim() : "";
    if (v) cv[cvKey] = v;
  };
  setV("vercelToken", "token"); setV("vercelProjectId", "projectId"); setV("vercelTeamId", "teamId");

  await setProjectMeta(projectKey, proj.name, { ...proj.meta, clientDeploy: cd, clientVercel: cv });
  revalidatePath(`/admin/projects/${projectKey}`);

  return NextResponse.json({
    ok: true, projectKey,
    clientDeploy: { railwayToken: cd.railwayToken ? "set" : "—", projectId: cd.projectId ?? null, environmentId: cd.environmentId ?? null, serviceId: cd.serviceId ?? null, pgServiceId: cd.pgServiceId ?? null },
    clientVercel: { token: cv.token ? "set" : "—", projectId: cv.projectId ?? null, teamId: cv.teamId ?? null },
  });
}
