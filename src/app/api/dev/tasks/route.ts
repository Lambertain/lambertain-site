/**
 * Чтение задач проекта по токену проекта (для Claude разработчика).
 * GET /api/dev/tasks            — открытые задачи проекта
 * GET /api/dev/tasks?all=1      — все задачи
 * GET /api/dev/tasks?id=SHU-42  — одна задача с комментариями
 * Авторизация: Authorization: Bearer <project_token>
 */
import { NextResponse } from "next/server";
import { getProjectKeyByToken, getTaskTags, getProjectFull } from "@/lib/db";
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
    const [task, comments, tags, proj] = await Promise.all([be.getTask(id), be.getComments(id), getTaskTags(id), getProjectFull(projectKey)]);
    // Эскалации (вопросы) и ответы ПОЛЬЗОВАТЕЛЯ — чтобы Claude понимал, на что уже ответили.
    // Отвечает «сторона пользователя»: клиент ИЛИ сотрудник (в проектах без клиента/с тех-поддержкой отвечает сотрудник —
    // раньше учитывался только client, и ответы сотрудника игнорировались → Claude переспрашивал уже отвеченное).
    const isUserSide = (role?: string) => role === "client" || role === "employee";
    const escalations = comments.filter((c) => c.text.startsWith(ESCALATION_MARK));
    const lastEsc = escalations[escalations.length - 1];
    const answersAfter = lastEsc ? comments.filter((c) => isUserSide(c.author.role) && c.created > lastEsc.created) : [];
    const awaitingClient = !!lastEsc && answersAfter.length === 0;
    const lastClientAnswer = answersAfter.length ? answersAfter[answersAfter.length - 1].text : null;
    // Картинки в ответах: ответ часто ПРИХОДИТ СКРИНОМ. Скачай их (/api/dev/files/<id>) и посмотри — не понимай только по тексту.
    const answerImageIds = [...new Set(answersAfter.flatMap((c) => [...String(c.text).matchAll(/\/api\/files\/(\d+)/g)].map((m) => Number(m[1]))))];
    // projectSpec — ПОЛНАЯ спека проекта (общий контекст; читай ДО эскалаций — там почти всё).
    // tags: { type, complexity (small|feature), skills:[slug] } — по skills тяни плейбуки из /api/dev/skills.
    return NextResponse.json({ task, tags, projectSpec: proj?.meta.spec || null, projectInfo: proj?.meta.devInfo || null, comments, awaitingClient, lastClientAnswer, answerImageIds });
  }

  // Список задач проекта.
  const all = url.searchParams.get("all") === "1";
  // Внутренние задачи (разработчик → админ, напр. доступы) не показываем в рабочей очереди Claude.
  // Внутренние задачи скрываем из очереди Claude — КРОМЕ поставленных админом разработчику мимо клиента
  // (created_by_role = admin/super): их разработчик берёт в работу, а клиент их не видит.
  const tasks = (await be.listTasks({ projectKey, unresolvedOnly: !all, order: "updated_desc" }))
    .filter((t) => !t.internal || t.createdByRole === "admin" || t.createdByRole === "super");
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
      // Передана владельцу на ops-шаг — НЕ бери в работу, пропусти (см. протокол).
      ownerAction: t.ownerAction ?? null,
      // Ждёт действия клиента (регистрация/доступ) — тоже пропусти, продолжишь после ответа клиента.
      clientAction: t.clientAction ?? null,
    })),
  });
}
