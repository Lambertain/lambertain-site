"use server";

import { requireAdmin } from "@/lib/principal";
import { createBrief, linkBriefToProject } from "@/lib/db";
import { revalidatePath } from "next/cache";

/** Завести нового лида/бриф (метка — имя/контакт). Возвращает токен для ссылки /brief/<token>. */
export async function newBrief(label: string): Promise<{ token?: string; error?: string }> {
  await requireAdmin();
  if (!label.trim()) return { error: "Укажите имя/контакт лида" };
  const { token } = await createBrief(label);
  return { token };
}

/** Привязать бриф к проекту (projectKey="" — отвязать). */
export async function linkBrief(briefId: number, projectKey: string): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  await linkBriefToProject(briefId, projectKey || null);
  revalidatePath("/admin/briefs");
  if (projectKey) revalidatePath(`/admin/projects/${projectKey}`);
  return { ok: true };
}
