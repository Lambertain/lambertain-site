/**
 * Чтение задач проекта по токену проекта (для Claude разработчика).
 * GET /api/dev/tasks            — открытые задачи проекта
 * GET /api/dev/tasks?all=1      — все задачи
 * GET /api/dev/tasks?id=SHU-42  — одна задача с комментариями
 * Авторизация: Authorization: Bearer <project_token>
 */
import { NextResponse } from "next/server";
import { getProjectKeyByToken } from "@/lib/db";
import { getBackend } from "@/lib/tasks";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function GET(req: Request) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "no token" }, { status: 401 });
  const projectKey = await getProjectKeyByToken(token);
  if (!projectKey) return NextResponse.json({ error: "invalid token" }, { status: 403 });

  const url = new URL(req.url);
  const be = getBackend();

  // Одна задача с комментариями.
  const id = url.searchParams.get("id");
  if (id) {
    if (!id.startsWith(projectKey + "-")) {
      return NextResponse.json({ error: "task not in project" }, { status: 403 });
    }
    const [task, comments] = await Promise.all([be.getTask(id), be.getComments(id)]);
    return NextResponse.json({ task, comments });
  }

  // Список задач проекта.
  const all = url.searchParams.get("all") === "1";
  const query = all
    ? `project: ${projectKey} sort by: updated desc`
    : `project: ${projectKey} #Unresolved sort by: updated desc`;
  const tasks = await be.listTasks(query);
  return NextResponse.json({
    project: projectKey,
    count: tasks.length,
    tasks: tasks.map((t) => ({
      id: t.id,
      summary: t.summary,
      status: t.state,
      assignee: t.assignee?.fullName ?? null,
      priority: t.priority,
      updated: t.updated,
      url: t.url,
    })),
  });
}
