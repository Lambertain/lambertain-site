/**
 * Хранилище портала на Postgres: связки Telegram↔YouTrack, инвайты, состояние поллера.
 * Локально — localhost:5434, на Railway — DATABASE_URL из плагина Postgres.
 * Server-side only.
 */
import { Pool } from "pg";
import { randomBytes } from "node:crypto";
import type { Role } from "./tasks/types";

declare global {
  var _pmPool: Pool | undefined;
  var _pmSchemaReady: Promise<void> | undefined;
}

function pool(): Pool {
  if (!global._pmPool) {
    global._pmPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // SSL только если явно sslmode=require (внутренний Railway postgres:16 SSL не поддерживает).
      ssl: process.env.DATABASE_URL?.includes("sslmode=require")
        ? { rejectUnauthorized: false }
        : false,
      max: 5,
    });
  }
  return global._pmPool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tg_links (
  tg_id           BIGINT PRIMARY KEY,
  youtrack_login  TEXT NOT NULL,
  role            TEXT NOT NULL,
  full_name       TEXT,
  linked_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS invites (
  token           TEXT PRIMARY KEY,
  youtrack_login  TEXT NOT NULL,
  role            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  used_by_tg_id   BIGINT
);
CREATE TABLE IF NOT EXISTS poller_state (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS role_overrides (
  login  TEXT PRIMARY KEY,
  role   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS access_requests (
  tg_id          BIGINT PRIMARY KEY,
  username       TEXT,
  full_name      TEXT,
  requested_role TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS web_login_tokens (
  token       TEXT PRIMARY KEY,
  tg_id       BIGINT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS project_api_tokens (
  project_key TEXT PRIMARY KEY,
  token       TEXT UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS skills (
  slug           TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  triggers       TEXT NOT NULL,
  playbook       TEXT NOT NULL,
  auto_generated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS token_usage (
  id            SERIAL PRIMARY KEY,
  ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
  model         TEXT,
  kind          TEXT,
  input_tokens  INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  cost_usd      NUMERIC NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS task_reads (
  login        TEXT NOT NULL,
  task_id      TEXT NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (login, task_id)
);
CREATE TABLE IF NOT EXISTS project_reads (
  login        TEXT NOT NULL,
  project_key  TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (login, project_key)
);
CREATE TABLE IF NOT EXISTS member_projects (
  login        TEXT NOT NULL,
  project_key  TEXT NOT NULL,
  PRIMARY KEY (login, project_key)
);
ALTER TABLE tg_links ADD COLUMN IF NOT EXISTS project_key TEXT;
ALTER TABLE invites ADD COLUMN IF NOT EXISTS project_key TEXT;
CREATE TABLE IF NOT EXISTS contractors (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  address      TEXT,
  ipn          TEXT,
  iban         TEXT,
  bank_name    TEXT,
  bank_mfo     TEXT,
  bank_edrpou  TEXT,
  phone        TEXT,
  email        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS email TEXT;
CREATE TABLE IF NOT EXISTS contract_templates (
  id           SERIAL PRIMARY KEY,
  title        TEXT NOT NULL,
  lang         TEXT NOT NULL DEFAULT 'uk',
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS contracts (
  id                SERIAL PRIMARY KEY,
  number            TEXT,
  contract_date     DATE,
  city              TEXT,
  title             TEXT,
  template_id       INT REFERENCES contract_templates(id) ON DELETE SET NULL,
  contractor_id     INT REFERENCES contractors(id) ON DELETE SET NULL,
  client_requisites TEXT,
  vars              JSONB NOT NULL DEFAULT '{}',
  body              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

// Цены Opus 4.8 ($/млн токенов). Поправить при изменении тарифа.
const PRICE_IN = 15;
const PRICE_OUT = 75;
export function tokenCost(inTok: number, outTok: number): number {
  return (inTok / 1e6) * PRICE_IN + (outTok / 1e6) * PRICE_OUT;
}

/** Гарантирует, что схема создана (один раз на процесс). */
export async function ensureSchema(): Promise<void> {
  if (!global._pmSchemaReady) {
    global._pmSchemaReady = pool()
      .query(SCHEMA)
      .then(() => undefined);
  }
  return global._pmSchemaReady;
}

export async function q<T = unknown>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  const r = await pool().query(text, params);
  return r.rows as T[];
}

/** Тип запросной функции внутри транзакции (тот же интерфейс, что и q). */
export type TxQuery = <T = unknown>(text: string, params?: unknown[]) => Promise<T[]>;

/**
 * Выполнить fn в одной транзакции на выделенном соединении (BEGIN/COMMIT, ROLLBACK при ошибке).
 * Нужно там, где важна атомарность нескольких запросов или advisory-блокировки (напр. генерация № задачи).
 */
export async function withTransaction<T>(fn: (query: TxQuery) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const query: TxQuery = async (text, params = []) => (await client.query(text, params)).rows;
    const out = await fn(query);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ---- Связки Telegram ↔ YouTrack ----
export interface TgLink {
  tg_id: number;
  youtrack_login: string;
  role: Role;
  full_name: string | null;
  project_key?: string | null;
}

export async function getLinkByTgId(tgId: number): Promise<TgLink | null> {
  const rows = await q<TgLink>(
    "SELECT tg_id, youtrack_login, role, full_name, project_key FROM tg_links WHERE tg_id = $1",
    [tgId],
  );
  return rows[0] ?? null;
}

/** Кастомное имя участника (видно только админу). */
export async function renameMember(login: string, alias: string | null): Promise<void> {
  await q("UPDATE members SET alias = $2 WHERE login = $1", [login, alias || null]);
}

/** Сменить проект клиента (его единственный проект). */
export async function setLinkProject(login: string, projectKey: string | null): Promise<void> {
  await q("UPDATE tg_links SET project_key = $2 WHERE youtrack_login = $1", [login, projectKey || null]);
}

// ---- Проекты сотрудника (мульти) ----
export async function getMemberProjects(login: string): Promise<string[]> {
  const rows = await q<{ project_key: string }>("SELECT project_key FROM member_projects WHERE login = $1", [login]);
  return rows.map((r) => r.project_key);
}
/** Все членства сотрудников: login → ключи проектов. */
export async function memberProjectsMap(): Promise<Map<string, string[]>> {
  const rows = await q<{ login: string; project_key: string }>("SELECT login, project_key FROM member_projects");
  const m = new Map<string, string[]>();
  for (const r of rows) {
    if (!m.has(r.login)) m.set(r.login, []);
    m.get(r.login)!.push(r.project_key);
  }
  return m;
}
export async function setMemberProjects(login: string, keys: string[]): Promise<void> {
  await q("DELETE FROM member_projects WHERE login = $1", [login]);
  for (const k of keys) {
    if (k) await q("INSERT INTO member_projects (login, project_key) VALUES ($1,$2) ON CONFLICT DO NOTHING", [login, k]);
  }
}

/** Есть ли у проекта привязанный клиент (member роли client, привязанный по tg_link к этому проекту). */
export async function projectHasClient(projectKey: string): Promise<boolean> {
  const rows = await q<{ n: number }>(
    "SELECT count(*)::int AS n FROM tg_links WHERE project_key = $1 AND role = 'client'",
    [projectKey],
  );
  return (rows[0]?.n ?? 0) > 0;
}

/**
 * Удалить пользователя из портала: отвязка от бота, проектов и ролей, удаление member.
 * Ссылки в задачах/комментах обнуляются (авторство сохраняется через orig_author_login/orig_*).
 */
export async function deleteMember(login: string): Promise<void> {
  const m = await q<{ id: number; tg_id: number | null }>("SELECT id FROM members WHERE login = $1", [login]);
  if (!m[0]) return;
  const id = m[0].id;
  await q("UPDATE tasks SET assignee_id = NULL WHERE assignee_id = $1", [id]);
  await q("UPDATE tasks SET reporter_id = NULL WHERE reporter_id = $1", [id]);
  await q("UPDATE comments SET author_id = NULL WHERE author_id = $1", [id]);
  await q("DELETE FROM member_projects WHERE login = $1", [login]);
  await q("DELETE FROM tg_links WHERE youtrack_login = $1", [login]);
  await q("DELETE FROM role_overrides WHERE login = $1", [login]);
  await q("DELETE FROM members WHERE id = $1", [id]);
}

/** Сменить статус утверждения задачи (approved/pending/rejected). */
export async function setTaskApproval(taskId: string, status: "approved" | "pending" | "rejected"): Promise<void> {
  await q("UPDATE tasks SET approval_status = $2 WHERE readable_id = $1", [taskId, status]);
}

/** Создать/обновить участника (member) — для людей, добавленных через Telegram. */
export async function upsertMember(
  login: string,
  fullName: string | null,
  role: Role,
  tgId: number | null,
): Promise<void> {
  await q(
    `INSERT INTO members (login, full_name, role, tg_id) VALUES ($1,$2,$3,$4)
     ON CONFLICT (login) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, tg_id = EXCLUDED.tg_id`,
    [login, fullName, role, tgId],
  );
}

export async function upsertLink(link: TgLink): Promise<void> {
  await q(
    `INSERT INTO tg_links (tg_id, youtrack_login, role, full_name, project_key)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tg_id) DO UPDATE
       SET youtrack_login = EXCLUDED.youtrack_login,
           role = EXCLUDED.role,
           full_name = EXCLUDED.full_name,
           project_key = EXCLUDED.project_key`,
    [link.tg_id, link.youtrack_login, link.role, link.full_name, link.project_key ?? null],
  );
}

// ---- Инвайты ----
export interface Invite {
  token: string;
  youtrack_login: string;
  role: Role;
  expires_at: string;
  used_at: string | null;
  project_key: string | null;
  /** Несколько проектов (для разраба — стать ответственным на каждом). Comma-joined ключи. */
  project_keys: string | null;
  /** Показать клиенту онбординг-инструкцию при первом входе. */
  show_onboarding: boolean;
}

export async function createInvite(
  token: string,
  youtrackLogin: string,
  role: Role,
  ttlHours: number,
  projectKeys: string[],
  showOnboarding = false,
): Promise<void> {
  await q(
    `INSERT INTO invites (token, youtrack_login, role, expires_at, project_key, project_keys, show_onboarding)
     VALUES ($1, $2, $3, now() + ($4 || ' hours')::interval, $5, $6, $7)`,
    [token, youtrackLogin, role, String(ttlHours), projectKeys[0] ?? null, projectKeys.join(",") || null, showOnboarding],
  );
}

export async function getInvite(token: string): Promise<Invite | null> {
  const rows = await q<Invite>(
    "SELECT token, youtrack_login, role, expires_at, used_at, project_key, project_keys, show_onboarding FROM invites WHERE token = $1",
    [token],
  );
  return rows[0] ?? null;
}

export async function markInviteUsed(token: string, tgId: number): Promise<void> {
  await q("UPDATE invites SET used_at = now(), used_by_tg_id = $2 WHERE token = $1", [token, tgId]);
}

/** Привязанные к боту аккаунты (кто присоединился) — для экрана команды. */
export interface LinkedAccount {
  login: string;
  role: Role;
  full_name: string | null;
  project_key: string | null;
  linked_at: string;
}
export async function listLinks(): Promise<LinkedAccount[]> {
  return q<LinkedAccount>(
    "SELECT youtrack_login AS login, role, full_name, project_key, linked_at FROM tg_links ORDER BY linked_at DESC",
  );
}

// ---- Оверрайды ролей (login -> role), приоритетнее ролей YouTrack ----
export async function getRoleOverrides(): Promise<Map<string, Role>> {
  const rows = await q<{ login: string; role: Role }>("SELECT login, role FROM role_overrides");
  return new Map(rows.map((r) => [r.login, r.role]));
}

// ---- Заявки на доступ (новый пользователь выбрал роль, ждёт подтверждения) ----
export interface AccessRequest {
  tg_id: number;
  username: string | null;
  full_name: string | null;
  requested_role: Role;
  created_at: string;
}

export async function upsertAccessRequest(
  tgId: number,
  username: string | null,
  fullName: string | null,
  role: Role,
): Promise<void> {
  await q(
    `INSERT INTO access_requests (tg_id, username, full_name, requested_role)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (tg_id) DO UPDATE
       SET username=EXCLUDED.username, full_name=EXCLUDED.full_name,
           requested_role=EXCLUDED.requested_role, created_at=now()`,
    [tgId, username, fullName, role],
  );
}

export async function listAccessRequests(): Promise<AccessRequest[]> {
  return q<AccessRequest>(
    "SELECT tg_id, username, full_name, requested_role, created_at FROM access_requests ORDER BY created_at",
  );
}

export async function deleteAccessRequest(tgId: number): Promise<void> {
  await q("DELETE FROM access_requests WHERE tg_id = $1", [tgId]);
}

// ---- Одноразовые токены для входа в веб из апки ----
export async function createWebLoginToken(token: string, tgId: number, ttlMin: number): Promise<void> {
  await q(
    `INSERT INTO web_login_tokens (token, tg_id, expires_at)
     VALUES ($1,$2, now() + ($3 || ' minutes')::interval)`,
    [token, tgId, String(ttlMin)],
  );
}

export async function consumeWebLoginToken(token: string): Promise<number | null> {
  const rows = await q<{ tg_id: number }>(
    `UPDATE web_login_tokens SET used_at = now()
     WHERE token = $1 AND used_at IS NULL AND expires_at > now()
     RETURNING tg_id`,
    [token],
  );
  return rows[0]?.tg_id ?? null;
}

// ---- Проекты: создание и редактирование метаданных ----
import type { ProjectMeta } from "./tasks/types";

export async function createProject(key: string, name: string): Promise<void> {
  await q(
    `INSERT INTO projects (key, name, meta) VALUES ($1,$2,'{}'::jsonb)
     ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name`,
    [key, name],
  );
}

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ye", ё: "e", ж: "zh", з: "z", и: "y", і: "i", ї: "yi",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
  ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/** Автогенерация уникального ключа проекта из названия (транслит кириллицы → латиница, до 4 симв.). */
export async function generateProjectKey(name: string): Promise<string> {
  const translit = name.toLowerCase().split("").map((c) => TRANSLIT[c] ?? c).join("");
  const base = (translit.replace(/[^a-z0-9]/g, "").toUpperCase().slice(0, 4) || "PRJ");
  const existing = new Set((await q<{ key: string }>("SELECT key FROM projects")).map((r) => r.key));
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(base + n)) n++;
  return base + n;
}

export async function getProjectFull(key: string): Promise<{ name: string; meta: ProjectMeta } | null> {
  const rows = await q<{ name: string; meta: ProjectMeta | null }>(
    "SELECT name, meta FROM projects WHERE key = $1",
    [key],
  );
  return rows[0] ? { name: rows[0].name, meta: rows[0].meta ?? {} } : null;
}

export async function setProjectMeta(key: string, name: string, meta: ProjectMeta): Promise<void> {
  await q("UPDATE projects SET name = $2, meta = $3 WHERE key = $1", [key, name, JSON.stringify(meta)]);
}

/** Флаг «показать клиенту онбординг» на проекте. */
export async function setProjectShowOnboarding(key: string, on: boolean): Promise<void> {
  const p = await getProjectFull(key);
  if (!p) return;
  await setProjectMeta(key, p.name, { ...p.meta, showOnboarding: on });
}

/** Сохранить введённое клиентом значение онбординга в поле проекта (clientGit / railwayToken). */
export async function saveOnboardingValue(key: string, collect: OnboardingCollect, value: string): Promise<void> {
  const p = await getProjectFull(key);
  if (!p) return;
  const meta = { ...p.meta };
  const v = value.trim();
  if (collect === "clientGit") meta.clientGit = v;
  else if (collect === "railwayToken") meta.clientDeploy = { ...(meta.clientDeploy || {}), railwayToken: v };
  await setProjectMeta(key, p.name, meta);
}

/** Текущие значения собираемых онбордингом полей проекта (для префилла). */
export async function getOnboardingValues(key: string): Promise<Record<OnboardingCollect, string>> {
  const p = await getProjectFull(key);
  return {
    clientGit: p?.meta.clientGit || "",
    railwayToken: p?.meta.clientDeploy?.railwayToken || "",
  };
}

export async function setProjectArchived(key: string, archived: boolean): Promise<void> {
  await q("UPDATE projects SET archived = $2 WHERE key = $1", [key, archived]);
}

export async function listAllProjects(): Promise<{ key: string; name: string; archived: boolean }[]> {
  return q<{ key: string; name: string; archived: boolean }>(
    "SELECT key, name, archived FROM projects ORDER BY archived, key",
  );
}

/** Проекты с метаданными (для дашборда загрузки и видимости по defaultAssignee). */
export async function listProjectsWithMeta(): Promise<
  { key: string; name: string; meta: ProjectMeta; archived: boolean; createdAt: string | null }[]
> {
  const rows = await q<{ key: string; name: string; meta: ProjectMeta | null; archived: boolean; created_at: string | null }>(
    "SELECT key, name, meta, archived, created_at FROM projects ORDER BY archived, key",
  );
  return rows.map((r) => ({ key: r.key, name: r.name, meta: r.meta ?? {}, archived: r.archived, createdAt: r.created_at }));
}

/** Счётчики задач по проекту (total и done по корзине done). */
export async function taskCountsByProject(): Promise<{ projectKey: string; total: number; done: number }[]> {
  // done — по тем же ключевым словам, что и корзина done в statuses.ts.
  const rows = await q<{ project_key: string; total: string; done: string }>(
    `SELECT p.key AS project_key,
            count(t.id) AS total,
            count(t.id) FILTER (WHERE t.status ~* '(done|закры|готов|fixed|complete|verified|выполн)') AS done
       FROM projects p
       LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.key`,
  );
  return rows.map((r) => ({ projectKey: r.project_key, total: Number(r.total), done: Number(r.done) }));
}

/**
 * Задать точный набор проектов разработчика (один дев на проект, но дев ведёт несколько проектов).
 * Делает его ответственным (defaultAssignee) на проектах из keys и снимает с остальных,
 * где ответственным был он. Чужие назначения не трогает.
 */
export async function setDevProjects(login: string, keys: string[]): Promise<void> {
  const projects = await listProjectsWithMeta();
  const want = new Set(keys);
  for (const p of projects) {
    const isMine = p.meta.defaultAssignee === login;
    const shouldBeMine = want.has(p.key);
    if (isMine === shouldBeMine) continue;
    const meta: ProjectMeta = { ...p.meta, defaultAssignee: shouldBeMine ? login : undefined };
    await setProjectMeta(p.key, p.name, meta);
  }
}

/** Сохранить ссылку на код (коммит/PR/ветка) — её использует on-demand ИИ-ревью. */
export async function setReviewRef(taskId: string, ref: string | null): Promise<void> {
  await q("UPDATE tasks SET review_ref = $2 WHERE readable_id = $1", [taskId, ref]);
}

/** Ссылка на код для ревью (review_ref) задачи. */
export async function getReviewRef(taskId: string): Promise<string | null> {
  const rows = await q<{ review_ref: string | null }>("SELECT review_ref FROM tasks WHERE readable_id = $1", [taskId]);
  return rows[0]?.review_ref ?? null;
}

// ---- Перенос истории: «осиротевшие» авторы (удалённые ники YouTrack) → новый tg-пользователь ----
export interface OrphanAuthor {
  login: string;
  role: Role | null;
  comments: number;
  assigneeTasks: number;
  reporterTasks: number;
}

/** Логины из orig_*_login, для которых нет члена в members (удалённые ники YouTrack) + счётчики. */
export async function listOrphanAuthors(): Promise<OrphanAuthor[]> {
  const rows = await q<{ login: string; role: Role | null; comments: string; assignee_tasks: string; reporter_tasks: string }>(
    `WITH orphans AS (
        SELECT orig_author_login AS login, orig_author_role AS role, 'comment' AS kind
          FROM comments WHERE author_id IS NULL AND orig_author_login IS NOT NULL
        UNION ALL SELECT orig_assignee_login, NULL, 'assignee' FROM tasks WHERE assignee_id IS NULL AND orig_assignee_login IS NOT NULL
        UNION ALL SELECT orig_reporter_login, NULL, 'reporter' FROM tasks WHERE reporter_id IS NULL AND orig_reporter_login IS NOT NULL
      )
      SELECT o.login,
             max(o.role) FILTER (WHERE o.role IS NOT NULL) AS role,
             count(*) FILTER (WHERE kind='comment')  AS comments,
             count(*) FILTER (WHERE kind='assignee') AS assignee_tasks,
             count(*) FILTER (WHERE kind='reporter') AS reporter_tasks
        FROM orphans o
       WHERE NOT EXISTS (SELECT 1 FROM members m WHERE m.login = o.login)
       GROUP BY o.login ORDER BY o.login`,
  );
  return rows.map((r) => ({
    login: r.login,
    role: r.role,
    comments: Number(r.comments),
    assigneeTasks: Number(r.assignee_tasks),
    reporterTasks: Number(r.reporter_tasks),
  }));
}

/** Привязать историю старого логина (orig_*) к существующему члену newLogin. Заполняет только пустые ссылки. */
export async function relinkMember(origLogin: string, newLogin: string): Promise<{ comments: number; assignee: number; reporter: number }> {
  const m = await q<{ id: number }>("SELECT id FROM members WHERE login = $1", [newLogin]);
  if (!m[0]) throw new Error(`Пользователь ${newLogin} не найден`);
  const id = m[0].id;
  const c = await q("UPDATE comments SET author_id = $1 WHERE orig_author_login = $2 AND author_id IS NULL RETURNING id", [id, origLogin]);
  const a = await q("UPDATE tasks SET assignee_id = $1 WHERE orig_assignee_login = $2 AND assignee_id IS NULL RETURNING id", [id, origLogin]);
  const r = await q("UPDATE tasks SET reporter_id = $1 WHERE orig_reporter_login = $2 AND reporter_id IS NULL RETURNING id", [id, origLogin]);
  return { comments: c.length, assignee: a.length, reporter: r.length };
}

/** Блок запроса: текст, картинка или файл (base64). Порядок блоков = хронология ввода. */
export type ReqBlock =
  | { type: "text"; text: string }
  | { type: "image"; mime: string; data: string }
  | { type: "file"; mime: string; data: string; name: string };

/**
 * Дописать блоки запроса в описание задачи С СОХРАНЕНИЕМ ПОРЯДКА: текст — Markdown,
 * картинки/файлы сохраняются в attachments и вставляются на своих местах
 * (![](/api/files/id) для картинок, [имя](/api/files/id) для файлов).
 */
export async function appendRequestBlocks(readableId: string, blocks: ReqBlock[]): Promise<void> {
  if (!blocks.length) return;
  const rows = await q<{ id: number; description: string | null }>(
    "SELECT id, description FROM tasks WHERE readable_id = $1",
    [readableId],
  );
  if (!rows[0]) return;
  const taskId = rows[0].id;
  const parts: string[] = rows[0].description?.trim() ? [rows[0].description.trim()] : [];
  let i = 1;
  for (const b of blocks) {
    if (b.type === "text") {
      if (b.text.trim()) parts.push(b.text.trim());
      continue;
    }
    const buf = Buffer.from(b.data, "base64");
    if (b.type === "image") {
      const ext = (b.mime.split("/")[1] || "png").replace("jpeg", "jpg");
      const ins = await q<{ id: number }>(
        `INSERT INTO attachments (task_id, name, mime, data) VALUES ($1,$2,$3,$4)
         ON CONFLICT (task_id, name) DO UPDATE SET data=EXCLUDED.data RETURNING id`,
        [taskId, `screen-${i}.${ext}`, b.mime, buf],
      );
      parts.push(`![](/api/files/${ins[0].id})`);
      i++;
    } else {
      const uniq = `${(b.name || "file").slice(0, 40)}-${randomBytes(4).toString("hex")}`;
      const ins = await q<{ id: number }>(
        "INSERT INTO attachments (task_id, name, mime, data) VALUES ($1,$2,$3,$4) RETURNING id",
        [taskId, uniq, b.mime, buf],
      );
      parts.push(`[${b.name || "файл"}](/api/files/${ins[0].id})`);
    }
  }
  await q("UPDATE tasks SET description = $2 WHERE id = $1", [taskId, parts.join("\n\n")]);
}

// ---- ИИ-проработка задач (drafter) ----
/** Состояние проработки: pending | waiting | done | null. */
export async function setTaskAiStatus(readableId: string, status: "pending" | "waiting" | "done" | null): Promise<void> {
  await q("UPDATE tasks SET ai_status = $2 WHERE readable_id = $1", [readableId, status]);
}
/** Флаг «нужно действие владельца» (деплой/регистрация/токен) — задача ждёт ручного ops-шага супер-админа. null = снять. */
export async function setOwnerAction(readableId: string, action: string | null): Promise<void> {
  await q("UPDATE tasks SET owner_action = $2, updated_at = now() WHERE readable_id = $1", [readableId, action]);
}
export async function getTaskAiStatus(readableId: string): Promise<string | null> {
  const rows = await q<{ ai_status: string | null }>("SELECT ai_status FROM tasks WHERE readable_id = $1", [readableId]);
  return rows[0]?.ai_status ?? null;
}
/** Теги триажа задачи: тип, сложность, скилы для подключения на стороне разработчика. */
export interface TaskTags {
  type?: string;
  complexity?: "small" | "feature";
  skills?: string[];
}
export async function setTaskTags(readableId: string, tags: TaskTags): Promise<void> {
  await q("UPDATE tasks SET tags = $2 WHERE readable_id = $1", [readableId, JSON.stringify(tags)]);
}
export async function getTaskTags(readableId: string): Promise<TaskTags | null> {
  const rows = await q<{ tags: TaskTags | null }>("SELECT tags FROM tasks WHERE readable_id = $1", [readableId]);
  return rows[0]?.tags ?? null;
}

/** readable_id задач, ожидающих проработки (страховка для поллера/ретрая). */
export async function getAiPendingTasks(): Promise<string[]> {
  const rows = await q<{ readable_id: string }>("SELECT readable_id FROM tasks WHERE ai_status = 'pending' ORDER BY updated_at ASC LIMIT 20");
  return rows.map((r) => r.readable_id);
}
/** Назначить исполнителя по логину + перевести в «В работе». */
export async function assignTask(readableId: string, login: string): Promise<void> {
  await q(
    `UPDATE tasks SET assignee_id = (SELECT id FROM members WHERE login = $2), status = 'In Progress', updated_at = now()
     WHERE readable_id = $1`,
    [readableId, login],
  );
}
/** Обновить заголовок задачи. */
export async function setTaskTitle(readableId: string, title: string): Promise<void> {
  await q("UPDATE tasks SET title = $2, updated_at = now() WHERE readable_id = $1", [readableId, title]);
}

/** Редактирование полей задачи (заголовок, описание, исполнитель, приоритет) — для админа. */
export async function updateTaskFields(
  readableId: string,
  f: { title?: string; description?: string; assigneeLogin?: string | null; priority?: string | null },
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [readableId];
  if (f.title !== undefined) { params.push(f.title); sets.push(`title = $${params.length}`); }
  if (f.description !== undefined) { params.push(f.description); sets.push(`description = $${params.length}`); }
  if (f.priority !== undefined) { params.push(f.priority || null); sets.push(`priority = $${params.length}`); }
  if (f.assigneeLogin !== undefined) {
    params.push(f.assigneeLogin || null);
    sets.push(`assignee_id = (SELECT id FROM members WHERE login = $${params.length})`);
  }
  if (!sets.length) return;
  await q(`UPDATE tasks SET ${sets.join(", ")}, updated_at = now() WHERE readable_id = $1`, params);
}
/** Картинки задачи как base64 (для подачи ИИ-проработчику). */
export async function getTaskImages(readableId: string): Promise<{ mime: string; data: string }[]> {
  const rows = await q<{ mime: string | null; data: Buffer }>(
    `SELECT a.mime, a.data FROM attachments a JOIN tasks t ON t.id = a.task_id WHERE t.readable_id = $1 ORDER BY a.id`,
    [readableId],
  );
  return rows.map((r) => ({ mime: r.mime || "image/png", data: r.data.toString("base64") }));
}

// ---- Онбординг-инструкция клиента (шаги + публичные картинки) ----
/** Какое поле проекта собирает шаг (клиент вводит, сохраняется в meta). */
export type OnboardingCollect = "clientGit" | "railwayToken";
export interface OnboardingStep {
  title: string;
  body: string; // markdown; картинки — ![](/api/onboarding-media/<id>)
  /** Поле для сбора данных от клиента на этом шаге (опц.). */
  collect?: OnboardingCollect;
}
const DEFAULT_ONBOARDING: { steps: OnboardingStep[] } = { steps: [] };

export async function getOnboarding(): Promise<{ steps: OnboardingStep[] }> {
  const rows = await q<{ value: { steps?: OnboardingStep[] } }>("SELECT value FROM settings WHERE key = 'onboarding'");
  const v = rows[0]?.value;
  if (!v || !Array.isArray(v.steps)) return DEFAULT_ONBOARDING;
  return { steps: v.steps };
}

export async function saveOnboarding(steps: OnboardingStep[]): Promise<void> {
  await q(
    `INSERT INTO settings (key, value, updated_at) VALUES ('onboarding', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify({ steps })],
  );
}

/** Сохранить картинку шага (base64) → id (для /api/onboarding-media/<id>). */
export async function saveOnboardingMedia(mime: string, base64: string): Promise<number> {
  const buf = Buffer.from(base64, "base64");
  const rows = await q<{ id: number }>("INSERT INTO onboarding_media (mime, data) VALUES ($1,$2) RETURNING id", [mime, buf]);
  return rows[0].id;
}
export async function getOnboardingMedia(id: number): Promise<{ mime: string | null; data: Buffer } | null> {
  const rows = await q<{ mime: string | null; data: Buffer }>("SELECT mime, data FROM onboarding_media WHERE id = $1", [id]);
  return rows[0] ?? null;
}

/** Сохранить один файл-вложение к задаче (любой mime) → id для /api/files/<id>. Имя уникализируем. */
export async function saveAttachment(readableId: string, mime: string, base64: string, name: string): Promise<number | null> {
  const rows = await q<{ id: number }>("SELECT id FROM tasks WHERE readable_id = $1", [readableId]);
  if (!rows[0]) return null;
  const buf = Buffer.from(base64, "base64");
  const uniq = `${(name || "file").slice(0, 40)}-${randomBytes(4).toString("hex")}`;
  const ins = await q<{ id: number }>(
    "INSERT INTO attachments (task_id, name, mime, data) VALUES ($1,$2,$3,$4) RETURNING id",
    [rows[0].id, uniq, mime, buf],
  );
  return ins[0].id;
}

// ---- Вложения (картинки задач, скачанные из YouTrack) ----
export async function getAttachment(id: number): Promise<{ mime: string | null; data: Buffer } | null> {
  const rows = await q<{ mime: string | null; data: Buffer }>(
    "SELECT mime, data FROM attachments WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

// ---- Зависимости задач (блокеры) ----
export interface DepInfo {
  id: string; // readable_id блокера
  summary: string;
  status: string | null;
}

/** Блокеры для набора задач: readable_id задачи → список задач-блокеров. */
export async function getDepsFor(taskIds: string[]): Promise<Map<string, DepInfo[]>> {
  const map = new Map<string, DepInfo[]>();
  if (!taskIds.length) return map;
  const rows = await q<{ task_readable: string; dep_readable: string; dep_title: string; dep_status: string | null }>(
    `SELECT tk.readable_id AS task_readable,
            dep.readable_id AS dep_readable, dep.title AS dep_title, dep.status AS dep_status
       FROM task_deps d
       JOIN tasks tk ON tk.id = d.task_id
       JOIN tasks dep ON dep.id = d.depends_on_id
      WHERE tk.readable_id = ANY($1::text[])`,
    [taskIds],
  );
  for (const r of rows) {
    const arr = map.get(r.task_readable) ?? [];
    arr.push({ id: r.dep_readable, summary: r.dep_title, status: r.dep_status });
    map.set(r.task_readable, arr);
  }
  return map;
}

/** Текущие блокеры одной задачи (readable_id). */
export async function getTaskDeps(taskId: string): Promise<DepInfo[]> {
  return (await getDepsFor([taskId])).get(taskId) ?? [];
}

/** Задать точный набор блокеров задачи (readable_id блокеров). Само-зависимость игнорируется. */
export async function setTaskDeps(taskId: string, dependsOn: string[]): Promise<void> {
  const self = await q<{ id: number }>("SELECT id FROM tasks WHERE readable_id = $1", [taskId]);
  if (!self[0]) throw new Error(`Задача ${taskId} не найдена`);
  const ids = dependsOn.filter((d) => d && d !== taskId);
  const depRows = ids.length
    ? await q<{ id: number }>("SELECT id FROM tasks WHERE readable_id = ANY($1::text[])", [ids])
    : [];
  await q("DELETE FROM task_deps WHERE task_id = $1", [self[0].id]);
  for (const d of depRows) {
    await q("INSERT INTO task_deps (task_id, depends_on_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [self[0].id, d.id]);
  }
}

// ---- API-токены проектов (для чтения задач Claude'ом разработчика) ----
export async function getProjectKeyByToken(token: string): Promise<string | null> {
  const rows = await q<{ project_key: string }>(
    "SELECT project_key FROM project_api_tokens WHERE token = $1",
    [token],
  );
  return rows[0]?.project_key ?? null;
}

export async function getProjectTokens(): Promise<Map<string, string>> {
  const rows = await q<{ project_key: string; token: string }>(
    "SELECT project_key, token FROM project_api_tokens",
  );
  return new Map(rows.map((r) => [r.project_key, r.token]));
}

export async function setProjectToken(projectKey: string, token: string): Promise<void> {
  await q(
    `INSERT INTO project_api_tokens (project_key, token) VALUES ($1,$2)
     ON CONFLICT (project_key) DO UPDATE SET token = EXCLUDED.token, created_at = now()`,
    [projectKey, token],
  );
}

// ---- Скилы (плейбуки под типы задач, самораширяемые) ----
export interface Skill {
  slug: string;
  title: string;
  triggers: string;
  playbook: string;
  auto_generated: boolean;
}

export async function listSkills(): Promise<Skill[]> {
  return q<Skill>("SELECT slug, title, triggers, playbook, auto_generated FROM skills ORDER BY created_at");
}

export async function getSkill(slug: string): Promise<Skill | null> {
  const rows = await q<Skill>(
    "SELECT slug, title, triggers, playbook, auto_generated FROM skills WHERE slug = $1",
    [slug],
  );
  return rows[0] ?? null;
}

/** Скилы по набору slug'ов (для /api/dev/skills — Claude разработчика грузит плейбуки по тегам). */
export async function getSkillsBySlugs(slugs: string[]): Promise<Skill[]> {
  if (!slugs.length) return [];
  return q<Skill>("SELECT slug, title, triggers, playbook, auto_generated FROM skills WHERE slug = ANY($1::text[])", [slugs]);
}

export async function createSkill(
  slug: string,
  title: string,
  triggers: string,
  playbook: string,
  autoGenerated: boolean,
): Promise<void> {
  await q(
    `INSERT INTO skills (slug, title, triggers, playbook, auto_generated) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, triggers=EXCLUDED.triggers, playbook=EXCLUDED.playbook`,
    [slug, title, triggers, playbook, autoGenerated],
  );
}

// ---- Прочитанность задач (login -> task -> время) ----
export async function getReads(login: string): Promise<Map<string, number>> {
  const rows = await q<{ task_id: string; last_read_at: string }>(
    "SELECT task_id, last_read_at FROM task_reads WHERE login = $1",
    [login],
  );
  return new Map(rows.map((r) => [r.task_id, new Date(r.last_read_at).getTime()]));
}

export async function markRead(login: string, taskId: string): Promise<void> {
  await q(
    `INSERT INTO task_reads (login, task_id, last_read_at) VALUES ($1,$2, now())
     ON CONFLICT (login, task_id) DO UPDATE SET last_read_at = now()`,
    [login, taskId],
  );
}

/** Когда логин последний раз «открывал» каждый проект (для метки New на проекте). */
export async function getProjectReads(login: string): Promise<Map<string, number>> {
  const rows = await q<{ project_key: string; last_seen_at: string }>(
    "SELECT project_key, last_seen_at FROM project_reads WHERE login = $1",
    [login],
  );
  return new Map(rows.map((r) => [r.project_key, new Date(r.last_seen_at).getTime()]));
}

export async function markProjectSeen(login: string, projectKey: string): Promise<void> {
  await q(
    `INSERT INTO project_reads (login, project_key, last_seen_at) VALUES ($1,$2, now())
     ON CONFLICT (login, project_key) DO UPDATE SET last_seen_at = now()`,
    [login, projectKey],
  );
}

// ---- Расход токенов ----
export async function logUsage(model: string, kind: string, inTok: number, outTok: number): Promise<void> {
  await q(
    "INSERT INTO token_usage (model, kind, input_tokens, output_tokens, cost_usd) VALUES ($1,$2,$3,$4,$5)",
    [model, kind, inTok, outTok, tokenCost(inTok, outTok)],
  );
}

export async function usageSummary(): Promise<{ todayUsd: number; monthUsd: number; todayTok: number }> {
  const rows = await q<{ today_usd: string; month_usd: string; today_tok: string }>(
    `SELECT
       COALESCE(SUM(cost_usd) FILTER (WHERE ts::date = now()::date),0) AS today_usd,
       COALESCE(SUM(cost_usd) FILTER (WHERE date_trunc('month',ts)=date_trunc('month',now())),0) AS month_usd,
       COALESCE(SUM(input_tokens+output_tokens) FILTER (WHERE ts::date = now()::date),0) AS today_tok
     FROM token_usage`,
  );
  return {
    todayUsd: Number(rows[0]?.today_usd || 0),
    monthUsd: Number(rows[0]?.month_usd || 0),
    todayTok: Number(rows[0]?.today_tok || 0),
  };
}

// ---- Состояние поллера ----
export async function getState(key: string): Promise<string | null> {
  const rows = await q<{ value: string }>("SELECT value FROM poller_state WHERE key = $1", [key]);
  return rows[0]?.value ?? null;
}

export async function setState(key: string, value: string): Promise<void> {
  await q(
    `INSERT INTO poller_state (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value],
  );
}

// ——— Брифы лидов (до клиента/проекта) ———
export interface Brief {
  id: number;
  token: string;
  label: string | null;
  project_type: string | null;
  payload: Record<string, unknown> | null;
  status: string;
  project_key: string | null;
  created_at: string;
  submitted_at: string | null;
}

/** Завести бриф лида (метка — имя/контакт). Возвращает токен для публичной ссылки /brief/<token>. */
export async function createBrief(label: string): Promise<{ id: number; token: string }> {
  const token = randomBytes(16).toString("hex");
  const rows = await q<{ id: number }>(
    "INSERT INTO briefs (token, label) VALUES ($1, $2) RETURNING id",
    [token, label.trim() || null],
  );
  return { id: rows[0].id, token };
}

export async function getBriefByToken(token: string): Promise<Brief | null> {
  const rows = await q<Brief>("SELECT * FROM briefs WHERE token = $1", [token]);
  return rows[0] ?? null;
}

/** Сохранить заполненный бриф (тип проекта + ответы) и пометить отправленным. */
export async function submitBrief(token: string, projectType: string, payload: Record<string, unknown>): Promise<boolean> {
  const rows = await q<{ id: number }>(
    "UPDATE briefs SET project_type = $2, payload = $3, status = 'submitted', submitted_at = now() WHERE token = $1 RETURNING id",
    [token, projectType, JSON.stringify(payload)],
  );
  return rows.length > 0;
}

/** Список брифов для админа (новые сверху). */
export async function listBriefs(): Promise<Brief[]> {
  return q<Brief>("SELECT * FROM briefs ORDER BY created_at DESC");
}

/** Привязать бриф к проекту (или отвязать, projectKey=null). */
export async function linkBriefToProject(briefId: number, projectKey: string | null): Promise<void> {
  await q("UPDATE briefs SET project_key = $2 WHERE id = $1", [briefId, projectKey]);
}

/** Бриф, привязанный к проекту (последний, если несколько). */
export async function getBriefByProject(projectKey: string): Promise<Brief | null> {
  const rows = await q<Brief>("SELECT * FROM briefs WHERE project_key = $1 ORDER BY submitted_at DESC NULLS LAST, created_at DESC LIMIT 1", [projectKey]);
  return rows[0] ?? null;
}

// ——— Гайды-инструкции (библиотека) ———
export interface Guide { id: number; slug: string; title: string; body: string; ord: number }

export async function listGuides(): Promise<Guide[]> {
  return q<Guide>("SELECT id, slug, title, body, ord FROM guides ORDER BY ord, title");
}
export async function createGuide(slug: string, title: string, body: string, ord: number): Promise<{ id?: number; error?: string }> {
  try {
    const rows = await q<{ id: number }>("INSERT INTO guides (slug, title, body, ord) VALUES ($1,$2,$3,$4) RETURNING id", [slug, title, body, ord]);
    return { id: rows[0].id };
  } catch {
    return { error: "slug занят" };
  }
}
export async function updateGuide(id: number, title: string, body: string, ord: number): Promise<void> {
  await q("UPDATE guides SET title=$2, body=$3, ord=$4 WHERE id=$1", [id, title, body, ord]);
}
export async function deleteGuide(id: number): Promise<void> {
  await q("DELETE FROM guides WHERE id=$1", [id]);
}
/** id включённых клиенту гайдов по проекту. */
export async function getProjectGuideIds(projectKey: string): Promise<number[]> {
  const rows = await q<{ guide_id: number }>("SELECT guide_id FROM project_guides WHERE project_key=$1", [projectKey]);
  return rows.map((r) => r.guide_id);
}
/** Заменить набор включённых гайдов проекта. */
export async function setProjectGuides(projectKey: string, guideIds: number[]): Promise<void> {
  await q("DELETE FROM project_guides WHERE project_key=$1", [projectKey]);
  for (const gid of guideIds) {
    await q("INSERT INTO project_guides (project_key, guide_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [projectKey, gid]);
  }
}
/** Включённые клиенту гайды проекта (для кабинета клиента). */
export async function getEnabledGuides(projectKey: string): Promise<Guide[]> {
  return q<Guide>(
    "SELECT g.id, g.slug, g.title, g.body, g.ord FROM guides g JOIN project_guides pg ON pg.guide_id=g.id WHERE pg.project_key=$1 ORDER BY g.ord, g.title",
    [projectKey],
  );
}

/** Сохранить картинку гайда (base64) → id. Отдаётся через /api/guide-files/<id>. */
export async function saveGuideImage(mime: string, dataB64: string): Promise<number> {
  const buf = Buffer.from(dataB64, "base64");
  const rows = await q<{ id: number }>("INSERT INTO guide_images (mime, data) VALUES ($1, $2) RETURNING id", [mime || "image/png", buf]);
  return rows[0].id;
}
export async function getGuideImage(id: number): Promise<{ mime: string | null; data: Buffer } | null> {
  const rows = await q<{ mime: string | null; data: Buffer }>("SELECT mime, data FROM guide_images WHERE id = $1", [id]);
  return rows[0] ?? null;
}

// ——— Договоры: ФОПы-исполнители, шаблоны, сгенерированные договоры ———
export interface Contractor {
  id: number;
  name: string;
  address: string | null;
  ipn: string | null;
  iban: string | null;
  bank_name: string | null;
  bank_mfo: string | null;
  bank_edrpou: string | null;
  phone: string | null;
  email: string | null;
}
export type ContractorInput = Omit<Contractor, "id">;

export async function listContractors(): Promise<Contractor[]> {
  return q<Contractor>("SELECT id, name, address, ipn, iban, bank_name, bank_mfo, bank_edrpou, phone, email FROM contractors ORDER BY name");
}
export async function getContractor(id: number): Promise<Contractor | null> {
  const rows = await q<Contractor>("SELECT id, name, address, ipn, iban, bank_name, bank_mfo, bank_edrpou, phone, email FROM contractors WHERE id = $1", [id]);
  return rows[0] ?? null;
}
export async function createContractor(c: ContractorInput): Promise<number> {
  const rows = await q<{ id: number }>(
    `INSERT INTO contractors (name, address, ipn, iban, bank_name, bank_mfo, bank_edrpou, phone, email)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [c.name, c.address, c.ipn, c.iban, c.bank_name, c.bank_mfo, c.bank_edrpou, c.phone, c.email],
  );
  return rows[0].id;
}
export async function updateContractor(id: number, c: ContractorInput): Promise<void> {
  await q(
    `UPDATE contractors SET name=$2, address=$3, ipn=$4, iban=$5, bank_name=$6, bank_mfo=$7, bank_edrpou=$8, phone=$9, email=$10 WHERE id=$1`,
    [id, c.name, c.address, c.ipn, c.iban, c.bank_name, c.bank_mfo, c.bank_edrpou, c.phone, c.email],
  );
}
export async function deleteContractor(id: number): Promise<void> {
  await q("DELETE FROM contractors WHERE id=$1", [id]);
}

export interface ContractTemplate { id: number; title: string; lang: string; body: string }
export async function listTemplates(): Promise<ContractTemplate[]> {
  return q<ContractTemplate>("SELECT id, title, lang, body FROM contract_templates ORDER BY title");
}
export async function getTemplate(id: number): Promise<ContractTemplate | null> {
  const rows = await q<ContractTemplate>("SELECT id, title, lang, body FROM contract_templates WHERE id = $1", [id]);
  return rows[0] ?? null;
}
export async function createTemplate(title: string, lang: string, body: string): Promise<number> {
  const rows = await q<{ id: number }>("INSERT INTO contract_templates (title, lang, body) VALUES ($1,$2,$3) RETURNING id", [title, lang, body]);
  return rows[0].id;
}
export async function updateTemplate(id: number, title: string, lang: string, body: string): Promise<void> {
  await q("UPDATE contract_templates SET title=$2, lang=$3, body=$4, updated_at=now() WHERE id=$1", [id, title, lang, body]);
}
export async function deleteTemplate(id: number): Promise<void> {
  await q("DELETE FROM contract_templates WHERE id=$1", [id]);
}

export interface Contract {
  id: number;
  number: string | null;
  contract_date: string | null;
  city: string | null;
  title: string | null;
  template_id: number | null;
  contractor_id: number | null;
  client_requisites: string | null;
  vars: Record<string, string>;
  body: string | null;
  created_at: string;
}
export interface ContractInput {
  number: string | null;
  contract_date: string | null;
  city: string | null;
  title: string | null;
  template_id: number | null;
  contractor_id: number | null;
  client_requisites: string | null;
  vars: Record<string, string>;
  body: string;
}
export async function listContracts(): Promise<Contract[]> {
  return q<Contract>(
    `SELECT id, number, to_char(contract_date,'YYYY-MM-DD') AS contract_date, city, title, template_id, contractor_id, client_requisites, vars, body, created_at
     FROM contracts ORDER BY created_at DESC`,
  );
}
export async function getContract(id: number): Promise<Contract | null> {
  const rows = await q<Contract>(
    `SELECT id, number, to_char(contract_date,'YYYY-MM-DD') AS contract_date, city, title, template_id, contractor_id, client_requisites, vars, body, created_at
     FROM contracts WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}
export async function createContract(c: ContractInput): Promise<number> {
  const rows = await q<{ id: number }>(
    `INSERT INTO contracts (number, contract_date, city, title, template_id, contractor_id, client_requisites, vars, body)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) RETURNING id`,
    [c.number, c.contract_date, c.city, c.title, c.template_id, c.contractor_id, c.client_requisites, JSON.stringify(c.vars), c.body],
  );
  return rows[0].id;
}
export async function deleteContract(id: number): Promise<void> {
  await q("DELETE FROM contracts WHERE id=$1", [id]);
}
