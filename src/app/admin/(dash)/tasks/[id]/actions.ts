"use server";

import { after } from "next/server";
import { getPrincipal } from "@/lib/principal";
import { getBackend } from "@/lib/tasks";
import { taskDiff } from "@/lib/review";
import { draftClientAnswer } from "@/lib/replies";
import { draftTask } from "@/lib/drafter";
import { getTaskAiStatus, setTaskAiStatus, updateTaskFields, saveAttachment } from "@/lib/db";
import { notifyLogins, notifyProjectClients, notifyAdmin, attachmentIdsIn } from "@/lib/notify";
import { statusBucket } from "@/lib/statuses";
import { revalidatePath } from "next/cache";

export async function addTaskComment(
  id: string,
  text: string,
  visibleToClient?: boolean,
  attachments?: { localId: string; mime: string; data: string; name: string; image: boolean }[],
): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  if (!text.trim() && !attachments?.length) return { error: "Пустой комментарий" };
  // Клиент всегда пишет клиенту видимый коммент. Команда выбирает: по умолчанию внутренний.
  const visibility: "client" | "internal" = me.role === "client" ? "client" : visibleToClient ? "client" : "internal";
  try {
    // Сохраняем вложения и подставляем реальные ссылки вместо маркеров att:<localId>.
    let body = text;
    for (const a of attachments ?? []) {
      const aid = await saveAttachment(id, a.mime, a.data, a.name);
      if (aid) body = body.replaceAll(`att:${a.localId}`, `/api/files/${aid}`);
    }
    await getBackend().addComment(id, body, visibility);
    revalidatePath(`/admin/tasks/${id}`);
    // Клиент ответил: возобновить ИИ-триаж (если ждал) и разблокировать задачу (если была Blocked из-за эскалации).
    if (me.role === "client") {
      const ai = await getTaskAiStatus(id).catch(() => null);
      if (ai === "waiting") {
        await setTaskAiStatus(id, "pending").catch(() => {});
        after(() => draftTask(id));
      }
      try {
        const t = await getBackend().getTask(id);
        if (statusBucket(t.state) === "blocked") await getBackend().updateStatus(id, "In Progress");
      } catch { /* best-effort */ }
    }
    // Уведомления (best-effort): адресно по ролям + картинки задачи.
    try {
      const task = await getBackend().getTask(id);
      const imgs = attachmentIdsIn(body, task.description);
      const projName = (await getBackend().listProjects().catch(() => [])).find((p) => p.key === task.projectKey)?.name || task.projectKey;
      if (me.role === "client") {
        // Клиент написал → ответственному разработчику + админу.
        await notifyLogins(task.assignee?.login ? [task.assignee.login] : [], `💬 <b>Клиент</b> · ${id}: ${task.summary}\n${body.slice(0, 400)}`, imgs);
        await notifyAdmin(`💬 <b>Вопрос клиента</b>\nПроект «${projName}»\n${id}: ${task.summary}`);
      } else if (visibility === "client") {
        // Команда ответила клиенту → клиенту/сотруднику проекта.
        await notifyProjectClients(task.projectKey, `💬 <b>${id}</b>: ${task.summary}\n${body.slice(0, 400)}`, imgs);
      } else if (task.assignee?.login && task.assignee.login !== me.youtrackLogin) {
        // Внутренний коммент → ответственному разработчику.
        await notifyLogins([task.assignee.login], `📝 <b>${id}</b> (внутр.): ${body.slice(0, 300)}`, imgs);
      }
    } catch {
      // уведомления не должны валить коммент
    }
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/**
 * Постановщик проверил задачу в «Ревью»: принять (→ Готово) или вернуть на доработку (→ Доработка).
 * Право: автор задачи (reporter) или админ.
 */
export async function reviewTask(id: string, accept: boolean, note?: string): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  const be = getBackend();
  try {
    const task = await be.getTask(id);
    const isReporter = !!me.youtrackLogin && task.reporter?.login === me.youtrackLogin;
    if (me.realRole !== "admin" && !isReporter) return { error: "Нет прав" };
    if (accept) {
      await be.updateStatus(id, "Done");
      if (task.assignee?.login) await notifyLogins([task.assignee.login], `✅ <b>Принято</b> · ${id}: ${task.summary}`).catch(() => {});
    } else {
      await be.updateStatus(id, "Rework");
      if (note?.trim()) await be.addComment(id, `🔧 <b>На доработку:</b>\n\n${note.trim()}`, "internal");
      if (task.assignee?.login) await notifyLogins([task.assignee.login], `🔧 <b>На доработку</b> · ${id}: ${task.summary}${note?.trim() ? `\n${note.trim().slice(0, 300)}` : ""}`).catch(() => {});
    }
    revalidatePath(`/admin/tasks/${id}`);
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/** Редактировать задачу (admin): заголовок, текст запроса, исполнитель, приоритет. */
export async function editTask(
  id: string,
  fields: { summary?: string; description?: string; assigneeLogin?: string | null; priority?: string | null },
): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me || me.realRole !== "admin") return { error: "Нет прав" };
  try {
    await updateTaskFields(id, {
      title: fields.summary,
      description: fields.description,
      assigneeLogin: fields.assigneeLogin,
      priority: fields.priority,
    });
    revalidatePath(`/admin/tasks/${id}`);
    revalidatePath("/admin");
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
