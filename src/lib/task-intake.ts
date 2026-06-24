/**
 * Ядро постановки задачи из сырого запроса (текст + скрины/файлы) — общее для Server Action
 * и для session-API-роута (/api/portal/create-task). Принимает уже резолвнутую личность `me`,
 * чтобы вызываться и из роута (fetch переживает деплой — UI клиента не дёргается), и из экшена.
 * Server-side only.
 */
import { isSuperAdmin } from "@/lib/principal";
import type { Principal } from "@/lib/principal";
import { getBackend } from "@/lib/tasks";
import { structureTask } from "@/lib/structurer";
import { notifyLogins, notifyAdmin, notifyProjectClients, taskTag, warnClientUnreachable } from "@/lib/notify";
import { PORTAL_BASE } from "@/lib/dev-protocol";
import { projectHasClient, appendRequestBlocks, assignTask, projectReporterLogin, type ReqBlock } from "@/lib/db";
import type { DraftTask, Role } from "@/lib/tasks/types";

/** Кнопка «Відкрити задачу» (в notify конвертируется в web_app Mini App с диплинком). */
const taskBtn = (taskId: string) => ({ text: "Відкрити задачу", url: `${PORTAL_BASE}/admin/tasks/${taskId}` });

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Кому уходит задача на утверждение:
 * - сотрудник: клиент проекта (если есть) либо супер-админ;
 * - обычный админ (Настя и т.п.): супер-админ (Никита);
 * - супер-админ / клиент / разработчик: без утверждения.
 */
export async function approvalFor(me: Principal, projectKey: string): Promise<{ approvalStatus: "approved" | "pending"; createdByRole: Role; pending: boolean; approver: "client" | "admin" | null }> {
  if (me.role === "employee") {
    const approver = (await projectHasClient(projectKey)) ? "client" : "admin";
    return { approvalStatus: "pending", createdByRole: "employee", pending: true, approver };
  }
  // Обычный админ — на утверждение супер-админу.
  if (me.realRole === "admin" && !isSuperAdmin(me)) {
    return { approvalStatus: "pending", createdByRole: "admin", pending: true, approver: "admin" };
  }
  return { approvalStatus: "approved", createdByRole: me.role, pending: false, approver: null };
}

export async function notifyPendingApproval(approver: "client" | "admin", projectKey: string, taskId: string, summary: string): Promise<void> {
  if (approver === "client") await notifyProjectClients(projectKey, `🟠 <b>Нова задача — потрібне підтвердження</b> · ${await taskTag(taskId)}: ${summary}`, [], taskBtn(taskId));
  else await notifyAdmin(`🟠 <b>Задача на утверждение</b> · ${await taskTag(taskId)}: ${summary}`, taskBtn(taskId));
}

/** Уведомить ответственного разработчика о новой задаче (best-effort). */
export async function notifyNewTask(task: { id: string; summary: string; assignee?: { login: string } | null }): Promise<void> {
  try {
    if (task.assignee?.login) await notifyLogins([task.assignee.login], `🆕 <b>Нова задача</b> · ${await taskTag(task.id)}: ${task.summary}`, [], taskBtn(task.id));
  } catch {
    // best-effort
  }
}

/**
 * Назначить задачу разработчику проекта (если ещё не назначена) и прислать ему пуш.
 * Заменяет ИИ-триаж: разбор делает Claude разработчика — он читает задачу, смотрит код и сам
 * задаёт уточнения клиенту в комментах, только если что-то непонятно. Если ответственного нет —
 * задача остаётся в «Без ответственного», назначат вручную.
 */
export async function assignProjectDevAndNotify(taskId: string): Promise<void> {
  const be = getBackend();
  const task = await be.getTask(taskId).catch(() => null);
  if (!task) return;
  const project = (await be.listProjects()).find((p) => p.key === task.projectKey);
  const dev = task.assignee?.login || project?.meta.defaultAssignee || null;
  if (!dev) return;
  if (!task.assignee?.login) await assignTask(taskId, dev).catch(() => {});
  await notifyLogins([dev], `🆕 <b>Нова задача</b> · ${await taskTag(taskId)}: ${task.summary}`, [], taskBtn(taskId)).catch(() => {});
}

/**
 * Создать задачу СРАЗУ из сырого запроса (текст + скрины), затем запустить фоновую
 * ИИ-проработку: она подготовит техническую спеку для разработчика во внутреннем
 * комментарии или задаст клиенту уточняющий вопрос. Юзер может закрыть портал —
 * результат придёт уведомлением в бот.
 */
export async function createRequestTaskCore(
  me: Principal,
  projectKey: string,
  title: string,
  blocks: ReqBlock[],
  recipient?: "admin" | "client" | "self" | "from_client",
  internal?: boolean,
): Promise<{ id?: string; url?: string; error?: string }> {
  if (!title.trim()) return { error: "Пустой заголовок" };
  try {
    const be = getBackend();
    const project = (await be.listProjects()).find((p) => p.key === projectKey);
    const isFeedback = !!project?.meta.feedback;
    const summary = title.trim().slice(0, 120);

    // Супер-админ ставит задачу СЕБЕ (в любом проекте): личная, ВНУТРЕННЯЯ (клиент не видит),
    // без ИИ-триажа и без уведомления дева — это его собственный todo.
    if (isSuperAdmin(me) && recipient === "self") {
      const task = await be.createTask({
        projectKey,
        summary,
        description: "",
        assigneeLogin: me.youtrackLogin ?? null,
        reporterLogin: me.youtrackLogin ?? null,
        approvalStatus: "approved",
        internal: true,
      });
      await appendRequestBlocks(task.id, blocks);
      return { id: task.id, url: task.url };
    }

    // Разработчик создаёт задачу вручную в своём проекте: адресат — админ (приватно, доступы и т.п.) или клиент (вопрос).
    if (me.role === "contributor" && !isFeedback && (recipient === "admin" || recipient === "client")) {
      const task = await be.createTask({
        projectKey,
        summary,
        description: "",
        assigneeLogin: me.youtrackLogin ?? null, // разработчик ведёт ответ
        reporterLogin: me.youtrackLogin ?? null,
        approvalStatus: "approved",
        internal: recipient === "admin", // запрос админу — клиенту не виден
      });
      await appendRequestBlocks(task.id, blocks);
      if (recipient === "admin") {
        await notifyAdmin(`🔧 <b>Запрос разработчика</b> · ${await taskTag(task.id)}: ${task.summary}`, taskBtn(task.id)).catch(() => {});
      } else {
        const reached = await notifyProjectClients(projectKey, `❓ <b>Питання по задачі</b> · ${await taskTag(task.id)}: ${task.summary}`, [], taskBtn(task.id)).catch(() => 0);
        if (!reached) await warnClientUnreachable(projectKey, task.id, task.summary, me.youtrackLogin).catch(() => {});
      }
      return { id: task.id, url: task.url };
    }

    // Супер-админ / админ ставит задачу-ВОПРОС КЛИЕНТУ: клиент видит и отвечает комментами; разработчику
    // НЕ назначается и НЕ идёт в ИИ-триаж (это не работа дева, а уточнение у клиента).
    if ((isSuperAdmin(me) || me.realRole === "admin") && !isFeedback && recipient === "client") {
      const task = await be.createTask({
        projectKey,
        summary,
        description: "",
        assigneeLogin: null,
        reporterLogin: me.youtrackLogin ?? null, // супер-админ без логина → клиент видит «Lambertain»
        approvalStatus: "approved",
        internal: false, // клиент видит
      });
      await appendRequestBlocks(task.id, blocks);
      const reachedQ = await notifyProjectClients(projectKey, `❓ <b>Питання/задача</b> · ${await taskTag(task.id)}: ${task.summary}`, [], taskBtn(task.id)).catch(() => 0);
      if (!reachedQ) await warnClientUnreachable(projectKey, task.id, task.summary, project?.meta.defaultAssignee).catch(() => {});
      return { id: task.id, url: task.url };
    }

    // Супер-админ / админ ставит задачу ОТ ИМЕНИ КЛИЕНТА: обычная задача разработчику (с триажем),
    // но постановщик — клиент проекта (он же её принимает; уведомления о коммент/ревью идут ему).
    if ((isSuperAdmin(me) || me.realRole === "admin") && !isFeedback && recipient === "from_client") {
      const clientLogin = await projectReporterLogin(projectKey);
      const task = await be.createTask({
        projectKey,
        summary,
        description: "",
        assigneeLogin: project?.meta.defaultAssignee ?? null, // в работу ответственному разработчику
        reporterLogin: clientLogin, // постановщик — клиент
        approvalStatus: "approved",
        internal: false,
      });
      await appendRequestBlocks(task.id, blocks);
      await assignProjectDevAndNotify(task.id); // сразу разработчику — он сам разберёт по коду (без триажа)
      // Клиент — постановщик: уведомляем его, что в проекте появилась новая задача (он её ведёт/принимает).
      const reachedFC = await notifyProjectClients(projectKey, `🆕 <b>Нова задача у вашому проєкті</b> · ${await taskTag(task.id)}: ${task.summary}`, [], taskBtn(task.id)).catch(() => 0);
      if (!reachedFC) await warnClientUnreachable(projectKey, task.id, task.summary, project?.meta.defaultAssignee).catch(() => {});
      return { id: task.id, url: task.url };
    }

    // Фидбек-проект — без апрува и без ИИ-триажа (пожелания по порталу, напрямую админу).
    const appr = isFeedback
      ? { approvalStatus: "approved" as const, createdByRole: me.role, pending: false, approver: null }
      : await approvalFor(me, projectKey);
    // Внутренняя задача (клиент не видит) — только когда её ставит админ/супер-админ. Разработчик такую
    // задачу получит (dev API пускает internal с created_by_role=admin/super), а клиент — нет.
    const wantInternal = internal === true && !isFeedback && (isSuperAdmin(me) || me.realRole === "admin");
    const task = await be.createTask({
      projectKey,
      summary,
      description: "", // тело соберём из блоков с сохранением хронологии (текст→скрин→текст→скрин)
      assigneeLogin: null,
      reporterLogin: me.youtrackLogin ?? null,
      approvalStatus: appr.approvalStatus,
      createdByRole: appr.createdByRole,
      internal: wantInternal,
    });
    await appendRequestBlocks(task.id, blocks);
    if (isFeedback) {
      await notifyAdmin(`💡 <b>Фидбек по порталу</b> · ${await taskTag(task.id)}: ${task.summary}\nОт: ${me.fullName}`, taskBtn(task.id)).catch(() => {});
    } else if (appr.pending && appr.approver) {
      // Задача ждёт утверждения; разработчику отдадим только после апрува (до этого можно отредактировать).
      // best-effort: сбой уведомления не должен превращать уже созданную задачу в ошибку для пользователя.
      await notifyPendingApproval(appr.approver, projectKey, task.id, task.summary).catch(() => {});
    } else {
      // Без триажа: сразу назначаем разработчику проекта и шлём ему пуш — он сам прочитает задачу,
      // посмотрит код и задаст клиенту уточнения только при необходимости.
      await assignProjectDevAndNotify(task.id);
    }
    return { id: task.id, url: task.url };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка создания" };
  }
}

/** Структурировать произвольный текст в черновик задачи (превью перед созданием). */
export async function structureDraftCore(
  me: Principal,
  text: string,
  preset?: { projectKey?: string; assigneeLogin?: string },
): Promise<{ draft?: DraftTask; error?: string }> {
  if (!text.trim()) return { error: "Пустой текст" };
  try {
    const be = getBackend();
    const [projects, users] = await Promise.all([be.listProjects(), be.listUsers()]);
    const draft = await structureTask(text, projects, users, today());
    if (preset?.projectKey) {
      draft.projectKey = preset.projectKey;
      draft.confidence = "high";
    }
    if (preset?.assigneeLogin) draft.assigneeLogin = preset.assigneeLogin;
    return { draft };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка структурирования" };
  }
}

/** Создать задачу из (возможно отредактированного) черновика. */
export async function createFromDraftCore(
  me: Principal,
  draft: DraftTask,
): Promise<{ id?: string; url?: string; error?: string }> {
  try {
    const be = getBackend();
    const appr = await approvalFor(me, draft.projectKey);
    const task = await be.createTask({
      projectKey: draft.projectKey,
      summary: draft.summary,
      description: draft.description,
      assigneeLogin: draft.assigneeLogin ?? null,
      reporterLogin: me.youtrackLogin ?? null,
      dueDate: draft.dueDate ?? null,
      priority: draft.priority ?? null,
      approvalStatus: appr.approvalStatus,
      createdByRole: appr.createdByRole,
    });
    if (appr.pending && appr.approver) await notifyPendingApproval(appr.approver, draft.projectKey, task.id, task.summary);
    else await notifyNewTask(task);
    return { id: task.id, url: task.url };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка создания задачи" };
  }
}
