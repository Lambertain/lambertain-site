"use server";

import { getPrincipal, isSuperAdmin } from "@/lib/principal";
import type { Principal } from "@/lib/principal";
import { getBackend } from "@/lib/tasks";
import { structureTask } from "@/lib/structurer";
import { notifyLogins, notifyAdmin, notifyProjectClients } from "@/lib/notify";
import { PORTAL_BASE } from "@/lib/dev-protocol";
import { projectHasClient, appendRequestBlocks, setTaskAiStatus, type ReqBlock } from "@/lib/db";

/** Кнопка «Открыть задачу» (в notify конвертируется в web_app Mini App с диплинком). */
const taskBtn = (taskId: string) => ({ text: "Открыть задачу", url: `${PORTAL_BASE}/admin/tasks/${taskId}` });
import type { DraftTask, Role } from "@/lib/tasks/types";

/**
 * Кому уходит задача на утверждение:
 * - сотрудник: клиент проекта (если есть) либо супер-админ;
 * - обычный админ (Настя и т.п.): супер-админ (Никита);
 * - супер-админ / клиент / разработчик: без утверждения.
 */
async function approvalFor(me: Principal, projectKey: string): Promise<{ approvalStatus: "approved" | "pending"; createdByRole: Role; pending: boolean; approver: "client" | "admin" | null }> {
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

async function notifyPendingApproval(approver: "client" | "admin", projectKey: string, taskId: string, summary: string): Promise<void> {
  if (approver === "client") await notifyProjectClients(projectKey, `🟠 <b>Новая задача — нужно подтверждение</b> · ${taskId}: ${summary}`, [], taskBtn(taskId));
  else await notifyAdmin(`🟠 <b>Задача на утверждение</b> · ${taskId}: ${summary}`, taskBtn(taskId));
}
/** Уведомить ответственного разработчика о новой задаче (best-effort). */
async function notifyNewTask(task: { id: string; summary: string; assignee?: { login: string } | null }): Promise<void> {
  try {
    if (task.assignee?.login) await notifyLogins([task.assignee.login], `🆕 <b>Новая задача</b> · ${task.id}: ${task.summary}`, [], taskBtn(task.id));
  } catch {
    // best-effort
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Создать задачу СРАЗУ из сырого запроса (текст + скрины), затем запустить фоновую
 * ИИ-проработку: она подготовит техническую спеку для разработчика во внутреннем
 * комментарии или задаст клиенту уточняющий вопрос. Юзер может закрыть портал —
 * результат придёт уведомлением в бот.
 */
export async function createRequestTask(
  projectKey: string,
  title: string,
  blocks: ReqBlock[],
  recipient?: "admin" | "client" | "self",
  internal?: boolean,
): Promise<{ id?: string; url?: string; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
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
        await notifyAdmin(`🔧 <b>Запрос разработчика</b> · проект «${project?.name || projectKey}» · ${task.id}: ${task.summary}`, taskBtn(task.id)).catch(() => {});
      } else {
        await notifyProjectClients(projectKey, `❓ <b>Вопрос по задаче</b> · ${task.id}: ${task.summary}`, [], taskBtn(task.id)).catch(() => {});
      }
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
      await notifyAdmin(`💡 <b>Фидбек по порталу</b> · ${task.id}: ${task.summary}\nОт: ${me.fullName}`, taskBtn(task.id)).catch(() => {});
    } else if (appr.pending && appr.approver) {
      // Задача ждёт утверждения; ИИ-проработку запустим только после апрува (можно отредактировать до этого).
      // best-effort: сбой уведомления не должен превращать уже созданную задачу в ошибку для пользователя.
      await notifyPendingApproval(appr.approver, projectKey, task.id, task.summary).catch(() => {});
    } else {
      // Триаж отложен: его запустит поллер через ~5 минут после создания — окно, чтобы автор
      // успел отредактировать задачу/комментарий до того, как ИИ-триаж обработает её и уведомит разработчика.
      await setTaskAiStatus(task.id, "pending");
    }
    return { id: task.id, url: task.url };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка создания" };
  }
}

/** Структурировать произвольный текст в черновик задачи (превью перед созданием).
 *  preset — заданные вручную проект/исполнитель (приоритетнее догадки модели). */
export async function structureDraft(
  text: string,
  preset?: { projectKey?: string; assigneeLogin?: string },
): Promise<{ draft?: DraftTask; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  if (!text.trim()) return { error: "Пустой текст" };
  try {
    const be = getBackend();
    const [projects, users] = await Promise.all([be.listProjects(), be.listUsers()]);
    const draft = await structureTask(text, projects, users, today());
    // Ручной выбор побеждает догадку модели.
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
export async function createFromDraft(
  draft: DraftTask,
): Promise<{ id?: string; url?: string; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
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
