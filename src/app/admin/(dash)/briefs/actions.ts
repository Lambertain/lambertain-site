"use server";

import { requireAdmin } from "@/lib/principal";
import { createBrief, linkBriefToProject } from "@/lib/db";
import { briefLink } from "@/lib/invites";
import { revalidatePath } from "next/cache";

/** Завести новый бриф. Контакт лида определится по Telegram при заполнении — метку указывать необязательно.
 *  Возвращает Mini App ссылку: клиент авторизуется в боте → попадает как лид. */
export async function newBrief(label: string): Promise<{ token?: string; link?: string; error?: string }> {
  await requireAdmin();
  const { token } = await createBrief(label.trim() || "лід");
  revalidatePath("/admin/briefs");
  return { token, link: briefLink(token) };
}

/** Привязать бриф к проекту (projectKey="" — отвязать). */
export async function linkBrief(briefId: number, projectKey: string): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  await linkBriefToProject(briefId, projectKey || null);
  revalidatePath("/admin/briefs");
  if (projectKey) revalidatePath(`/admin/projects/${projectKey}`);
  return { ok: true };
}
