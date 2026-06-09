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
      // Railway Postgres требует SSL, локальный — нет.
      ssl: process.env.DATABASE_URL?.includes("localhost")
        ? undefined
        : { rejectUnauthorized: false },
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
