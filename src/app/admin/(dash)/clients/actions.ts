"use server";

import { requireAdmin } from "@/lib/principal";
import { getBackend } from "@/lib/tasks";
import { draftClientReply } from "@/lib/replies";

export async function draftReply(
  taskId: string,
  question: string,
): Promise<{ draft?: string; error?: string }> {
  try {
    await requireAdmin();
    const be = getBackend();
    const [task, comments] = await Promise.all([be.getTask(taskId), be.getComments(taskId)]);
    const draft = await draftClientReply(task, question, comments);
    return { draft };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка генерации" };
  }
}

export async function publishReply(
  taskId: string,
  text: string,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requireAdmin();
    if (!text.trim()) return { error: "Пустой ответ" };
    const be = getBackend();
    await be.addComment(taskId, text);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка публикации" };
  }
}
