"use server";

import { getPrincipal, isSuperAdmin } from "@/lib/principal";
import { getBackend } from "@/lib/tasks";
import { markRead, markProjectSeen, setReviewRef, setTaskApproval, moveTaskToProject, markTaskNotificationsRead, setDeployStage, getProjectFull } from "@/lib/db";
import { advanceStage } from "@/lib/deploy-stage";
import { autoDeliverAndNotify } from "@/lib/auto-deliver";
import { assignProjectDevAndNotify } from "@/lib/task-intake";
import { statusBucket } from "@/lib/statuses";
import { notifyProjectClients, notifyLogins, taskTag } from "@/lib/notify";
import { PORTAL_BASE } from "@/lib/dev-protocol";
import { syncTaskToTrello } from "@/lib/trello";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

export async function updateTaskStatus(id: string, status: string): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  try {
    const bucketTarget = statusBucket(status);
    // DEV-36: клиент не может принять («Готово») или вернуть («Доработка») задачу, пока она не опубликована
    // (стадия prod = «Опубліковано»). До публикации он ещё не видит результат на рабочем сайте.
    if (me.role === "client" && (bucketTarget === "done" || bucketTarget === "rework")) {
      const t = await getBackend().getTask(id).catch(() => null);
      if (t && t.deployStage !== "prod") {
        return { error: "Поки задачу не опубліковано, її не можна прийняти або повернути на доопрацювання." };
      }
    }
    // DEV-32: актор смены статуса — текущий пользователь (ручная смена в портале).
    const evt = { actorLogin: me.youtrackLogin ?? null, actorRole: me.role ?? "admin", trigger: "ручна зміна у порталі" };
    await getBackend().updateStatus(id, status, evt);
    after(() => syncTaskToTrello(id, status)); // Trello: подвинуть связанную карточку под новый статус
    // Деплой-стадия от статуса: взял в работу → «Готується» (pr); на ревью → «На тестовому» (dev). prod ставит доставка.
    const bucket = bucketTarget;
    if (bucket === "inProgress") await setDeployStage(id, "pr", evt).catch(() => {});
    else if (bucket === "review") await advanceStage(id, "dev", "здав на ревʼю у порталі").catch(() => {}); // + коммент клиенту «на тестовому»
    revalidatePath("/admin");
    revalidatePath("/admin/tasks");
    // Задача готова.
    if (bucket === "done") {
      try {
        const task = await getBackend().getTask(id);
        const proj = await getProjectFull(task.projectKey).catch(() => null);
        // Ручной перевод в «Готово» в портале ТОЖЕ должен доставлять код клиенту (если включена автодоставка),
        // иначе изменения зависают недоставленными (разработчик потом просит «доставить ещё раз»).
        // gitflow доставляет PR-ом на ревью — его тут не трогаем. Уже опубликованное (deployStage=prod) — пропускаем.
        if (proj?.meta.autoDeliver && !proj.meta.gitflowDelivery && task.deployStage !== "prod") {
          const meta = proj.meta;
          after(() => autoDeliverAndNotify(task.projectKey, meta, id)); // доставит + опубликует + уведомит (сам шлёт «Опубліковано»)
        } else {
          await notifyProjectClients(task.projectKey, `✅ <b>Готово</b> · ${await taskTag(id)}: ${task.summary}`);
        }
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
    after(() => syncTaskToTrello(id, "Review")); // Trello: карточку → колонка тестирования
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
    // Клиент может быть в нескольких проектах — задача должна быть в одном из них.
    const myKeys = me.projectKeys?.length ? me.projectKeys : me.projectKey ? [me.projectKey] : [];
    if (!myKeys.includes(task.projectKey)) return { error: "Нет прав" };
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
          await notifyLogins([task.reporter.login], `↩️ <b>Повернуто на доопрацювання</b> · ${await taskTag(id)}: ${task.summary}`, [], { text: "Відкрити задачу", url: `${PORTAL_BASE}/admin/tasks/${id}` });
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
