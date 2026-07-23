"use server";

import { requireAdmin } from "@/lib/principal";
import { generateInvite } from "@/lib/invites";
import { upsertLink, upsertMember, deleteAccessRequest, setDevProjects, createProject, generateProjectKey, renameMember, setLinkProject, setMemberProjects, deleteMember, getUserProjectKeys, reassignNullReporterToClient, setMemberRole } from "@/lib/db";
import { getBackend } from "@/lib/tasks";
import { sendTo, flushPendingForClient, flushPendingForLogin } from "@/lib/notify";
import { notifyProjectOnboarding } from "@/lib/onboarding-notify";
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
    // Разработчик → ответственный на проекте (попадает на дашборд); клиент/сотрудник → членство в member_projects (+ primary в tg_links выше).
    if (role === "contributor" && projectKey) await setDevProjects(login, [projectKey]);
    else if ((role === "client" || role === "employee") && projectKey) await setMemberProjects(login, [projectKey]);
    await deleteAccessRequest(tgId);
    await sendTo(tgId, "✅ Доступ открыт. Откройте PM-портал через меню бота — теперь вы авторизованы.");
    // Онбординг по проекту: разработчику — задачи в работе; клиенту/сотруднику — что уже выполнено.
    if (projectKey) await notifyProjectOnboarding(login, role, [projectKey]).catch(() => {});
    if ((role === "client" || role === "employee") && projectKey) await flushPendingForClient(tgId, role, [projectKey]).catch(() => {});
    if (role === "client" && projectKey) await reassignNullReporterToClient(projectKey).catch(() => {});
    revalidatePath("/admin/team");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/** Сохранить проекты пользователя: разработчик → ответственный на наборе; клиент/сотрудник → набор (member_projects). */
export async function saveUserProjects(login: string, keys: string[]): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requireAdmin();
    if (!login) return { error: "no login" };
    const be = getBackend();
    const user = (await be.listUsers()).find((u) => u.login === login);
    // Проекты ДО изменения — чтобы уведомлять только о НОВЫХ (добавленных), а не о всех при каждом сохранении.
    const before = await getUserProjectKeys(login).catch(() => [] as string[]);
    if (user?.role === "client") {
      await setMemberProjects(login, keys); // клиент — несколько проектов (как сотрудник)
      await setLinkProject(login, keys[0] ?? null); // primary-проект (онбординг/легаси-читатели)
    } else if (user?.role === "employee") {
      await setMemberProjects(login, keys); // сотрудник — несколько проектов
    } else {
      await setDevProjects(login, keys);
    }
    // Онбординг ТОЛЬКО по добавленным проектам: разработчику — задачи в работе; клиенту/сотруднику — что уже выполнено.
    const added = keys.filter((k) => !before.includes(k));
    if (user?.role && added.length) await notifyProjectOnboarding(login, user.role, added).catch(() => {});
    if ((user?.role === "client" || user?.role === "employee") && added.length) await flushPendingForLogin(login, user.role, added).catch(() => {});
    // Клиент привязан к проекту → задачи, поставленные мной, переводим на него постановщиком.
    if (user?.role === "client") for (const k of added) await reassignNullReporterToClient(k).catch(() => {});
    revalidatePath("/admin/team");
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/** Сменить роль уже приглашённого пользователя (client/employee/contributor/admin). */
export async function changeUserRole(login: string, role: Role): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requireAdmin();
    if (!login) return { error: "no login" };
    if (!PERSON_ROLES.includes(role)) return { error: "Недопустимая роль" };
    await setMemberRole(login, role);
    // Стал клиентом — задачи проектов без постановщика (поставленные мной) переводим на него постановщиком.
    if (role === "client") {
      const keys = await getUserProjectKeys(login).catch(() => [] as string[]);
      for (const k of keys) await reassignNullReporterToClient(k).catch(() => {});
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
