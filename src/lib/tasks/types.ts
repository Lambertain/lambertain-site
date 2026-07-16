/**
 * Доменные типы PM-портала и контракт бэкенда задач.
 *
 * UI и server actions работают ТОЛЬКО через интерфейс TasksBackend.
 * Его реализует адаптер собственной БД портала (postgres.ts).
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

/** Одна спека проекта (модуль/фаза) — отдельный документ, чтобы добавление новой не раздувало другие. */
export interface ProjectSpec {
  /** Стабильный ключ спеки (slug), уникальный в проекте. */
  key: string;
  /** Заголовок (напр. «Модуль 3. Замовлення»). */
  title: string;
  /** Тело спеки (Markdown). */
  body: string;
  /** Порядок сортировки/выполнения. */
  order?: number;
  /** ISO-время последнего изменения. */
  updatedAt?: string;
}

/** Машиночитаемое описание проекта (YAML-блок в описании). */
export interface ProjectMeta {
  clientGit?: string;
  devGit?: string;
  /** Доп. репозитории проекта парами dev→client (когда репо больше одного: backend+frontend и т.п.).
   *  Первая пара — основная (clientGit/devGit выше); сюда добавляются остальные. */
  extraRepos?: { dev?: string; client?: string }[];
  localPath?: string;
  apps?: {
    prod?: { url?: string; host?: "client" | "mine" | "" };
    dev?: { url?: string; host?: "client" | "mine" | "" };
  };
  credentials?: Array<{ role?: string; env?: string; login?: string; pass?: string }>;
  design?: string;
  deploy?: { prodBranch?: string; devBranch?: string };
  /** Доставка клиенту через Pull Request: не пушить в дефолтную ветку клиента, а открывать PR (клиент мержит сам). */
  clientDeliverPR?: boolean;
  /** Целевая ветка доставки в клиентских репо (для всех пар проекта). Пусто = дефолтная ветка клиента. Для gitflow — develop. */
  deliverBranch?: string;
  /** gitflow-доставка: портал пушит feature-ветку разработчика в клиентский репо и открывает PR в develop
   *  (вместо squash-снимка). Разработчик работает per-task на ветке от client-sync/develop. Взаимоисключающе с autoDeliver. */
  gitflowDelivery?: boolean;
  /** Схема накатывается на клиентскую БД автоматически (preDeploy клиентского деплоя) — предупреждение о схеме при доставке не блокирует. */
  clientAutoMigrate?: boolean;
  /** Конвенции/правила проекта (легаси; основной источник — CLAUDE.md дев-репо). */
  conventions?: string;
  /** Полная спека/роадмэп проекта — общий контекст для Claude разработчика (отдаётся через dev-API). Легаси-одиночная спека; несколько спек (по модулям/фазам) — в `specs[]`. */
  spec?: string;
  /** Спеки проекта по модулям/фазам — отдельные документы. Добавление новой не дописывается в существующую (не раздувает). Приоритетнее легаси `spec`. */
  specs?: ProjectSpec[];
  /** Внутренняя инфо для разработчика (что админ взял у клиента) — виден деву (в карточке проекта) и через dev-API, НЕ клиенту. */
  devInfo?: string;
  /** Доверенный разработчик: БЕЗ апрува супер-админа — клиент-видимые комменты публикуются сразу, готовые задачи (Review) закрываются сразу. */
  autoApprove?: boolean;
  /** Автодоставка: когда задача принята (Done) — портал сам доставляет код клиенту (PR/push) по всем парам репо, без ручной кнопки доставки. */
  autoDeliver?: boolean;
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
  /** Оплаты клиента: сумма + дата (YYYY-MM-DD). Сумма оплат сверх cost увеличивает итоговую стоимость проекта. */
  payments?: { amount: number; date: string }[];
  /** Показывать ли разработчику стоимость проекта и оплаты с датами (по умолчанию нет — только админ). */
  showFinanceToDev?: boolean;
  /** @deprecated legacy: частей платежей / сколько оплачено — заменено на payments[]. Оставлено для фолбэка старых проектов. */
  parts?: number;
  /** @deprecated legacy — см. payments[]. */
  paidParts?: number;
  /** Дата старта проекта (ISO YYYY-MM-DD). Дефолт — дата создания/самой ранней задачи. */
  startedAt?: string;
  /** Плановая дата завершения (ISO YYYY-MM-DD). Нет — прогресс-бар по времени скрыт. */
  deadline?: string;
  /**
   * Видимость полей в карточке проекта «Детали и доступы» по ролям смотрящего.
   * Ключ — поле (prodUrl|devUrl|design|devInfo|spec|accounts), значение — кому показывать.
   * Если поле/флаг не задан — берётся дефолт поля (см. FIELD_VIS_DEFAULTS).
   */
  fieldVisibility?: Record<string, { client?: boolean; dev?: boolean }>;
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
  /** Клиентский деплой на Vercel (вместо Railway): Vercel катит сам при пуше — апрув не нужен, портал лишь мониторит статус. */
  clientVercel?: {
    token?: string;
    projectId?: string;
    /** teamId — если проект под Vercel-командой/орг (нужен в API). */
    teamId?: string;
  };
  /** Аккаунты входа prod-окружения (логин/пароль/примечание; добавляемые строки) — под Prod URL. */
  prodAccounts?: Array<{ login?: string; pass?: string; note?: string }>;
  /** Аккаунты входа dev-окружения — под Dev URL. */
  devAccounts?: Array<{ login?: string; pass?: string; note?: string }>;
  /**
   * Тип проекта: "client" — клиентский (постановщик задач = клиент проекта); "mine" — мой личный
   * (постановщик = я). Если не задан — выводится: есть клиент → client, иначе mine.
   */
  projectType?: "mine" | "client";
  /** Включённые в проекте кастомные поля из реестра (project-fields.ts), напр. ["facebook","whatsapp"]. */
  enabledFields?: string[];
  /** Значения кастомных полей: ключ поля → { подполе → значение }. */
  customFields?: Record<string, Record<string, string>>;
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
  /** Может ли КЛИЕНТ проверить результат сам (глазами/руками): true → на ревью с кнопками «Готово/Доработать»;
   *  false → внутренняя/техническая → на готовности сразу Done, минуя клиентское ревью; null → не классифицировано (как true). */
  clientVerifiable?: boolean | null;
  /** Задача ждёт ручного ops-шага владельца (деплой/регистрация/токен): что нужно сделать. Клиент не видит. */
  ownerAction?: string | null;
  /** DEV-48: задача ждёт ответа ПОСТАНОВЩИКА — вопрос разработчика (escalate admin). Статус не меняется. */
  reporterAction?: string | null;
  /** Задача ждёт действия КЛИЕНТА (зарегистрировать сервис/дать доступ): что нужно сделать. Клиент видит и жмёт «Готово». */
  clientAction?: string | null;
  /** id гайда-инструкции к действию клиента (как зарегистрировать). */
  clientActionGuide?: number | null;
  /** Целевое поле каталога (project-fields) для введённого клиентом значения, формат "fieldKey.subKey". */
  clientActionField?: string | null;
  /** Деплой-стадия (независимо от статуса задачи): pr — готовится (PR), dev — на тестовом, prod — опубликовано. */
  deployStage?: "pr" | "dev" | "prod" | null;
  /** Ссылка на PR разработчика по задаче (источник деплой-стадии). */
  prUrl?: string | null;
}

export interface Comment {
  id: string;
  text: string;
  created: number;
  author: { login: string; fullName: string; role: Role };
  /** "client" — видно клиенту; "internal" — только команде (дев/админ). По умолчанию client. */
  visibility?: "client" | "internal" | "client_nodev";
  /** false — на модерации (клиент не видит, без пуша) до апрува супер-админом. По умолчанию true. */
  approved?: boolean;
  /** true — коммент создан через dev-API (Claude разработчика); его можно править/удалять (dev-API и разработчик в UI). */
  devAuthored?: boolean;
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
  /** Набор проектов (разработчик/сотрудник — все задачи их проектов, включая исторические). */
  projectKeys?: string[];
  assigneeLogin?: string;
  reporterLogin?: string;
  /** Постановщик не задан (reporter IS NULL) — «мои задачи» супер-админа (он ставит без member-логина). */
  reporterIsNull?: boolean;
  /** Только нерешённые (открытые). */
  unresolvedOnly?: boolean;
  /** Текстовый поиск по слагу (readable_id) или названию (ILIKE). */
  search?: string;
  order?: "updated_desc" | "updated_asc" | "created_desc";
  limit?: number;
}

/** Контракт бэкенда задач (реализация — postgres.ts). */
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
    clientVerifiable?: boolean | null;
  }): Promise<Task>;
  getComments(id: string): Promise<Comment[]>;
  addComment(id: string, text: string, visibility?: "client" | "internal" | "client_nodev", authorLogin?: string, approved?: boolean, devAuthored?: boolean): Promise<Comment>;
  // evt (DEV-32) — контекст для журнала событий: кто/почему сменил статус (актор/триггер).
  updateStatus(id: string, status: string, evt?: { actorLogin?: string | null; actorRole?: string | null; trigger?: string | null }): Promise<void>;
  deleteTask(id: string): Promise<void>;
}
