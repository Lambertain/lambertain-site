/**
 * Живой реестр проектов: ключи, имена, репозитории, конфиг доставки/деплоя.
 * Чтобы не угадывать projectKey — единая точка «что где».
 * GET /api/admin/projects                — все проекты (компактно)
 * GET /api/admin/projects?archived=1     — включая архивные
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { listProjectsWithMeta } from "@/lib/db";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function GET(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  const withArchived = new URL(req.url).searchParams.get("archived") === "1";
  const all = await listProjectsWithMeta();
  const projects = all
    .filter((p) => withArchived || !p.archived)
    .map((p) => {
      const m = p.meta;
      return {
        key: p.key,
        name: p.name,
        archived: p.archived,
        devGit: m.devGit ?? null,
        clientGit: m.clientGit ?? null,
        // Режим доставки/деплоя (для быстрой диагностики «почему не доехало»)
        autoDeliver: !!m.autoDeliver,
        gitflowDelivery: !!m.gitflowDelivery,
        clientDeliverPR: !!m.clientDeliverPR,
        clientAutoMigrate: !!m.clientAutoMigrate,
        autoApprove: !!m.autoApprove,
        clientDeploy: !!m.clientDeploy?.railwayToken, // настроен ли авто-апрув Railway
        clientVercel: !!m.clientVercel?.token,
        defaultAssignee: m.defaultAssignee ?? null,
      };
    });
  return NextResponse.json({ count: projects.length, projects });
}
