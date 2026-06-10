"use server";

import { requireAdmin } from "@/lib/principal";
import { generateInvite } from "@/lib/invites";
import { upsertLink, deleteAccessRequest } from "@/lib/db";
import { sendTo } from "@/lib/notify";
import { revalidatePath } from "next/cache";
import type { Role } from "@/lib/tasks/types";

export async function createInviteLink(
  youtrackLogin: string,
  role: Role,
): Promise<{ link?: string; error?: string }> {
  try {
    await requireAdmin();
    if (!youtrackLogin) return { error: "Не выбран пользователь" };
    if (role !== "client" && role !== "contributor") return { error: "Недопустимая роль" };
    const { link } = await generateInvite(youtrackLogin, role);
    return { link };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/** Подтвердить заявку: привязать tg-пользователя к YouTrack-логину и роли. */
export async function approveAccess(
  tgId: number,
  fullName: string,
  youtrackLogin: string,
  role: Role,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requireAdmin();
    if (!youtrackLogin) return { error: "Выберите YouTrack-логин" };
    if (role !== "client" && role !== "contributor") return { error: "Недопустимая роль" };
    await upsertLink({ tg_id: tgId, youtrack_login: youtrackLogin, role, full_name: fullName });
    await deleteAccessRequest(tgId);
    await sendTo(
      tgId,
      "✅ Доступ открыт. Откройте PM-портал через меню бота — теперь вы авторизованы.",
    );
    revalidatePath("/admin/team");
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
