"use server";

import { getPrincipal } from "@/lib/principal";
import { getProjectFull, setProjectMeta, setTaskTags, setTaskAiStatus, setTaskDeps } from "@/lib/db";
import { getBackend } from "@/lib/tasks";
import { decomposeSpec, type KickoffTask } from "@/lib/kickoff";
import { notifyLogins } from "@/lib/notify";
import { revalidatePath } from "next/cache";

type Cred = { role?: string; env?: string; login?: string; pass?: string };

/** Сохранить аккаунты входа проекта. Право: админ или разработчик-ответственный проекта. */
export async function saveCredentials(projectKey: string, credentials: Cred[]): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  const p = await getProjectFull(projectKey);
  if (!p) return { error: "Проект не найден" };
  const allowed = me.realRole === "admin" || (me.role === "contributor" && p.meta.defaultAssignee === me.youtrackLogin);
  if (!allowed) return { error: "Нет прав" };
  try {
    const clean = credentials
      .map((c) => ({ role: c.role?.trim() || undefined, env: c.env?.trim() || undefined, login: c.login?.trim() || undefined, pass: c.pass?.trim() || undefined }))
      .filter((c) => c.role || c.login || c.pass || c.env);
    await setProjectMeta(projectKey, p.name, { ...p.meta, credentials: clean });
    revalidatePath("/admin");
    revalidatePath(`/admin/projects/${projectKey}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/** Старт проекта: разбить спеку на задачи (превью, без создания). Admin. */
export async function proposeTasksFromSpec(projectKey: string, spec: string): Promise<{ tasks?: KickoffTask[]; error?: string }> {
  const me = await getPrincipal();
  if (!me || me.realRole !== "admin") return { error: "Нет прав" };
  if (!spec.trim()) return { error: "Пустая спека" };
  try {
    const p = await getProjectFull(projectKey);
    if (!p) return { error: "Проект не найден" };
    const tasks = await decomposeSpec(spec, p.name);
    return { tasks };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка декомпозиции" };
  }
}

/** Создать предложенные kickoff-задачи с зависимостями и тегами (assign — ответственный по проекту). Admin. */
export async function createKickoffTasks(projectKey: string, tasks: KickoffTask[], spec?: string): Promise<{ created?: number; error?: string }> {
  const me = await getPrincipal();
  if (!me || me.realRole !== "admin") return { error: "Нет прав" };
  if (!tasks.length) return { error: "Нет задач" };
  try {
    const be = getBackend();
    const project = (await be.listProjects()).find((p) => p.key === projectKey);
    const assignee = project?.meta.defaultAssignee || null;
    // Сохраняем полную спеку на проекте — Claude разработчика читает её как общий контекст (через dev-API).
    if (spec?.trim()) {
      const full = await getProjectFull(projectKey);
      if (full) await setProjectMeta(projectKey, full.name, { ...full.meta, spec: spec.trim() });
    }
    const ids: string[] = [];
    for (const tk of tasks) {
      const task = await be.createTask({
        projectKey,
        summary: tk.summary,
        description: tk.description || "",
        assigneeLogin: assignee,
        reporterLogin: me.youtrackLogin ?? null,
        approvalStatus: "approved",
        autoDone: true, // спека супер-админа: на готовности — авто-Готово, без ручной приёмки
      });
      await setTaskTags(task.id, { type: tk.type, complexity: tk.complexity, skills: (tk.skills || []).filter(Boolean) });
      await setTaskAiStatus(task.id, "done"); // уже размечено — отдельный триаж не нужен
      ids.push(task.id);
    }
    // Зависимости (правильный порядок выполнения).
    for (let i = 0; i < tasks.length; i++) {
      const deps = (tasks[i].dependsOn || []).filter((j) => j >= 0 && j < ids.length && j !== i).map((j) => ids[j]);
      if (deps.length) await setTaskDeps(ids[i], deps).catch(() => {});
    }
    if (assignee) await notifyLogins([assignee], `🆕 <b>Проект разбит на задачи</b> · ${project?.name || projectKey}: ${ids.length} задач(и). Делай по порядку — блокеры расставлены.`).catch(() => {});
    revalidatePath("/admin");
    return { created: ids.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка создания" };
  }
}
