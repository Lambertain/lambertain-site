"use server";

import { getPrincipal } from "@/lib/principal";
import { getBackend } from "@/lib/tasks";
import { structureTask } from "@/lib/structurer";
import { runIntake, type ProposedTask } from "@/lib/intake";
import { repoFromGit } from "@/lib/github";
import { notifyLogins, notifyAdmin, notifyProjectClients } from "@/lib/notify";
import { setTaskDeps, projectHasClient, attachImagesToTask } from "@/lib/db";
import type { DraftTask, Role } from "@/lib/tasks/types";

/**
 * Задачи сотрудника создаются на утверждение: если в проекте есть клиент — утверждает клиент,
 * если клиента нет — админ. Остальные роли — без утверждения.
 */
async function approvalFor(role: Role, projectKey: string): Promise<{ approvalStatus: "approved" | "pending"; createdByRole: Role; pending: boolean; approver: "client" | "admin" | null }> {
  if (role !== "employee") return { approvalStatus: "approved", createdByRole: role, pending: false, approver: null };
  const approver = (await projectHasClient(projectKey)) ? "client" : "admin";
  return { approvalStatus: "pending", createdByRole: "employee", pending: true, approver };
}

async function notifyPendingApproval(approver: "client" | "admin", projectKey: string, taskId: string, summary: string): Promise<void> {
  const text = `🟠 <b>Новая задача — нужно подтверждение</b> · ${taskId}: ${summary}`;
  if (approver === "client") await notifyProjectClients(projectKey, text);
  else await notifyAdmin(`🟠 <b>Задача на утверждение</b> · ${taskId}: ${summary}\nОт сотрудника, проект без клиента.`);
}
import type Anthropic from "@anthropic-ai/sdk";

/** Уведомить ответственного разработчика о новой задаче (best-effort). */
async function notifyNewTask(task: { id: string; summary: string; assignee?: { login: string } | null }): Promise<void> {
  try {
    if (task.assignee?.login) await notifyLogins([task.assignee.login], `🆕 <b>Новая задача</b> · ${task.id}: ${task.summary}`);
  } catch {
    // best-effort
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Один ход диалогового интейка по проекту. */
export async function intakeTurn(
  history: Anthropic.MessageParam[],
  projectKey: string,
): Promise<{ messages?: Anthropic.MessageParam[]; reply?: string; proposed?: ProposedTask[]; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  try {
    const be = getBackend();
    const [projects, users] = await Promise.all([be.listProjects(), be.listUsers()]);
    const project = projects.find((p) => p.key === projectKey);
    if (!project) return { error: "Проект не выбран" };
    const repo = repoFromGit(project.meta.devGit);
    // Клиент не должен видеть исполнителей: не передаём команду в контекст ИИ (иначе он может их назвать).
    const ctxUsers = me.role === "client" ? [] : users.filter((u) => !u.banned);
    const res = await runIntake(history, {
      projectKey,
      projectName: project.name,
      repo,
      conventions: project.meta.conventions,
      users: ctxUsers.map((u) => ({ login: u.login, fullName: u.fullName, role: u.role })),
      today: today(),
    });
    return { messages: res.messages, reply: res.reply, proposed: res.proposed };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка интейка" };
  }
}

/** Создать предложенные интейком задачи. */
export async function createProposedTasks(
  projectKey: string,
  tasks: ProposedTask[],
  images: { mime: string; data: string }[] = [],
): Promise<{ created?: { id: string; url: string }[]; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  try {
    const be = getBackend();
    const projects = await be.listProjects();
    const project = projects.find((p) => p.key === projectKey);
    const defaultAssignee = project?.meta.defaultAssignee || null;
    const appr = await approvalFor(me.role, projectKey);
    const created = [];
    const createdIds: string[] = []; // readable_id по индексу proposed-задачи
    for (const tk of tasks) {
      const task = await be.createTask({
        projectKey,
        summary: tk.summary,
        description: tk.description,
        // Если исполнитель не задан — ставим ответственного по проекту.
        assigneeLogin: tk.assigneeLogin ?? defaultAssignee,
        reporterLogin: me.youtrackLogin ?? null, // создатель (сотрудник/клиент виден)
        priority: tk.priority ?? null,
        approvalStatus: appr.approvalStatus,
        createdByRole: appr.createdByRole,
      });
      // Прикрепляем приложенные скрины к задаче (разраб смотрит глазами при проверке).
      if (images.length) await attachImagesToTask(task.id, images).catch(() => {});
      if (appr.pending && appr.approver) await notifyPendingApproval(appr.approver, projectKey, task.id, task.summary);
      else await notifyNewTask(task);
      created.push({ id: task.id, url: task.url });
      createdIds.push(task.id);
    }
    // Зависимости между задачами — их проставил ИИ (dependsOn = индексы предшественников в этом списке).
    for (let i = 0; i < tasks.length; i++) {
      const deps = (tasks[i].dependsOn || []).filter((j) => j >= 0 && j < createdIds.length && j !== i).map((j) => createdIds[j]);
      if (deps.length) await setTaskDeps(createdIds[i], deps).catch(() => {});
    }
    return { created };
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
    const appr = await approvalFor(me.role, draft.projectKey);
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
