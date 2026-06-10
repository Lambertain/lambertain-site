/**
 * Хранилище портала на Postgres: связки Telegram↔YouTrack, инвайты, состояние поллера.
 * Локально — localhost:5434, на Railway — DATABASE_URL из плагина Postgres.
 * Server-side only.
 */
import { Pool } from "pg";
import type { Role } from "./tasks/types";

declare global {
  // eslint-disable-next-line no-var
  var _pmPool: Pool | undefined;
  // eslint-disable-next-line no-var
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
ALTER TABLE tg_links ADD COLUMN IF NOT EXISTS project_key TEXT;
ALTER TABLE invites ADD COLUMN IF NOT EXISTS project_key TEXT;
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
}

export async function createInvite(
  token: string,
  youtrackLogin: string,
  role: Role,
  ttlHours: number,
  projectKey: string | null,
): Promise<void> {
  await q(
    `INSERT INTO invites (token, youtrack_login, role, expires_at, project_key)
     VALUES ($1, $2, $3, now() + ($4 || ' hours')::interval, $5)`,
    [token, youtrackLogin, role, String(ttlHours), projectKey],
  );
}

export async function getInvite(token: string): Promise<Invite | null> {
  const rows = await q<Invite>(
    "SELECT token, youtrack_login, role, expires_at, used_at, project_key FROM invites WHERE token = $1",
    [token],
  );
  return rows[0] ?? null;
}

export async function markInviteUsed(token: string, tgId: number): Promise<void> {
  await q("UPDATE invites SET used_at = now(), used_by_tg_id = $2 WHERE token = $1", [token, tgId]);
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
