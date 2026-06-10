"use server";

import { getPrincipal } from "@/lib/principal";
import { getBackend } from "@/lib/tasks";
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
