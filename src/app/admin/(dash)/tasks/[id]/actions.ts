"use server";

import { getPrincipal } from "@/lib/principal";
import { getBackend } from "@/lib/tasks";
import { runReview, taskDiff } from "@/lib/review";
import { draftClientAnswer } from "@/lib/replies";
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
    // Уведомления (best-effort): адресно по ролям + картинки задачи.
    try {
      const task = await getBackend().getTask(id);
      const imgs = attachmentIdsIn(text, task.description);
      if (me.role === "client") {
        // Клиент написал → ответственному разработчику + админу.
        await notifyLogins(task.assignee?.login ? [task.assignee.login] : [], `💬 <b>Клиент</b> · ${id}: ${task.summary}\n${text.slice(0, 400)}`, imgs);
        await notifyAdmin(`💬 Вопрос клиента · ${id}: ${task.summary}`);
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

/** On-demand ИИ-ревью: вердикт пишется комментарием, статус не меняется. */
export async function requestAiReview(id: string): Promise<{ ok?: boolean; verdict?: "approve" | "rework"; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  // ИИ-ревью кода — инструмент админа (разработчики ревьюят через свой Claude + глазами).
  if (me.realRole !== "admin") return { error: "Нет прав" };
  try {
    const res = await runReview(id);
    const icon = res.verdict === "approve" ? "✅" : "🔧";
    // Ревью кода — внутренний коммент (клиент его не видит).
    await getBackend().addComment(id, `🤖 ИИ-ревью ${icon}\n\n${res.comment}`, "internal");
    revalidatePath(`/admin/tasks/${id}`);
    return { ok: true, verdict: res.verdict };
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
