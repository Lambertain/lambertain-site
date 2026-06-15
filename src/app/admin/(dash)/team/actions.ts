"use server";

import { requireAdmin } from "@/lib/principal";
import { generateInvite } from "@/lib/invites";
import { upsertLink, upsertMember, deleteAccessRequest, setDevProjects, relinkMember, createProject, generateProjectKey, renameMember, setLinkProject, setMemberProjects, deleteMember, updateBriefLabel, linkBriefToProject } from "@/lib/db";
import { getBackend } from "@/lib/tasks";
import { sendTo, notifyLogins } from "@/lib/notify";
import { revalidatePath } from "next/cache";
import type { Role } from "@/lib/tasks/types";

const PERSON_ROLES: Role[] = ["client", "contributor", "employee", "admin"];

export async function createInviteLink(
  role: Role,
  projectKeys: string[],
  showOnboarding = false,
  instructionSetToken: string | null = null,
): Promise<{ link?: string; error?: string }> {
  try {
    await requireAdmin();
    if (!PERSON_ROLES.includes(role)) return { error: "Недопустимая роль" };
    // Проект обязателен только клиенту/сотруднику; админ/разработчик — без проекта.
    if ((role === "client" || role === "employee") && projectKeys.length === 0) return { error: "Выберите проект" };
    const { link } = await generateInvite(
      role, projectKeys, undefined,
      role === "client" && showOnboarding,
      role === "client" ? instructionSetToken : null,
    );
    return { link };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/** Переименовать лида (название брифа). */
export async function updateLeadLabel(briefId: number, label: string): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  await updateBriefLabel(briefId, label);
  revalidatePath("/admin/team");
  return { ok: true };
}

/** Завести проект на лида: создать проект (имя) и привязать к нему бриф. */
export async function createProjectFromLead(briefId: number, name: string): Promise<{ key?: string; name?: string; error?: string }> {
  try {
    await requireAdmin();
    const n = name.trim();
    if (!n) return { error: "Укажите название проекта" };
    const k = await generateProjectKey(n);
    await createProject(k, n);
    await linkBriefToProject(briefId, k);
    revalidatePath("/admin/team");
    revalidatePath("/admin/projects");
    return { key: k, name: n };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/** Быстро создать проект прямо из формы инвайта (ключ генерируется из названия). */
export async function createProjectQuick(
  name: string,
): Promise<{ key?: string; name?: string; error?: string }> {
  try {
    await requireAdmin();
    const n = name.trim();
    if (!n) return { error: "Укажите название" };
    const k = await generateProjectKey(n);
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

/** Сохранить проекты пользователя: разработчик → ответственный на наборе; клиент/сотрудник → один проект. */
export async function saveUserProjects(login: string, keys: string[]): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requireAdmin();
    if (!login) return { error: "no login" };
    const be = getBackend();
    const user = (await be.listUsers()).find((u) => u.login === login);
    if (user?.role === "client") {
      await setLinkProject(login, keys[0] ?? null);
    } else if (user?.role === "employee") {
      await setMemberProjects(login, keys); // сотрудник — несколько проектов
    } else {
      await setDevProjects(login, keys);
    }
    // Уведомить разработчика/сотрудника о назначении на проект(ы).
    if ((user?.role === "contributor" || user?.role === "employee") && keys.length) {
      const projects = await be.listProjects().catch(() => []);
      const names = keys.map((k) => projects.find((p) => p.key === k)?.name || k).join(", ");
      await notifyLogins([login], `📋 <b>Вас назначили на проект(ы):</b> ${names}\nОткройте портал — детали и задачи там.`).catch(() => {});
    }
    revalidatePath("/admin/team");
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/** Удалить пользователя из портала (отвязка от бота/проектов, удаление member). */
export async function deleteUser(login: string): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requireAdmin();
    if (!login) return { error: "no login" };
    await deleteMember(login);
    revalidatePath("/admin/team");
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/** Переименовать пользователя (имя видно только админу). */
export async function renameUser(login: string, alias: string): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requireAdmin();
    if (!login) return { error: "no login" };
    await renameMember(login, alias.trim() || null);
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
