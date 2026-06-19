/**
 * Создание задачи на портале по глобальному admin-токену (без доступа к БД).
 * POST /api/admin/create-task
 *   { projectKey, title, description?, assigneeLogin?, internal?, recipient? }
 *   Задача сразу назначается разработчику проекта (assigneeLogin или defaultAssignee) и ему уходит пуш —
 *   разбор делает Claude разработчика (читает задачу/код, спрашивает клиента в комментах при необходимости).
 *   recipient:"client" — вопрос/задача КЛИЕНТУ (не назначается разработчику, клиент видит и отвечает).
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN> (переменная окружения портала).
 */
import { NextResponse } from "next/server";
import { readJsonSmart } from "@/lib/req-body";
import { getBackend } from "@/lib/tasks";
import { notifyLogins, notifyProjectClients, taskTag } from "@/lib/notify";
import { PORTAL_BASE } from "@/lib/dev-protocol";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  const token = bearer(req);
  if (!token || token !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let body: { projectKey?: string; title?: string; description?: string; assigneeLogin?: string; internal?: boolean; recipient?: string };
  try { body = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const projectKey = String(body.projectKey || "").trim();
  const title = String(body.title || "").trim();
  const description = String(body.description || "");
  const internal = body.internal === true;
  if (!projectKey || !title) return NextResponse.json({ error: "projectKey and title required" }, { status: 400 });

  const be = getBackend();
  const project = (await be.listProjects()).find((p) => p.key === projectKey);
  if (!project) return NextResponse.json({ error: `project ${projectKey} not found` }, { status: 404 });

  try {
    // Вопрос/задача КЛИЕНТУ: не назначаем разработчику, не триажим, клиент видит и получает пуш.
    if (body.recipient === "client") {
      const task = await be.createTask({
        projectKey, summary: title.slice(0, 120), description,
        assigneeLogin: null, reporterLogin: null, approvalStatus: "approved", createdByRole: "admin", internal: false,
      });
      await notifyProjectClients(projectKey, `❓ <b>Питання по проекту</b> · ${await taskTag(task.id)}: ${task.summary}\nВідкрийте задачу на порталі та дайте відповідь у коментарях.`, [], { text: "Відкрити", url: `${PORTAL_BASE}/admin/tasks/${task.id}` }).catch(() => {});
      return NextResponse.json({ id: task.id, url: task.url, recipient: "client" });
    }
    // Сразу назначаем разработчику проекта и уведомляем — он сам разберёт задачу по коду (без триажа).
    const assignee = (body.assigneeLogin ? String(body.assigneeLogin).trim() : "") || project.meta.defaultAssignee || null;
    const task = await be.createTask({
      projectKey, summary: title.slice(0, 120), description,
      assigneeLogin: assignee, reporterLogin: null, approvalStatus: "approved", createdByRole: "admin", internal,
    });
    if (assignee) {
      await notifyLogins([assignee], `🆕 <b>Нова задача</b> · ${await taskTag(task.id)}: ${task.summary}\n${PORTAL_BASE}/admin/tasks/${task.id}`).catch(() => {});
    }
    return NextResponse.json({ id: task.id, url: task.url, assignee });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
