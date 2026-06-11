/**
 * Эскалация вопроса от Claude разработчика по токену проекта.
 * POST /api/dev/escalate  { taskId, question, kind?: "client" | "admin" }
 *  - kind "client" (по умолч.): ИИ оформляет вопрос клиенту от лица агентства → клиент-видимый коммент + уведомление клиенту.
 *  - kind "admin": внутренний коммент + уведомление Никите (продуктовые/бизнес-развилки).
 * Авторизация: Authorization: Bearer <project_token>
 */
import { NextResponse } from "next/server";
import { getProjectKeyByToken } from "@/lib/db";
import { getBackend } from "@/lib/tasks";
import { draftClientQuestion } from "@/lib/replies";
import { notifyProjectClients, notifyAdmin } from "@/lib/notify";
import { ESCALATION_MARK } from "@/lib/dev-protocol";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "no token" }, { status: 401 });
  const projectKey = await getProjectKeyByToken(token);
  if (!projectKey) return NextResponse.json({ error: "invalid token" }, { status: 403 });

  let body: { taskId?: string; question?: string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const taskId = String(body.taskId || "").trim();
  const question = String(body.question || "").trim();
  const kind = body.kind === "admin" ? "admin" : "client";
  if (!taskId || !question) return NextResponse.json({ error: "taskId and question required" }, { status: 400 });
  if (!taskId.startsWith(projectKey + "-")) return NextResponse.json({ error: "task not in project" }, { status: 403 });

  const be = getBackend();
  try {
    const [task, comments] = await Promise.all([be.getTask(taskId), be.getComments(taskId)]);

    if (kind === "admin") {
      const body = `🔧 Вопрос разработчика (нужно решение):\n\n${question}`;
      await be.addComment(taskId, body, "internal");
      await notifyAdmin(`🔧 <b>Вопрос разработчика</b> · ${taskId}: ${task.summary}\n${question.slice(0, 400)}`);
      return NextResponse.json({ ok: true, escalatedTo: "admin" });
    }

    // client: оформляем вопрос от лица агентства, постим клиенту, уведомляем.
    const polished = await draftClientQuestion(task, question, comments);
    await be.addComment(taskId, `${ESCALATION_MARK}\n\n${polished}`, "client");
    await notifyProjectClients(projectKey, `❓ <b>Вопрос по задаче</b> · ${taskId}: ${task.summary}\n${polished.slice(0, 500)}`);
    return NextResponse.json({ ok: true, escalatedTo: "client", posted: polished });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
