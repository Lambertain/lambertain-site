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
import { ESCALATION_MARK } from "@/lib/dev-protocol";

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
    // Эскалации (вопросы клиенту) и ответы клиента — чтобы Claude понимал, на что уже ответили.
    const escalations = comments.filter((c) => c.text.startsWith(ESCALATION_MARK));
    const lastEsc = escalations[escalations.length - 1];
    const clientAfter = lastEsc ? comments.filter((c) => c.author.role === "client" && c.created > lastEsc.created) : [];
    const awaitingClient = !!lastEsc && clientAfter.length === 0;
    const lastClientAnswer = clientAfter.length ? clientAfter[clientAfter.length - 1].text : null;
    return NextResponse.json({ task, comments, awaitingClient, lastClientAnswer });
  }

  // Список задач проекта.
  const all = url.searchParams.get("all") === "1";
  const tasks = await be.listTasks({ projectKey, unresolvedOnly: !all, order: "updated_desc" });
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
