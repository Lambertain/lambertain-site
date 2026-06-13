"use server";

import { getPrincipal } from "@/lib/principal";
import { getProjectFull, setProjectMeta } from "@/lib/db";
import { revalidatePath } from "next/cache";

type Cred = { role?: string; env?: string; login?: string; pass?: string };

/** Сохранить аккаунты входа проекта. Право: админ или разработчик-ответственный проекта. */
export async function saveCredentials(projectKey: string, credentials: Cred[]): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  const p = await getProjectFull(projectKey);
  if (!p) return { error: "Проект не найден" };
  const allowed = me.realRole === "admin" || (me.role === "contributor" && p.meta.defaultAssignee === me.youtrackLogin);
  if (!allowed) return { error: "Нет прав" };
  try {
    const clean = credentials
      .map((c) => ({ role: c.role?.trim() || undefined, env: c.env?.trim() || undefined, login: c.login?.trim() || undefined, pass: c.pass?.trim() || undefined }))
      .filter((c) => c.role || c.login || c.pass || c.env);
    await setProjectMeta(projectKey, p.name, { ...p.meta, credentials: clean });
    revalidatePath("/admin");
    revalidatePath(`/admin/projects/${projectKey}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}
