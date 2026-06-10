"use server";

import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/principal";
import { setProjectToken, createProject, setProjectMeta } from "@/lib/db";
import type { ProjectMeta } from "@/lib/tasks/types";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function generateProjectToken(projectKey: string): Promise<{ token?: string; error?: string }> {
  try {
    await requireAdmin();
    if (!projectKey) return { error: "no project" };
    const token = `pk_${randomBytes(20).toString("hex")}`;
    await setProjectToken(projectKey, token);
    revalidatePath(`/admin/projects/${projectKey}`);
    return { token };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

export async function addProject(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  await requireAdmin();
  const key = String(formData.get("key") || "").trim().toUpperCase();
  const name = String(formData.get("name") || "").trim();
  if (!key || !name) return { error: "Укажите ключ и название" };
  if (!/^[A-Z0-9]+$/.test(key)) return { error: "Ключ — латиница/цифры" };
  await createProject(key, name);
  redirect(`/admin/projects/${key}`);
}

export async function saveMeta(
  key: string,
  name: string,
  meta: ProjectMeta,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requireAdmin();
    await setProjectMeta(key, name, meta);
    revalidatePath(`/admin/projects/${key}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}
