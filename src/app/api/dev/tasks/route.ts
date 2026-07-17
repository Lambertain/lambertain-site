/**
 * Чтение задач проекта по токену проекта (для Claude разработчика).
 * GET /api/dev/tasks            — открытые задачи проекта
 * GET /api/dev/tasks?all=1      — все задачи
 * GET /api/dev/tasks?id=SHU-42  — одна задача с комментариями
 * Авторизация: Authorization: Bearer <project_token>
 */
import { NextResponse } from "next/server";
import { getProjectKeyByToken, getTaskTags, getProjectFull, getTaskEvents, getTaskDeps, getDepsFor } from "@/lib/db";
import { getBackend } from "@/lib/tasks";
import { statusBucket } from "@/lib/statuses";
import { projectSpecText } from "@/lib/specs";

// DEV-33: зависимость считается «незакрытой» (блокирующей), пока её статус не в корзине done.
const depUnfinished = (status: string | null) => statusBucket(status) !== "done";
import { isEscalation } from "@/lib/dev-protocol";

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
    const [task, commentsRaw, tags, proj, events, deps] = await Promise.all([be.getTask(id), be.getComments(id), getTaskTags(id), getProjectFull(projectKey), getTaskEvents(id), getTaskDeps(id)]);
    // client_nodev — комментарии админа клиенту МИМО разработчика (фин-вопросы и т.п.): дев-Claude их не получает.
    const comments = commentsRaw.filter((c) => c.visibility !== "client_nodev");
    // DEV-33: зависимости задачи + вычисляемая блокировка по ним (агент не видел этого → брал де-факто заблокированные).
    const dependsOn = deps.map((d) => d.id);
    // Завершённую задачу зависимости не блокируют (работа сделана) — иначе Done с висящим блокером выглядит «не начата».
    const taskDone = statusBucket(task?.state) === "done";
    const blockedBy = taskDone ? [] : deps.filter((d) => depUnfinished(d.status)).map((d) => ({ id: d.id, summary: d.summary, status: d.status }));
    const effectiveBlocked = blockedBy.length > 0;
    // Эскалации (вопросы) и ответы ПОЛЬЗОВАТЕЛЯ — чтобы Claude понимал, на что уже ответили.
    // Отвечает «сторона пользователя»: клиент ИЛИ сотрудник (в проектах без клиента/с тех-поддержкой отвечает сотрудник —
    // раньше учитывался только client, и ответы сотрудника игнорировались → Claude переспрашивал уже отвеченное).
    const isUserSide = (role?: string) => role === "client" || role === "employee";
    const escalations = comments.filter((c) => isEscalation(c.text));
    const lastEsc = escalations[escalations.length - 1];
    const answersAfter = lastEsc ? comments.filter((c) => isUserSide(c.author.role) && c.created > lastEsc.created) : [];
    const awaitingClient = !!lastEsc && answersAfter.length === 0;
    const lastClientAnswer = answersAfter.length ? answersAfter[answersAfter.length - 1].text : null;
    // Картинки в ответах: ответ часто ПРИХОДИТ СКРИНОМ. Скачай их (/api/dev/files/<id>) и посмотри — не понимай только по тексту.
    const answerImageIds = [...new Set(answersAfter.flatMap((c) => [...String(c.text).matchAll(/\/api\/files\/(\d+)/g)].map((m) => Number(m[1]))))];
    // Вложения (задача/комменты/devInfo/спека) хранятся как `/api/files/<id>` — но этот путь требует сессии портала,
    // которой у Claude разработчика нет. Переписываем на `/api/dev/files/<id>` — он отдаёт файл по токену проекта
    // (getDevAttachment пускает и задачные, и проектные вложения). Иначе разраб видит ссылку, но скачать не может.
    const devFiles = <T,>(v: T): T => (typeof v === "string" ? (v.replace(/\/api\/files\/(\d+)/g, "/api/dev/files/$1") as T) : v);
    const taskOut = task ? { ...task, description: devFiles(task.description) } : task;
    // Задача ещё на утверждении (создана сотрудником/младшим админом, ждёт апрува админа/клиента) — НЕ бери
    // в работу: из списка такие исключены, но при прямом запросе по id явно сигналим, чтобы дев не начинал.
    const awaitingApproval = task?.approvalStatus === "pending";
    const commentsOut = comments.map((c) => ({ ...c, text: devFiles(c.text) }));
    // projectSpec — ПОЛНАЯ спека проекта (общий контекст; читай ДО эскалаций — там почти всё).
    // tags: { type, complexity (small|feature), skills:[slug] } — по skills тяни плейбуки из /api/dev/skills.
    // events (DEV-32): журнал подій задачі (зміни статусу/стадії, PR, модерація, ескалації…) — щоб агент розумів
    // ХТО і ЧОМУ змінив стан («X змінив статус через Y»), без розпитувань. Хронологічно; зливай із comments за ts.
    // dependsOn/blockedBy/effectiveBlocked (DEV-33): якщо effectiveBlocked=true — задача де-факто заблокована
    // незавершеними залежностями (blockedBy), НЕ бери в роботу, поки вони не закриті.
    return NextResponse.json({ task: taskOut, tags, projectSpec: devFiles(projectSpecText(proj?.meta) || null), projectInfo: devFiles(proj?.meta.devInfo || null), comments: commentsOut, events, dependsOn, blockedBy, effectiveBlocked, awaitingApproval, awaitingClient, lastClientAnswer, answerImageIds });
  }

  // Список задач проекта.
  const all = url.searchParams.get("all") === "1";
  // Внутренние задачи (разработчик → админ, напр. доступы) не показываем в рабочей очереди Claude.
  // Внутренние задачи скрываем из очереди Claude — КРОМЕ поставленных админом разработчику мимо клиента
  // (created_by_role = admin/super): их разработчик берёт в работу, а клиент их не видит.
  // Задачи на утверждении (approval_status=pending, напр. созданные сотрудником/младшим админом) в очередь
  // разработчика НЕ отдаём: их сперва апрувит админ/клиент → assignProjectDevAndNotify отдаст дев после апрува.
  // Иначе дев брал неутверждённую задачу и закрывал её (autoApprove) РАНЬШЕ, чем утверждающий её открыл.
  const tasks = (await be.listTasks({ projectKey, unresolvedOnly: !all, order: "updated_desc" }))
    .filter((t) => !t.internal || t.createdByRole === "admin" || t.createdByRole === "super")
    .filter((t) => t.approvalStatus !== "pending");
  // DEV-33: блокеры для всех задач разом — чтобы пометить де-факто заблокированные зависимостями.
  const depMap = await getDepsFor(tasks.map((t) => t.id));
  return NextResponse.json({
    project: projectKey,
    count: tasks.length,
    tasks: tasks.map((t) => {
      const deps = depMap.get(t.id) ?? [];
      // Завершённую задачу зависимости не блокируют (её работа сделана).
      const blockedBy = statusBucket(t.state) === "done" ? [] : deps.filter((d) => depUnfinished(d.status)).map((d) => d.id);
      return {
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
        // DEV-25: задача заблокирована (Blocked) — НЕ бери в работу, она ждёт разблокировки/решения.
        blocked: statusBucket(t.state) === "blocked",
        // DEV-33: зависимости. dependsOn — все блокеры; blockedBy — НЕзакрытые; effectiveBlocked — де-факто
        // заблокирована незавершёнными зависимостями (НЕ бери в работу, как и blocked/clientAction/ownerAction).
        dependsOn: deps.map((d) => d.id),
        blockedBy,
        effectiveBlocked: blockedBy.length > 0,
      };
    }),
  });
}
