/**
 * Чтение конфигурации доставки/режима проекта (для сверки, без БД).
 * GET /api/admin/project/config?projectKey=SAD
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { getProjectFull, setProjectMeta } from "@/lib/db";
import type { ProjectMeta } from "@/lib/tasks/types";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function GET(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  const key = new URL(req.url).searchParams.get("projectKey");
  if (!key) return NextResponse.json({ error: "projectKey required" }, { status: 400 });
  const proj = await getProjectFull(key);
  if (!proj) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const m = proj.meta;
  return NextResponse.json({
    projectKey: key,
    name: proj.name,
    devGit: m.devGit ?? null,
    clientGit: m.clientGit ?? null,
    extraRepos: m.extraRepos ?? [],
    // Режим доставки
    clientDeliverPR: !!m.clientDeliverPR,
    autoDeliver: !!m.autoDeliver,
    gitflowDelivery: !!m.gitflowDelivery,
    deliverBranch: m.deliverBranch ?? null,
    clientAutoMigrate: !!m.clientAutoMigrate,
    autoApprove: !!m.autoApprove,
    defaultAssignee: m.defaultAssignee ?? null,
    // Деплой-креды (только наличие, без значений)
    clientDeploy: !!m.clientDeploy?.railwayToken,
    clientVercel: !!m.clientVercel?.token,
  });
}

/**
 * Установить флаги режима доставки проекта (merge в meta).
 * POST /api/admin/project/config  { projectKey, gitflowDelivery?, autoDeliver?, clientDeliverPR?, clientAutoMigrate?, autoApprove?, deliverBranch? }
 */
export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const key = String(b.projectKey || "").trim();
  if (!key) return NextResponse.json({ error: "projectKey required" }, { status: 400 });
  const proj = await getProjectFull(key);
  if (!proj) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const meta: ProjectMeta = { ...proj.meta };
  const set: Record<string, unknown> = {};
  for (const f of ["gitflowDelivery", "autoDeliver", "clientDeliverPR", "clientAutoMigrate", "autoApprove"] as const) {
    if (typeof b[f] === "boolean") { meta[f] = (b[f] as boolean) || undefined; set[f] = b[f]; }
  }
  if (typeof b.deliverBranch === "string") { meta.deliverBranch = (b.deliverBranch as string).trim() || undefined; set.deliverBranch = meta.deliverBranch ?? null; }
  // Клиентский Railway-деплой (для авто-апрува деплоя порталом): railwayToken + projectId/environmentId/serviceId (+ pgServiceId).
  if (b.clientDeploy && typeof b.clientDeploy === "object") {
    const cd = b.clientDeploy as Record<string, unknown>;
    const prev = meta.clientDeploy ?? {};
    meta.clientDeploy = {
      railwayToken: cd.railwayToken ? String(cd.railwayToken) : prev.railwayToken,
      projectId: cd.projectId ? String(cd.projectId) : prev.projectId,
      environmentId: cd.environmentId ? String(cd.environmentId) : prev.environmentId,
      serviceId: cd.serviceId ? String(cd.serviceId) : prev.serviceId,
      pgServiceId: cd.pgServiceId ? String(cd.pgServiceId) : prev.pgServiceId,
    };
    set.clientDeploy = { railwayToken: !!meta.clientDeploy.railwayToken, projectId: meta.clientDeploy.projectId, serviceId: meta.clientDeploy.serviceId };
  }
  await setProjectMeta(key, proj.name, meta);
  return NextResponse.json({ ok: true, projectKey: key, set });
}
