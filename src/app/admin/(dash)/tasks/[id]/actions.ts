"use server";

import { after } from "next/server";
import { getPrincipal } from "@/lib/principal";
import { getBackend } from "@/lib/tasks";
import { taskDiff } from "@/lib/review";
import { draftClientAnswer } from "@/lib/replies";
import { draftTask } from "@/lib/drafter";
import { getTaskAiStatus, setTaskAiStatus } from "@/lib/db";
import { notifyLogins, notifyProjectClients, notifyAdmin, attachmentIdsIn } from "@/lib/notify";
import { revalidatePath } from "next/cache";

export async function addTaskComment(
  id: string,
  text: string,
  visibleToClient?: boolean,
): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  if (!text.trim()) return { error: "Пустой комментарий" };
  // Клиент всегда пишет клиенту видимый коммент. Команда выбирает: по умолчанию внутренний.
  const visibility: "client" | "internal" = me.role === "client" ? "client" : visibleToClient ? "client" : "internal";
  try {
    await getBackend().addComment(id, text, visibility);
    revalidatePath(`/admin/tasks/${id}`);
    // Клиент ответил на уточняющий вопрос ИИ-проработки → возобновить проработку в фоне.
    if (me.role === "client") {
      const ai = await getTaskAiStatus(id).catch(() => null);
      if (ai === "waiting") {
        await setTaskAiStatus(id, "pending").catch(() => {});
        after(() => draftTask(id));
      }
    }
    // Уведомления (best-effort): адресно по ролям + картинки задачи.
    try {
      const task = await getBackend().getTask(id);
      const imgs = attachmentIdsIn(text, task.description);
      const projName = (await getBackend().listProjects().catch(() => [])).find((p) => p.key === task.projectKey)?.name || task.projectKey;
      if (me.role === "client") {
        // Клиент написал → ответственному разработчику + админу.
        await notifyLogins(task.assignee?.login ? [task.assignee.login] : [], `💬 <b>Клиент</b> · ${id}: ${task.summary}\n${text.slice(0, 400)}`, imgs);
        await notifyAdmin(`💬 <b>Вопрос клиента</b>\nПроект «${projName}»\n${id}: ${task.summary}`);
      } else if (visibility === "client") {
        // Команда ответила клиенту → клиенту/сотруднику проекта.
        await notifyProjectClients(task.projectKey, `💬 <b>${id}</b>: ${task.summary}\n${text.slice(0, 400)}`, imgs);
      } else if (task.assignee?.login && task.assignee.login !== me.youtrackLogin) {
        // Внутренний коммент → ответственному разработчику.
        await notifyLogins([task.assignee.login], `📝 <b>${id}</b> (внутр.): ${text.slice(0, 300)}`, imgs);
      }
    } catch {
      // уведомления не должны валить коммент
    }
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/** Перезапустить ИИ-проработку задачи (admin) — если зависла/нужно переделать. */
export async function retryDrafting(id: string): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me || me.realRole !== "admin") return { error: "Нет прав" };
  try {
    await setTaskAiStatus(id, "pending");
    after(() => draftTask(id));
    revalidatePath(`/admin/tasks/${id}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/**
 * Черновик ответа клиенту: ИИ читает задачу, комменты и код и сам предлагает ответ.
 * instructions — правки разработчика; priorDraft — текущая версия (переработать). Не публикует.
 */
export async function draftClientReply(
  id: string,
  instructions?: string,
  priorDraft?: string,
): Promise<{ draft?: string; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  if (me.role !== "contributor" && me.realRole !== "admin") return { error: "Нет прав" };
  try {
    const be = getBackend();
    const [task, comments] = await Promise.all([be.getTask(id), be.getComments(id)]);
    const lastClient = [...comments].reverse().find((c) => c.author.role === "client");
    const code = await taskDiff(id).catch(() => null);
    const draft = await draftClientAnswer(task, lastClient?.text || "", comments, code, instructions, priorDraft);
    return { draft };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}
