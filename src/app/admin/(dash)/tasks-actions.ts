"use server";

import { after } from "next/server";
import { getPrincipal, isSuperAdmin } from "@/lib/principal";
import { getBackend } from "@/lib/tasks";
import { markRead, markProjectSeen, setReviewRef, setTaskApproval, setTaskAiStatus, getTaskAiStatus, moveTaskToProject, markTaskNotificationsRead } from "@/lib/db";
import { draftTask } from "@/lib/drafter";
import { statusBucket } from "@/lib/statuses";
import { notifyProjectClients, notifyLogins, taskTag } from "@/lib/notify";
import { PORTAL_BASE } from "@/lib/dev-protocol";
import { revalidatePath } from "next/cache";

export async function updateTaskStatus(id: string, status: string): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  try {
    await getBackend().updateStatus(id, status);
    revalidatePath("/admin");
    revalidatePath("/admin/tasks");
    // Задача готова → уведомляем клиента проекта (best-effort).
    if (statusBucket(status) === "done") {
      try {
        const task = await getBackend().getTask(id);
        await notifyProjectClients(task.projectKey, `✅ <b>Готово</b> · ${await taskTag(id)}: ${task.summary}`);
      } catch {
        // best-effort
      }
    }
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

export async function deleteTask(id: string): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  const adminOrClient = me.role === "admin" || me.role === "client" || me.realRole === "admin";
  let allowed = adminOrClient;
  // Автор (разработчик/сотрудник/клиент) может удалить СВОЮ задачу в окне ДО триажа (ai_status='pending').
  if (!allowed && me.youtrackLogin) {
    try {
      const task = await getBackend().getTask(id);
      const ai = await getTaskAiStatus(id);
      if (task.reporter?.login === me.youtrackLogin && ai === "pending") allowed = true;
    } catch { /* ignore */ }
  }
  if (!allowed) return { error: "Нет прав" };
  try {
    await getBackend().deleteTask(id);
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/** Перенести задачу в другой проект (новый № в целевом проекте). Только супер-админ (Никита). */
export async function moveTask(id: string, targetProjectKey: string): Promise<{ ok?: boolean; to?: string; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  if (!isSuperAdmin(me)) return { error: "Нет прав" };
  const res = await moveTaskToProject(id, targetProjectKey);
  if ("error" in res) return { error: res.error };
  revalidatePath("/admin");
  revalidatePath("/admin/tasks");
  revalidatePath(`/admin/tasks/${res.to}`);
  return { ok: true, to: res.to };
}

/** Перевод задачи в «Ревью» с опциональной ссылкой на код. ИИ-ревью запустит поллер. */
export async function moveToReview(id: string, ref: string): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  if (me.role !== "contributor" && me.realRole !== "admin") return { error: "Нет прав" };
  try {
    await getBackend().updateStatus(id, "Review");
    await setReviewRef(id, ref.trim() || null);
    revalidatePath("/admin");
    revalidatePath("/admin/tasks");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/** Утвердить/отклонить задачу сотрудника: админ — всегда; клиент — задачи своего проекта. */
export async function setApproval(id: string, status: "approved" | "rejected"): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  // Утверждает супер-админ (Никита) или клиент своего проекта. Обычный админ — не утверждает.
  if (!isSuperAdmin(me)) {
    if (me.role !== "client") return { error: "Нет прав" };
    const task = await getBackend().getTask(id);
    if (task.projectKey !== me.projectKey) return { error: "Нет прав" };
  }
  try {
    await setTaskApproval(id, status);
    // После утверждения — запускаем ИИ-проработку (если ещё не запускалась). Отклонённую не прорабатываем.
    if (status === "approved") {
      const ai = await getTaskAiStatus(id).catch(() => null);
      if (!ai) {
        await setTaskAiStatus(id, "pending");
        after(() => draftTask(id));
      }
    } else {
      // Reject → задача на «Доработку» + уведомление постановщику (создателю), чтобы доработал.
      await getBackend().updateStatus(id, "Rework").catch(() => {});
      try {
        const task = await getBackend().getTask(id);
        if (task.reporter?.login) {
          await notifyLogins([task.reporter.login], `↩️ <b>Возвращено на доработку</b> · ${await taskTag(id)}: ${task.summary}`, [], { text: "Открыть задачу", url: `${PORTAL_BASE}/admin/tasks/${id}` });
        }
      } catch { /* уведомление не критично */ }
    }
    revalidatePath(`/admin/tasks/${id}`);
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

export async function markTaskRead(id: string): Promise<void> {
  const me = await getPrincipal();
  if (!me) return;
  await markRead(me.youtrackLogin || me.fullName || "admin", id);
  // Открыл задачу → её уведомления в колокольчике прочитаны.
  if (me.tgId) await markTaskNotificationsRead(me.tgId, id).catch(() => {});
}

/** Отметить проект просмотренным (снимает метку New с проекта). */
export async function markProjectOpened(projectKey: string): Promise<void> {
  const me = await getPrincipal();
  if (!me) return;
  await markProjectSeen(me.youtrackLogin || me.fullName || "admin", projectKey);
}
