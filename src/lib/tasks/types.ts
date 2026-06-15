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
  /** Кастомное имя от админа (отображается только админу). */
  alias?: string;
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
  /** Конвенции/правила проекта (легаси; основной источник — CLAUDE.md дев-репо). */
  conventions?: string;
  /** Полная спека/роадмэп проекта — общий контекст для Claude разработчика (отдаётся через dev-API). */
  spec?: string;
  /** Логин ответственного разработчика (один на проект): автоназначение + видимость + группировка дашборда. */
  defaultAssignee?: string;
  /** Показать клиенту онбординг-инструкцию при входе (ставится из инвайта, снимается по завершении). */
  showOnboarding?: boolean;
  /** Набор инструкций (token), который клиент видит при входе — баннер на /i/<token> (ставится из инвайта). */
  onboardingSetToken?: string;
  /** Глобальный фидбек-проект: виден всем, каждый видит только свои задачи. */
  feedback?: boolean;
  /** Экономика проекта (для дашборда загрузки). */
  cost?: number;
  /** Валюта стоимости (символ). По умолчанию "$". */
  currency?: string;
  /** На сколько частей (платежей) поделена общая сумма. По умолчанию 1. */
  parts?: number;
  /** Сколько частей уже оплачено. По умолчанию 0. */
  paidParts?: number;
  /** Дата старта проекта (ISO YYYY-MM-DD). Дефолт — дата создания/самой ранней задачи. */
  startedAt?: string;
  /** Плановая дата завершения (ISO YYYY-MM-DD). Нет — прогресс-бар по времени скрыт. */
  deadline?: string;
  /** Клиентский Railway (для доставки dev→client: апрув деплоя, мониторинг, URL БД для миграции). */
  clientDeploy?: {
    railwayToken?: string;
    projectId?: string;
    environmentId?: string;
    /** App-сервис (его деплой апрувим). */
    serviceId?: string;
    /** Postgres-сервис (из него берём внешний URL БД для миграции). */
    pgServiceId?: string;
  };
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
  /** approved | pending | rejected (задачи сотрудника в проектах без клиента ждут утверждения админа). */
  approvalStatus?: string;
  /** Внутренняя задача (разработчик → админ, или админ → разработчик мимо клиента): клиенту не видна. */
  internal?: boolean;
  /** Роль создателя: admin/super — поставлена админом; contributor — запрос разработчика; client — от клиента. */
  createdByRole?: string | null;
  /** Авто-готово: на ревью-завершении дева задача идёт сразу в Done (без ручной приёмки). */
  autoDone?: boolean;
  /** Задача ждёт ручного ops-шага владельца (деплой/регистрация/токен): что нужно сделать. Клиент не видит. */
  ownerAction?: string | null;
  /** Задача ждёт действия КЛИЕНТА (зарегистрировать сервис/дать доступ): что нужно сделать. Клиент видит и жмёт «Готово». */
  clientAction?: string | null;
  /** id гайда-инструкции к действию клиента (как зарегистрировать). */
  clientActionGuide?: number | null;
}

export interface Comment {
  id: string;
  text: string;
  created: number;
  author: { login: string; fullName: string; role: Role };
  /** "client" — видно клиенту; "internal" — только команде (дев/админ). По умолчанию client. */
  visibility?: "client" | "internal";
  /** false — на модерации (клиент не видит, без пуша) до апрува супер-админом. По умолчанию true. */
  approved?: boolean;
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
    reporterLogin?: string | null;
    dueDate?: string | null;
    priority?: string | null;
    approvalStatus?: "approved" | "pending";
    createdByRole?: Role;
    internal?: boolean;
    autoDone?: boolean;
  }): Promise<Task>;
  getComments(id: string): Promise<Comment[]>;
  addComment(id: string, text: string, visibility?: "client" | "internal", authorLogin?: string, approved?: boolean): Promise<Comment>;
  updateStatus(id: string, status: string): Promise<void>;
  deleteTask(id: string): Promise<void>;
}
