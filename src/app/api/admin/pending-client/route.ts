/**
 * Сквозной аудит: все задачи по ВСЕМ проектам, которые ждут действия/ответа клиента (clientAction)
 * или владельца (ownerAction) — с флагом, подключён ли клиент проекта к боту (дошло ли уведомление).
 * GET /api/admin/pending-client
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { getBackend } from "@/lib/tasks";
import { hasLinkedClient } from "@/lib/notify";

export const dynamic = "force-dynamic";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function GET(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  const be = getBackend();
  const projects = await be.listProjects();
  const tasks = await be.listTasks({ projectKeys: projects.map((p) => p.key), order: "updated_desc", limit: 1000 });
  const waiting = tasks.filter((t) => t.clientAction || t.ownerAction);

  // Достижим ли клиент проекта (привязан к боту) — кэш по проекту.
  const reach = new Map<string, boolean>();
  for (const key of new Set(waiting.map((t) => t.projectKey))) reach.set(key, await hasLinkedClient(key));

  const out = waiting.map((t) => ({
    id: t.id,
    project: t.projectKey,
    status: t.state ?? null,
    summary: t.summary,
    clientAction: t.clientAction ?? null,
    ownerAction: t.ownerAction ?? null,
    // false → клиент проекта не подключён к боту: уведомление о действии НЕ доставлено.
    clientReachable: t.clientAction ? (reach.get(t.projectKey) ?? false) : null,
  }));
  return NextResponse.json({ count: out.length, undelivered: out.filter((t) => t.clientAction && t.clientReachable === false).length, tasks: out });
}
