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
`;

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
}

export async function getLinkByTgId(tgId: number): Promise<TgLink | null> {
  const rows = await q<TgLink>(
    "SELECT tg_id, youtrack_login, role, full_name FROM tg_links WHERE tg_id = $1",
    [tgId],
  );
  return rows[0] ?? null;
}

export async function upsertLink(link: TgLink): Promise<void> {
  await q(
    `INSERT INTO tg_links (tg_id, youtrack_login, role, full_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tg_id) DO UPDATE
       SET youtrack_login = EXCLUDED.youtrack_login,
           role = EXCLUDED.role,
           full_name = EXCLUDED.full_name`,
    [link.tg_id, link.youtrack_login, link.role, link.full_name],
  );
}

// ---- Инвайты ----
export interface Invite {
  token: string;
  youtrack_login: string;
  role: Role;
  expires_at: string;
  used_at: string | null;
}

export async function createInvite(
  token: string,
  youtrackLogin: string,
  role: Role,
  ttlHours: number,
): Promise<void> {
  await q(
    `INSERT INTO invites (token, youtrack_login, role, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' hours')::interval)`,
    [token, youtrackLogin, role, String(ttlHours)],
  );
}

export async function getInvite(token: string): Promise<Invite | null> {
  const rows = await q<Invite>(
    "SELECT token, youtrack_login, role, expires_at, used_at FROM invites WHERE token = $1",
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
