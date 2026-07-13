"use server";

import { getPrincipal } from "@/lib/principal";
import { generateInvite } from "@/lib/invites";
import { listLinks, getMemberProjects, deleteMember } from "@/lib/db";
import { revalidatePath } from "next/cache";

/** Проекты текущего клиента (набор member_projects + primary). */
async function clientKeys(): Promise<string[] | null> {
  const p = await getPrincipal();
  if (!p || p.role !== "client") return null;
  const keys = p.projectKeys?.length ? p.projectKeys : p.projectKey ? [p.projectKey] : [];
  return keys;
}

/**
 * Клиент сам создаёт ссылку-приглашение СОТРУДНИКА в свой проект.
 * Роль жёстко = employee; проекты ограничены проектами клиента (нельзя пригласить в чужой).
 */
export async function createEmployeeInvite(projectKeys: string[]): Promise<{ link?: string; error?: string }> {
  try {
    const mine = await clientKeys();
    if (!mine) return { error: "Forbidden" };
    if (!mine.length) return { error: "no-project" };
    // Пересечение запрошенных с моими — защита от подстановки чужого ключа. Пусто → все мои проекты.
    const req = Array.isArray(projectKeys) ? projectKeys.map((k) => String(k).trim().toUpperCase()) : [];
    const keys = req.length ? req.filter((k) => mine.includes(k)) : mine;
    if (!keys.length) return { error: "no-project" };
    const { link } = await generateInvite("employee", keys);
    return { link };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/**
 * Клиент убирает своего сотрудника. Разрешено только для роли employee, который состоит
 * хотя бы в одном общем с клиентом проекте (нельзя удалить разработчика, админа или чужого).
 */
export async function removeEmployee(login: string): Promise<{ ok?: boolean; error?: string }> {
  try {
    const mine = await clientKeys();
    if (!mine) return { error: "Forbidden" };
    const l = String(login || "").trim();
    if (!l) return { error: "no-login" };
    const link = (await listLinks()).find((x) => x.login === l);
    if (!link || link.role !== "employee") return { error: "Forbidden" };
    const theirs = await getMemberProjects(l);
    const shared = theirs.some((k) => mine.includes(k)) || (link.project_key ? mine.includes(link.project_key) : false);
    if (!shared) return { error: "Forbidden" };
    await deleteMember(l);
    revalidatePath("/admin/crew");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}
