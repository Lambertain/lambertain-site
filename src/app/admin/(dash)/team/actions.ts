"use server";

import { requireAdmin } from "@/lib/principal";
import { generateInvite } from "@/lib/invites";
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
