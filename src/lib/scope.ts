/**
 * Видимость проектов по роли:
 * - admin — все;
 * - contributor — где он «Ответственный» (defaultAssignee);
 * - client/employee — их единственный проект.
 */
import type { Project } from "./tasks/types";
import type { Principal } from "./principal";

export function visibleProjects(me: Principal, all: Project[]): Project[] {
  // Админ (в т.ч. в режиме превью роли) видит все проекты — иначе нечего выбрать.
  if (me.realRole === "admin") return all;
  if (me.role === "contributor") return all.filter((p) => p.meta.defaultAssignee === me.youtrackLogin);
  // client / employee — привязаны к одному проекту
  return all.filter((p) => p.key === me.projectKey);
}
