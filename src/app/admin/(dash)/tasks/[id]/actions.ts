"use server";

import { getPrincipal } from "@/lib/principal";
import { getBackend } from "@/lib/tasks";
import { setTaskDeps } from "@/lib/db";
import { runReview } from "@/lib/review";
import { revalidatePath } from "next/cache";

export async function addTaskComment(
  id: string,
  text: string,
): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  if (!text.trim()) return { error: "Пустой комментарий" };
  try {
    await getBackend().addComment(id, text);
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
  if (me.role !== "contributor" && me.realRole !== "admin") return { error: "Нет прав" };
  try {
    const res = await runReview(id);
    const icon = res.verdict === "approve" ? "✅" : "🔧";
    await getBackend().addComment(id, `🤖 ИИ-ревью ${icon}\n\n${res.comment}`);
    revalidatePath(`/admin/tasks/${id}`);
    return { ok: true, verdict: res.verdict };
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
