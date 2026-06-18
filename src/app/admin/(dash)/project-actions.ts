"use server";

import { getPrincipal } from "@/lib/principal";
import { getProjectFull, setProjectMeta, setTaskTags, setTaskAiStatus, setTaskDeps, setProjectGuides, upsertSecret, deleteSecret, deleteProjectCascade, saveProjectAttachment } from "@/lib/db";
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

/** Загрузить файл в «Інфо для розробника» (проектное вложение, не привязано к задаче). Возвращает url для markdown. Admin. */
export async function uploadProjectFile(projectKey: string, file: { mime: string; data: string; name: string }): Promise<{ url?: string; name?: string; error?: string }> {
  const me = await getPrincipal();
  if (!me || me.realRole !== "admin") return { error: "Нет прав" };
  if (!file?.data) return { error: "Пустой файл" };
  const id = await saveProjectAttachment(projectKey, file.mime || "application/octet-stream", file.data, file.name || "file");
  if (id == null) return { error: "Проект не найден" };
  return { url: `/api/files/${id}`, name: file.name || "file" };
}

/** Включить клиенту набор гайдов на проекте. Admin. */
export async function saveProjectGuides(projectKey: string, guideIds: number[]): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me || me.realRole !== "admin") return { error: "Нет прав" };
  await setProjectGuides(projectKey, guideIds);
  revalidatePath(`/admin/projects/${projectKey}`);
  revalidatePath("/admin");
  return { ok: true };
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
      await setTaskTags(task.id, { type: tk.type, complexity: tk.complexity, skills: (Array.isArray(tk.skills) ? tk.skills : []).filter(Boolean) });
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

/** Полное удаление проекта (только админ; подтверждается вводом названия на клиенте). */
export async function deleteProject(projectKey: string, confirmName: string): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me || me.realRole !== "admin") return { error: "Нет прав" };
  const p = await getProjectFull(projectKey);
  if (!p) return { error: "Проект не найден" };
  if (confirmName.trim() !== p.name.trim()) return { error: "Название не совпадает" };
  await deleteProjectCascade(projectKey);
  revalidatePath("/admin/projects");
  revalidatePath("/admin");
  return { ok: true };
}

// ——— Секреты проекта (только админ; разработчик-человек не видит) ———
export async function saveSecret(projectKey: string, input: { name: string; value: string; note?: string; env?: string }): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me || me.realRole !== "admin") return { error: "Нет прав" };
  if (!input.name.trim()) return { error: "Назва порожня" };
  await upsertSecret(projectKey, { name: input.name, value: input.value || null, note: input.note || null, env: input.env || null, filledBy: "admin" });
  revalidatePath(`/admin/projects/${projectKey}`);
  return { ok: true };
}
export async function removeSecret(projectKey: string, id: number): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me || me.realRole !== "admin") return { error: "Нет прав" };
  await deleteSecret(id);
  revalidatePath(`/admin/projects/${projectKey}`);
  return { ok: true };
}
