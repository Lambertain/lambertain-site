/**
 * Адаптер TasksBackend поверх YouTrack REST + Hub API.
 * Секреты только из server-side env: YOUTRACK_URL, YOUTRACK_TOKEN.
 */
import type {
  TasksBackend,
  Project,
  User,
  Task,
  Comment,
  Role,
} from "./types";
import { parseProjectMeta } from "./meta";
import { getRoleOverrides } from "../db";

const URL_BASE = (process.env.YOUTRACK_URL || "").replace(/\/$/, "");
const TOKEN = process.env.YOUTRACK_TOKEN || "";

function roleFromName(name: string): Role {
  const n = name.toLowerCase();
  if (n.includes("клиент") || n.includes("client")) return "client";
  if (n.includes("контрибьютор") || n.includes("contributor")) return "contributor";
  if (n.includes("админ") || n.includes("admin")) return "admin";
  return "unknown";
}

async function yt<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(URL_BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`YouTrack ${r.status} ${path}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

async function ytPost<T>(path: string, body: unknown, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(URL_BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`YouTrack POST ${r.status} ${path}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

// login -> role, грузится один раз на инстанс модуля
let rolesCache: Map<string, Role> | null = null;

async function rolesByLogin(): Promise<Map<string, Role>> {
  if (rolesCache) return rolesCache;
  const map = new Map<string, Role>();
  try {
    type HubUser = { login: string; projectRoles?: { role?: { name?: string } }[] };
    const data = await yt<{ users: HubUser[] }>("/hub/api/rest/users", {
      fields: "login,projectRoles(role(name))",
      $top: 500,
    });
    for (const u of data.users || []) {
      let best: Role = "unknown";
      for (const pr of u.projectRoles || []) {
        const role = roleFromName(pr.role?.name || "");
        // приоритет: client > contributor > admin > unknown
        if (role === "client") best = "client";
        else if (role === "contributor" && best !== "client") best = "contributor";
        else if (role === "admin" && best === "unknown") best = "admin";
      }
      map.set(u.login, best);
    }
  } catch {
    // Hub недоступен — роли остаются unknown
  }
  // Оверрайды из БД приоритетнее (роли в YouTrack могут быть не назначены).
  try {
    const overrides = await getRoleOverrides();
    for (const [login, role] of overrides) map.set(login, role);
  } catch {
    // БД недоступна — используем только Hub
  }
  rolesCache = map;
  return map;
}

interface YtProject {
  id: string;
  name: string;
  shortName: string;
  description?: string;
}

const projIdCache = new Map<string, string>(); // key -> internal id

async function projectId(key: string): Promise<string> {
  if (projIdCache.size === 0) {
    const ps = await yt<YtProject[]>("/api/admin/projects", {
      fields: "id,shortName",
      $top: 500,
    });
    for (const p of ps) projIdCache.set(p.shortName, p.id);
  }
  const id = projIdCache.get(key);
  if (!id) throw new Error(`Проект ${key} не найден`);
  return id;
}

interface YtUserVal {
  login?: string;
  fullName?: string;
  name?: string;
  presentation?: string;
}
interface YtCustomField {
  name: string;
  value: { name?: string; login?: string; fullName?: string; presentation?: string } | null;
}
interface YtIssue {
  idReadable: string;
  summary: string;
  description?: string;
  created?: number;
  updated?: number;
  resolved?: number | null;
  project?: { shortName: string };
  reporter?: YtUserVal;
  customFields?: YtCustomField[];
}

const ISSUE_FIELDS =
  "idReadable,summary,description,created,updated,resolved,project(shortName)," +
  "reporter(login,fullName),customFields(name,value(name,login,fullName,presentation))";

function cf(issue: YtIssue, name: string) {
  return issue.customFields?.find((c) => c.name === name)?.value ?? null;
}

async function toTask(issue: YtIssue, roles: Map<string, Role>): Promise<Task> {
  const assignee = cf(issue, "Assignee");
  const state = cf(issue, "State");
  const priority = cf(issue, "Priority");
  return {
    id: issue.idReadable,
    projectKey: issue.project?.shortName || issue.idReadable.split("-")[0],
    summary: issue.summary,
    description: issue.description,
    state: state?.name,
    assignee: assignee?.login
      ? { login: assignee.login, fullName: assignee.fullName || assignee.login }
      : null,
    reporter: issue.reporter?.login
      ? {
          login: issue.reporter.login,
          fullName: issue.reporter.fullName || issue.reporter.login,
          role: roles.get(issue.reporter.login) ?? "unknown",
        }
      : null,
    created: issue.created,
    updated: issue.updated,
    resolved: issue.resolved ?? null,
    dueDate: null,
    priority: priority?.name ?? null,
    url: `${URL_BASE}/issue/${issue.idReadable}`,
  };
}

export const youtrackBackend: TasksBackend = {
  async listProjects(): Promise<Project[]> {
    const ps = await yt<YtProject[]>("/api/admin/projects", {
      fields: "id,name,shortName,description,archived",
      $top: 500,
    });
    return ps.map((p) => ({
      key: p.shortName,
      name: p.name,
      meta: parseProjectMeta(p.description),
    }));
  },

  async listUsers(): Promise<User[]> {
    const roles = await rolesByLogin();
    const us = await yt<
      { login: string; fullName: string; email?: string; banned?: boolean }[]
    >("/api/users", { fields: "login,fullName,email,banned", $top: 500 });
    return us.map((u) => ({
      login: u.login,
      fullName: u.fullName || u.login,
      email: u.email || undefined,
      banned: u.banned,
      role: roles.get(u.login) ?? "unknown",
    }));
  },

  async listTasks(query: string): Promise<Task[]> {
    const roles = await rolesByLogin();
    const issues = await yt<YtIssue[]>("/api/issues", {
      query,
      fields: ISSUE_FIELDS,
      $top: 200,
    });
    return Promise.all(issues.map((i) => toTask(i, roles)));
  },

  async getTask(id: string): Promise<Task> {
    const roles = await rolesByLogin();
    const issue = await yt<YtIssue>(`/api/issues/${id}`, { fields: ISSUE_FIELDS });
    return toTask(issue, roles);
  },

  async createTask(input): Promise<Task> {
    const pid = await projectId(input.projectKey);
    const customFields: unknown[] = [];
    if (input.assigneeLogin) {
      customFields.push({
        name: "Assignee",
        $type: "SingleUserIssueCustomField",
        value: { login: input.assigneeLogin },
      });
    }
    if (input.priority) {
      customFields.push({
        name: "Priority",
        $type: "SingleEnumIssueCustomField",
        value: { name: input.priority },
      });
    }
    // Поля Due Date в этом инстансе нет — дедлайн уходит в описание.
    let description = input.description || "";
    if (input.dueDate) description += `\n\n**Дедлайн:** ${input.dueDate}`;

    const created = await ytPost<{ idReadable: string }>(
      "/api/issues",
      {
        project: { id: pid },
        summary: input.summary,
        description,
        customFields,
      },
      { fields: "idReadable" },
    );
    return this.getTask(created.idReadable);
  },

  async getComments(id: string): Promise<Comment[]> {
    const roles = await rolesByLogin();
    type YtComment = {
      id: string;
      text: string;
      created: number;
      author?: { login: string; fullName?: string };
    };
    const cs = await yt<YtComment[]>(`/api/issues/${id}/comments`, {
      fields: "id,text,created,author(login,fullName)",
      $top: 200,
    });
    return cs.map((c) => ({
      id: c.id,
      text: c.text,
      created: c.created,
      author: {
        login: c.author?.login || "?",
        fullName: c.author?.fullName || c.author?.login || "?",
        role: roles.get(c.author?.login || "") ?? "unknown",
      },
    }));
  },

  async addComment(id: string, text: string): Promise<Comment> {
    const roles = await rolesByLogin();
    type YtComment = {
      id: string;
      text: string;
      created: number;
      author?: { login: string; fullName?: string };
    };
    const c = await ytPost<YtComment>(
      `/api/issues/${id}/comments`,
      { text },
      { fields: "id,text,created,author(login,fullName)" },
    );
    return {
      id: c.id,
      text: c.text,
      created: c.created,
      author: {
        login: c.author?.login || "?",
        fullName: c.author?.fullName || c.author?.login || "?",
        role: roles.get(c.author?.login || "") ?? "unknown",
      },
    };
  },
};
