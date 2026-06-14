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

/**
 * Старт проекта одной кнопкой: берём СОХРАНЁННУЮ спеку проекта (`meta.spec`), разбиваем на задачи и СРАЗУ создаём
 * (с зависимостями, тегами, assign на ответственного). Без превью/апрува и без второго поля спеки. Admin.
 */
export async function kickoffFromSpec(projectKey: string): Promise<{ created?: number; error?: string }> {
  const me = await getPrincipal();
  if (!me || me.realRole !== "admin") return { error: "Нет прав" };
  const p = await getProjectFull(projectKey);
  if (!p) return { error: "Проект не найден" };
  const spec = (p.meta.spec || "").trim();
  if (!spec) return { error: "Сначала заполните и сохраните «Спека проекта» выше." };
  try {
    const tasks: KickoffTask[] = await decomposeSpec(spec, p.name);
    if (!tasks.length) return { error: "Не удалось разбить спеку на задачи" };
    const be = getBackend();
    const assignee = p.meta.defaultAssignee || null;
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
    if (assignee) await notifyLogins([assignee], `🆕 <b>Проект разбит на задачи</b> · ${p.name}: ${ids.length} задач(и). Делай по порядку — блокеры расставлены.`).catch(() => {});
    revalidatePath("/admin");
    revalidatePath(`/admin/projects/${projectKey}`);
    return { created: ids.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка декомпозиции/создания" };
  }
}
