/**
 * Чтение конфигурации доставки/режима проекта (для сверки, без БД).
 * GET /api/admin/project/config?projectKey=SAD
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { getProjectFull } from "@/lib/db";

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
    deliverBranch: m.deliverBranch ?? null,
    clientAutoMigrate: !!m.clientAutoMigrate,
    autoApprove: !!m.autoApprove,
    defaultAssignee: m.defaultAssignee ?? null,
    // Деплой-креды (только наличие, без значений)
    clientDeploy: !!m.clientDeploy?.railwayToken,
    clientVercel: !!m.clientVercel?.token,
  });
}
