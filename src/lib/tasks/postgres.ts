/**
 * Адаптер TasksBackend поверх собственной БД портала (уход с YouTrack).
 * Таблицы projects/members/tasks/comments создаёт импорт (scripts/import-youtrack.mjs)
 * и поддерживает схема. Server-side only.
 */
import type { TasksBackend, TaskFilter, Project, User, Task, Comment, Role } from "./types";
import type { ProjectMeta } from "./types";
import { q } from "../db";

function ms(v: string | Date | null | undefined): number | undefined {
  if (!v) return undefined;
  return new Date(v).getTime();
}

interface TaskRow {
  readable_id: string;
  project_key: string;
  title: string;
  description: string | null;
  status: string | null;
  priority: string | null;
  created_at: string | null;
  updated_at: string | null;
  resolved_at: string | null;
  assignee_login: string | null;
  assignee_name: string | null;
  reporter_login: string | null;
  reporter_name: string | null;
  reporter_role: Role | null;
}

const TASK_SELECT = `
  SELECT t.readable_id, p.key AS project_key, t.title, t.description, t.status, t.priority,
         t.created_at, t.updated_at, t.resolved_at,
         a.login AS assignee_login, a.full_name AS assignee_name,
         r.login AS reporter_login, r.full_name AS reporter_name, r.role AS reporter_role
  FROM tasks t
  JOIN projects p ON p.id = t.project_id
  LEFT JOIN members a ON a.id = t.assignee_id
  LEFT JOIN members r ON r.id = t.reporter_id`;

function rowToTask(t: TaskRow): Task {
  return {
    id: t.readable_id,
    projectKey: t.project_key,
    summary: t.title,
    description: t.description ?? undefined,
    state: t.status ?? undefined,
    assignee: t.assignee_login ? { login: t.assignee_login, fullName: t.assignee_name || t.assignee_login } : null,
    reporter: t.reporter_login
      ? { login: t.reporter_login, fullName: t.reporter_name || t.reporter_login, role: t.reporter_role ?? "unknown" }
      : null,
    created: ms(t.created_at),
    updated: ms(t.updated_at),
    resolved: t.resolved_at ? ms(t.resolved_at)! : null,
    dueDate: null,
    priority: t.priority,
    url: `/admin/tasks/${t.readable_id}`,
  };
}

export const postgresBackend: TasksBackend = {
  async listProjects(): Promise<Project[]> {
    const rows = await q<{ key: string; name: string; meta: ProjectMeta | null }>(
      "SELECT key, name, meta FROM projects WHERE archived = false ORDER BY key",
    );
    return rows.map((r) => ({ key: r.key, name: r.name, meta: r.meta ?? {} }));
  },

  async listUsers(): Promise<User[]> {
    const rows = await q<{ login: string; full_name: string | null; email: string | null; role: Role }>(
      "SELECT login, full_name, email, role FROM members ORDER BY full_name",
    );
    return rows.map((r) => ({
      login: r.login,
      fullName: r.full_name || r.login,
      email: r.email || undefined,
      role: r.role,
    }));
  },

  async listTasks(filter: TaskFilter = {}): Promise<Task[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (cond: string, val: unknown) => {
      params.push(val);
      where.push(cond.replace("$$", `$${params.length}`));
    };
    if (filter.projectKey) add("p.key = $$", filter.projectKey);
    if (filter.assigneeLogin) add("a.login = $$", filter.assigneeLogin);
    if (filter.reporterLogin) add("r.login = $$", filter.reporterLogin);
    if (filter.unresolvedOnly) where.push("t.resolved_at IS NULL");
    const order =
      filter.order === "updated_asc"
        ? "t.updated_at ASC NULLS LAST"
        : filter.order === "created_desc"
          ? "t.created_at DESC NULLS LAST"
          : "t.updated_at DESC NULLS LAST";
    const sql =
      TASK_SELECT +
      (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
      ` ORDER BY ${order} LIMIT ${Math.min(filter.limit ?? 300, 500)}`;
    const rows = await q<TaskRow>(sql, params);
    return rows.map(rowToTask);
  },

  async getTask(id: string): Promise<Task> {
    const rows = await q<TaskRow>(TASK_SELECT + " WHERE t.readable_id = $1", [id]);
    if (!rows[0]) throw new Error(`Задача ${id} не найдена`);
    return rowToTask(rows[0]);
  },

  async createTask(input): Promise<Task> {
    const proj = await q<{ id: number; key: string }>("SELECT id, key FROM projects WHERE key = $1", [
      input.projectKey,
    ]);
    if (!proj[0]) throw new Error(`Проект ${input.projectKey} не найден`);
    const maxNum = await q<{ n: number | null }>("SELECT max(num) AS n FROM tasks WHERE project_id = $1", [
      proj[0].id,
    ]);
    const num = (maxNum[0]?.n ?? 0) + 1;
    const readable = `${proj[0].key}-${num}`;
    let assigneeId: number | null = null;
    if (input.assigneeLogin) {
      const a = await q<{ id: number }>("SELECT id FROM members WHERE login = $1", [input.assigneeLogin]);
      assigneeId = a[0]?.id ?? null;
    }
    let description = input.description || "";
    if (input.dueDate) description += `\n\n**Дедлайн:** ${input.dueDate}`;
    await q(
      `INSERT INTO tasks (project_id, num, readable_id, title, description, status, priority, assignee_id, created_at, updated_at, source)
       VALUES ($1,$2,$3,$4,$5,'Open',$6,$7, now(), now(), 'portal')`,
      [proj[0].id, num, readable, input.summary, description, input.priority || null, assigneeId],
    );
    return this.getTask(readable);
  },

  async getComments(id: string): Promise<Comment[]> {
    const rows = await q<{
      id: number;
      body: string;
      created_at: string;
      author_login: string | null;
      author_name: string | null;
      author_role: Role | null;
      visibility: string;
    }>(
      `SELECT c.id, c.body, c.created_at, c.visibility,
              m.login AS author_login, m.full_name AS author_name, m.role AS author_role
       FROM comments c
       JOIN tasks t ON t.id = c.task_id
       LEFT JOIN members m ON m.id = c.author_id
       WHERE t.readable_id = $1 ORDER BY c.created_at`,
      [id],
    );
    return rows.map((c) => ({
      id: String(c.id),
      text: c.body,
      created: ms(c.created_at) ?? 0,
      author: {
        login: c.author_login || "lambertain",
        fullName: c.author_name || "Lambertain",
        role: c.author_role ?? "unknown",
      },
    }));
  },

  async addComment(id: string, text: string): Promise<Comment> {
    const task = await q<{ id: number }>("SELECT id FROM tasks WHERE readable_id = $1", [id]);
    if (!task[0]) throw new Error(`Задача ${id} не найдена`);
    const rows = await q<{ id: number; created_at: string }>(
      `INSERT INTO comments (task_id, author_id, body, visibility, approved, created_at)
       VALUES ($1, NULL, $2, 'client', true, now()) RETURNING id, created_at`,
      [task[0].id, text],
    );
    return {
      id: String(rows[0].id),
      text,
      created: ms(rows[0].created_at) ?? 0,
      author: { login: "lambertain", fullName: "Lambertain", role: "admin" },
    };
  },
};
