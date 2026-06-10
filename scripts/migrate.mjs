/**
 * Миграция БД портала: схема + сид ролей. Идемпотентно.
 * Запускается как preDeployCommand на Railway (есть доступ к внутреннему Postgres),
 * либо вручную: node --env-file=.env.local scripts/migrate.mjs
 */
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("sslmode=require") ? { rejectUnauthorized: false } : false,
  max: 2,
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tg_links (
  tg_id BIGINT PRIMARY KEY, youtrack_login TEXT NOT NULL, role TEXT NOT NULL,
  full_name TEXT, linked_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS invites (
  token TEXT PRIMARY KEY, youtrack_login TEXT NOT NULL, role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ, used_by_tg_id BIGINT);
CREATE TABLE IF NOT EXISTS poller_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS role_overrides (login TEXT PRIMARY KEY, role TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS access_requests (
  tg_id BIGINT PRIMARY KEY, username TEXT, full_name TEXT,
  requested_role TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS web_login_tokens (
  token TEXT PRIMARY KEY, tg_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ);
`;

// Авторитетная раскладка ролей (от Никиты). ON CONFLICT DO NOTHING — ручные правки не затираются.
const ROLES = [
  ["curupa8888", "contributor"],
  ["oksanabagrova19", "contributor"],
  ["mr.bezpaliva", "contributor"],
  ["Shulga.7319", "client"],
  ["shuladvocate", "client"],
  ["olexandrasadi", "client"],
  ["korolnik2001", "client"],
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL не задан");
    process.exit(1);
  }
  await pool.query(SCHEMA);
  for (const [login, role] of ROLES) {
    await pool.query(
      "INSERT INTO role_overrides (login, role) VALUES ($1,$2) ON CONFLICT (login) DO NOTHING",
      [login, role],
    );
  }
  const c = await pool.query("SELECT count(*)::int AS n FROM role_overrides");
  console.log(`Миграция ок. role_overrides: ${c.rows[0].n} записей.`);
  await pool.end();
}

main().catch((e) => {
  console.error("Ошибка миграции:", e.message);
  process.exit(1);
});
