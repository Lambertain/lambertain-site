"use server";

import { getPrincipal } from "@/lib/principal";
import { getBackend } from "@/lib/tasks";
import { setTaskDeps } from "@/lib/db";
import { runReview, taskDiff } from "@/lib/review";
import { draftReplyFromDevFeedback } from "@/lib/replies";
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

/** Черновик ответа клиенту по фидбеку разработчика (ИИ сверяет с задачей и кодом). Не публикует. */
export async function draftClientReply(
  id: string,
  feedback: string,
): Promise<{ draft?: string; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  if (me.role !== "contributor" && me.realRole !== "admin") return { error: "Нет прав" };
  if (!feedback.trim()) return { error: "Опиши, что передать клиенту" };
  try {
    const be = getBackend();
    const [task, comments] = await Promise.all([be.getTask(id), be.getComments(id)]);
    const lastClient = [...comments].reverse().find((c) => c.author.role === "client");
    const code = await taskDiff(id).catch(() => null);
    const draft = await draftReplyFromDevFeedback(task, lastClient?.text || "", feedback, comments, code);
    return { draft };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/** Задать блокеры задачи (readable_id других задач). */
export async function setTaskDependencies(id: string, deps: string[]): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  if (me.role !== "contributor" && me.realRole !== "admin") return { error: "Нет прав" };
  try {
    await setTaskDeps(id, deps);
    revalidatePath(`/admin/tasks/${id}`);
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}
