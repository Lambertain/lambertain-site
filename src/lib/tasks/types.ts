/**
 * Доменные типы PM-портала и контракт бэкенда задач.
 *
 * UI, server actions и Telegram-поллер работают ТОЛЬКО через интерфейс TasksBackend.
 * Сегодня его реализует адаптер YouTrack (youtrack.ts).
 * Завтра — собственная БД (postgres.ts). При миграции UI не меняется.
 */

/** Роль пользователя в трекере. */
export type Role = "client" | "contributor" | "admin" | "employee" | "unknown";

export interface User {
  login: string;
  fullName: string;
  email?: string;
  role: Role;
  banned?: boolean;
}

export interface Project {
  /** Короткий ключ (shortName в YouTrack). */
  key: string;
  name: string;
  /** Распарсенные метаданные из YAML-описания проекта. */
  meta: ProjectMeta;
}

/** Машиночитаемое описание проекта (YAML-блок в описании). */
export interface ProjectMeta {
  clientGit?: string;
  devGit?: string;
  localPath?: string;
  apps?: {
    prod?: { url?: string; host?: "client" | "mine" | "" };
    dev?: { url?: string; host?: "client" | "mine" | "" };
  };
  credentials?: Array<{ role?: string; env?: string; login?: string; pass?: string }>;
  design?: string;
  deploy?: { prodBranch?: string; devBranch?: string };
  /** Конвенции/правила проекта для интейка (для проектов с клиентским репо, где CLAUDE.md в .gitignore). */
  conventions?: string;
  /** Логин ответственного разработчика (автоназначение + видимость проекта у контрибьютора). */
  defaultAssignee?: string;
}

export interface Task {
  id: string; // idReadable, напр. "SHU-42"
  projectKey: string;
  summary: string;
  description?: string;
  state?: string; // статус (Open / In Progress / Done ...)
  assignee?: { login: string; fullName: string } | null;
  reporter?: { login: string; fullName: string; role: Role } | null;
  created?: number; // epoch ms
  updated?: number;
  resolved?: number | null;
  dueDate?: string | null; // YYYY-MM-DD
  priority?: string | null;
  url: string;
  commentCount?: number;
  lastCommentAt?: number | null;
}

export interface Comment {
  id: string;
  text: string;
  created: number;
  author: { login: string; fullName: string; role: Role };
}

/** Структурированная задача из произвольного текста (результат Claude API). */
export interface DraftTask {
  projectKey: string;
  summary: string;
  description: string;
  assigneeLogin?: string | null;
  priority?: string | null;
  dueDate?: string | null;
  confidence: "high" | "low";
}

/** Структурный фильтр задач — backend-agnostic (вместо YouTrack-строки запроса). */
export interface TaskFilter {
  projectKey?: string;
  assigneeLogin?: string;
  reporterLogin?: string;
  /** Только нерешённые (открытые). */
  unresolvedOnly?: boolean;
  order?: "updated_desc" | "updated_asc" | "created_desc";
  limit?: number;
}

/** Контракт бэкенда. Любая реализация (YouTrack, Postgres) обязана его выполнять. */
export interface TasksBackend {
  listProjects(): Promise<Project[]>;
  listUsers(): Promise<User[]>;
  listTasks(filter?: TaskFilter): Promise<Task[]>;
  getTask(id: string): Promise<Task>;
  createTask(input: {
    projectKey: string;
    summary: string;
    description?: string;
    assigneeLogin?: string | null;
    dueDate?: string | null;
    priority?: string | null;
  }): Promise<Task>;
  getComments(id: string): Promise<Comment[]>;
  addComment(id: string, text: string): Promise<Comment>;
  updateStatus(id: string, status: string): Promise<void>;
  deleteTask(id: string): Promise<void>;
}
