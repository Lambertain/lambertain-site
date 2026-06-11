/**
 * Видимость проектов по роли:
 * - admin — все;
 * - contributor — где он ответственный (defaultAssignee); дев может вести несколько проектов;
 * - client/employee — их единственный проект.
 */
import type { Project } from "./tasks/types";
import type { Principal } from "./principal";

/** Ведёт ли разработчик проект (один дев на проект, дев — на нескольких проектах). */
export function isDevOfProject(login: string | undefined, p: Project): boolean {
  return !!login && p.meta.defaultAssignee === login;
}

export function visibleProjects(me: Principal, all: Project[]): Project[] {
  // Админ (в т.ч. в режиме превью роли) видит все проекты — иначе нечего выбрать.
  if (me.realRole === "admin") return all;
  if (me.role === "contributor") return all.filter((p) => isDevOfProject(me.youtrackLogin, p));
  // Сотрудник — несколько проектов (member_projects); клиент — один.
  if (me.role === "employee" && me.projectKeys?.length) return all.filter((p) => me.projectKeys!.includes(p.key));
  return all.filter((p) => p.key === me.projectKey);
}
