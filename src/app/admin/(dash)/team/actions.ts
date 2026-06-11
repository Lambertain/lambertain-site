"use server";

import { requireAdmin } from "@/lib/principal";
import { generateInvite } from "@/lib/invites";
import { upsertLink, upsertMember, deleteAccessRequest, setDevProjects, relinkMember, createProject } from "@/lib/db";
import { sendTo } from "@/lib/notify";
import { revalidatePath } from "next/cache";
import type { Role } from "@/lib/tasks/types";

const PERSON_ROLES: Role[] = ["client", "contributor", "employee"];

export async function createInviteLink(
  role: Role,
  projectKeys: string[],
): Promise<{ link?: string; error?: string }> {
  try {
    await requireAdmin();
    if (!PERSON_ROLES.includes(role)) return { error: "Недопустимая роль" };
    if (role !== "contributor" && projectKeys.length === 0) return { error: "Выберите проект" };
    const { link } = await generateInvite(role, projectKeys);
    return { link };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/** Быстро создать проект прямо из формы инвайта. Возвращает ключ и название. */
export async function createProjectQuick(
  key: string,
  name: string,
): Promise<{ key?: string; name?: string; error?: string }> {
  try {
    await requireAdmin();
    const k = key.trim().toUpperCase();
    const n = name.trim();
    if (!k || !n) return { error: "Укажите ключ и название" };
    if (!/^[A-Z0-9]+$/.test(k)) return { error: "Ключ — латиница/цифры" };
    await createProject(k, n);
    revalidatePath("/admin/team");
    revalidatePath("/admin/projects");
    return { key: k, name: n };
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
    // Разработчик → ответственный на проекте (попадает на дашборд); клиент/сотрудник → его project_key.
    if (role === "contributor" && projectKey) await setDevProjects(login, [projectKey]);
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

/** Привязать историю старого ника YouTrack (orig_*) к существующему tg-пользователю. */
export async function relinkHistory(
  origLogin: string,
  newLogin: string,
): Promise<{ ok?: boolean; comments?: number; tasks?: number; error?: string }> {
  try {
    await requireAdmin();
    if (!origLogin || !newLogin) return { error: "Укажите старый логин и пользователя" };
    const r = await relinkMember(origLogin, newLogin);
    revalidatePath("/admin/team");
    revalidatePath("/admin");
    return { ok: true, comments: r.comments, tasks: r.assignee + r.reporter };
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
