"use server";

import { getPrincipal } from "@/lib/principal";
import { getBackend } from "@/lib/tasks";
import { structureTask } from "@/lib/structurer";
import type { DraftTask } from "@/lib/tasks/types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
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
    const task = await be.createTask({
      projectKey: draft.projectKey,
      summary: draft.summary,
      description: draft.description,
      assigneeLogin: draft.assigneeLogin ?? null,
      dueDate: draft.dueDate ?? null,
      priority: draft.priority ?? null,
    });
    return { id: task.id, url: task.url };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка создания задачи" };
  }
}
