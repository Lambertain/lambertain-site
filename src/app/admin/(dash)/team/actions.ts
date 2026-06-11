"use server";

import { requireAdmin } from "@/lib/principal";
import { generateInvite } from "@/lib/invites";
import { upsertLink, upsertMember, deleteAccessRequest, setDevProjects } from "@/lib/db";
import { sendTo } from "@/lib/notify";
import { revalidatePath } from "next/cache";
import type { Role } from "@/lib/tasks/types";

const PERSON_ROLES: Role[] = ["client", "contributor", "employee"];

export async function createInviteLink(
  role: Role,
  projectKey: string,
): Promise<{ link?: string; error?: string }> {
  try {
    await requireAdmin();
    if (!PERSON_ROLES.includes(role)) return { error: "Недопустимая роль" };
    const { link } = await generateInvite(role, projectKey || null);
    return { link };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/** Подтвердить заявку: создать участника из Telegram-личности и связать с ролью и проектом. */
export async function approveAccess(
  tgId: number,
  username: string | null,
  fullName: string,
  role: Role,
  projectKey: string,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requireAdmin();
    if (!PERSON_ROLES.includes(role)) return { error: "Недопустимая роль" };
    const login = username ? username.toLowerCase() : `tg${tgId}`;
    await upsertMember(login, fullName || login, role, tgId);
    await upsertLink({ tg_id: tgId, youtrack_login: login, role, full_name: fullName || login, project_key: projectKey || null });
    await deleteAccessRequest(tgId);
    await sendTo(tgId, "✅ Доступ открыт. Откройте PM-портал через меню бота — теперь вы авторизованы.");
    revalidatePath("/admin/team");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/** Назначить разработчику набор проектов (он становится ответственным на них). */
export async function saveDevProjects(login: string, keys: string[]): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requireAdmin();
    if (!login) return { error: "no login" };
    await setDevProjects(login, keys);
    revalidatePath("/admin/team");
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

export async function rejectAccess(tgId: number): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requireAdmin();
    await deleteAccessRequest(tgId);
    revalidatePath("/admin/team");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}
