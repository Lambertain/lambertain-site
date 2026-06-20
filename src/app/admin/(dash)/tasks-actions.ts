"use server";

import { getPrincipal, isSuperAdmin } from "@/lib/principal";
import { getBackend } from "@/lib/tasks";
import { markRead, markProjectSeen, setReviewRef, setTaskApproval, moveTaskToProject, markTaskNotificationsRead, setDeployStage } from "@/lib/db";
import { advanceStage } from "@/lib/deploy-stage";
import { assignProjectDevAndNotify } from "@/lib/task-intake";
import { statusBucket } from "@/lib/statuses";
import { notifyProjectClients, notifyLogins, taskTag } from "@/lib/notify";
import { PORTAL_BASE } from "@/lib/dev-protocol";
import { revalidatePath } from "next/cache";

export async function updateTaskStatus(id: string, status: string): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  try {
    await getBackend().updateStatus(id, status);
    // Деплой-стадия от статуса: взял в работу → «Готується» (pr); на ревью → «На тестовому» (dev). prod ставит доставка.
    const bucket = statusBucket(status);
    if (bucket === "inProgress") await setDeployStage(id, "pr").catch(() => {});
    else if (bucket === "review") await advanceStage(id, "dev").catch(() => {}); // + коммент клиенту «на тестовому»
    revalidatePath("/admin");
    revalidatePath("/admin/tasks");
    // Задача готова → уведомляем клиента проекта (best-effort).
    if (bucket === "done") {
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
  // Автор (разработчик/сотрудник/клиент) может удалить СВОЮ задачу, пока она ещё НЕ взята в работу (статус Open).
  if (!allowed && me.youtrackLogin) {
    try {
      const task = await getBackend().getTask(id);
      if (task.reporter?.login === me.youtrackLogin && statusBucket(task.state) === "notStarted") allowed = true;
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
    await advanceStage(id, "dev").catch(() => {}); // на ревью = на дев-мейн → «На тестовому сайті» + коммент клиенту
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
    // После утверждения — отдаём задачу разработчику проекта (назначаем + пуш). Отклонённую не трогаем.
    if (status === "approved") {
      await assignProjectDevAndNotify(id).catch(() => {});
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
