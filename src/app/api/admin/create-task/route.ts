/**
 * Создание задачи на портале по глобальному admin-токену (без доступа к БД).
 * POST /api/admin/create-task
 *   { projectKey, title, description?, assigneeLogin?, internal?, triage? }
 *   - triage (по умолчанию true): прогон через ИИ-триаж (заголовок/требование/теги),
 *     который назначит исполнителя по проекту и уведомит разработчика — как при создании в портале.
 *   - triage:false: сразу назначить assigneeLogin (или defaultAssignee проекта) и уведомить, без ИИ.
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN> (переменная окружения портала).
 */
import { NextResponse } from "next/server";
import { getBackend } from "@/lib/tasks";
import { setTaskAiStatus } from "@/lib/db";
import { notifyLogins, notifyProjectClients } from "@/lib/notify";
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

  let body: { projectKey?: string; title?: string; description?: string; assigneeLogin?: string; internal?: boolean; triage?: boolean; recipient?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const projectKey = String(body.projectKey || "").trim();
  const title = String(body.title || "").trim();
  const description = String(body.description || "");
  const internal = body.internal === true;
  const triage = body.triage !== false; // по умолчанию прогоняем через ИИ-триаж
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
      await notifyProjectClients(projectKey, `❓ <b>Питання по проекту</b> · ${task.id}: ${task.summary}\nВідкрийте задачу на порталі та дайте відповідь у коментарях.`, [], { text: "Відкрити", url: `${PORTAL_BASE}/admin/tasks/${task.id}` }).catch(() => {});
      return NextResponse.json({ id: task.id, url: task.url, recipient: "client" });
    }
    if (triage) {
      // Штатный путь портала: исполнителя и теги проставит ИИ-триаж, он же уведомит разработчика.
      // Триаж отложен на ~5 минут (его запустит поллер) — окно, чтобы успеть отредактировать задачу.
      const task = await be.createTask({
        projectKey, summary: title.slice(0, 120), description,
        assigneeLogin: null, reporterLogin: null, approvalStatus: "approved", createdByRole: "admin", internal,
      });
      await setTaskAiStatus(task.id, "pending");
      return NextResponse.json({ id: task.id, url: task.url, triage: "scheduled" });
    }
    // Без ИИ: сразу назначаем и уведомляем.
    const assignee = (body.assigneeLogin ? String(body.assigneeLogin).trim() : "") || project.meta.defaultAssignee || null;
    const task = await be.createTask({
      projectKey, summary: title.slice(0, 120), description,
      assigneeLogin: assignee, reporterLogin: null, approvalStatus: "approved", createdByRole: "admin", internal,
    });
    if (assignee) {
      await notifyLogins([assignee], `🆕 <b>Нова задача</b> · ${task.id}: ${task.summary}\n${PORTAL_BASE}/admin/tasks/${task.id}`).catch(() => {});
    }
    return NextResponse.json({ id: task.id, url: task.url, assignee });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
