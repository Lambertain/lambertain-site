/**
 * Глобальный фидбек-проект (Lamb.dev): виден всем, но каждый видит ТОЛЬКО свои задачи
 * (фидбек по порталу). Админ — все. Server-side only.
 */
import { getBackend } from "./tasks";
import type { Project, Task } from "./tasks/types";
import type { Principal } from "./principal";

export function feedbackKeys(projects: Project[]): Set<string> {
  return new Set(projects.filter((p) => p.meta.feedback).map((p) => p.key));
}

/** Свои фидбек-задачи (не-админ) либо все (админ). */
export async function loadFeedbackTasks(me: Principal, projects: Project[]): Promise<Task[]> {
  const fb = projects.filter((p) => p.meta.feedback);
  if (!fb.length) return [];
  const isAdmin = me.realRole === "admin";
  if (!isAdmin && !me.youtrackLogin) return [];
  const be = getBackend();
  const lists = await Promise.all(
    fb.map((p) =>
      be.listTasks(
        isAdmin
          ? { projectKey: p.key, order: "updated_desc", limit: 200 }
          : { projectKey: p.key, reporterLogin: me.youtrackLogin!, order: "updated_desc", limit: 200 },
      ),
    ),
  );
  return lists.flat();
}

/** Убрать чужие фидбек-задачи из списка и подмешать свои (для не-админа). Дедуп по id. */
export async function mergeFeedback(me: Principal, projects: Project[], tasks: Task[]): Promise<Task[]> {
  if (me.realRole === "admin") return tasks; // админ видит всё как есть
  const fb = feedbackKeys(projects);
  if (!fb.size) return tasks;
  const own = await loadFeedbackTasks(me, projects);
  const seen = new Set<string>();
  const out: Task[] = [];
  for (const t of [...tasks.filter((t) => !fb.has(t.projectKey)), ...own]) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}
