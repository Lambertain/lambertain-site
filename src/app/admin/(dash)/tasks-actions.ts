"use server";

import { getPrincipal } from "@/lib/principal";
import { getBackend } from "@/lib/tasks";
import { markRead, markProjectSeen, setReviewRef, setTaskApproval } from "@/lib/db";
import { statusBucket } from "@/lib/statuses";
import { notifyProjectClients } from "@/lib/notify";
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
        await notifyProjectClients(task.projectKey, `✅ <b>Готово</b> · ${id}: ${task.summary}`);
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
  // Удалять могут админ и клиент.
  if (me.role !== "admin" && me.role !== "client" && me.realRole !== "admin") return { error: "Нет прав" };
  try {
    await getBackend().deleteTask(id);
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
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
  if (me.realRole !== "admin") {
    if (me.role !== "client") return { error: "Нет прав" };
    const task = await getBackend().getTask(id);
    if (task.projectKey !== me.projectKey) return { error: "Нет прав" };
  }
  try {
    await setTaskApproval(id, status);
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
}

/** Отметить проект просмотренным (снимает метку New с проекта). */
export async function markProjectOpened(projectKey: string): Promise<void> {
  const me = await getPrincipal();
  if (!me) return;
  await markProjectSeen(me.youtrackLogin || me.fullName || "admin", projectKey);
}
