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
CREATE TABLE IF NOT EXISTS project_api_tokens (
  project_key TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY, key TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  archived BOOLEAN DEFAULT FALSE, meta JSONB, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS members (
  id SERIAL PRIMARY KEY, login TEXT UNIQUE NOT NULL, full_name TEXT, email TEXT,
  role TEXT NOT NULL DEFAULT 'unknown', tg_id BIGINT, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY, yt_id TEXT UNIQUE, project_id INT REFERENCES projects(id), num INT,
  readable_id TEXT, title TEXT NOT NULL, description TEXT, status TEXT DEFAULT 'open', priority TEXT,
  assignee_id INT REFERENCES members(id), reporter_id INT REFERENCES members(id), due_date DATE,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ, source TEXT DEFAULT 'youtrack');
CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY, yt_id TEXT UNIQUE, task_id INT REFERENCES tasks(id), author_id INT REFERENCES members(id),
  body TEXT NOT NULL, visibility TEXT NOT NULL DEFAULT 'client', approved BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS skills (
  slug TEXT PRIMARY KEY, title TEXT NOT NULL, triggers TEXT NOT NULL, playbook TEXT NOT NULL,
  auto_generated BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS token_usage (
  id SERIAL PRIMARY KEY, ts TIMESTAMPTZ NOT NULL DEFAULT now(), model TEXT, kind TEXT,
  input_tokens INT NOT NULL DEFAULT 0, output_tokens INT NOT NULL DEFAULT 0, cost_usd NUMERIC NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_token_usage_ts ON token_usage(ts);
CREATE TABLE IF NOT EXISTS task_reads (
  login TEXT NOT NULL, task_id TEXT NOT NULL, last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (login, task_id));
ALTER TABLE tg_links ADD COLUMN IF NOT EXISTS project_key TEXT;
ALTER TABLE invites ADD COLUMN IF NOT EXISTS project_key TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by_role TEXT;
`;

// Стартовые скилы (плейбуки под типы задач). ON CONFLICT DO NOTHING — авто/ручные не затираются.
const SEED_SKILLS = [
  ["frontend-ui", "Фронтенд / UI",
    "вёрстка, ui, интерфейс, компонент, страница, экран, адаптив, responsive, дизайн, кнопка, форма, стиль, css, верстка",
    "Постановка фронтенд-задачи:\n- Найди в репо существующие компоненты/токены дизайна — переиспользуй, не плоди дубли.\n- Адаптив: проверь поведение на мобиле (Telegram Mini App = узкий экран).\n- i18n: если в проекте локализация — все строки сразу во все локали, без хардкода.\n- Иконки — SVG, не эмодзи (эмодзи только в комментах кода).\n- Следуй дизайн-правилам из CLAUDE.md проекта.\n- В описании укажи: какие файлы/компоненты затронуты, что уже есть, чего не хватает, критерии готовности (что увидит пользователь)."],
  ["bug-fix", "Баги / правки",
    "баг, ошибка, не работает, падает, фикс, дефект, сломалось, починить, краш, exception, некорректно",
    "Постановка баг-задачи (systematic debugging):\n- Воспроизведение: точные шаги, что ожидается vs что происходит, на каких данных/устройстве.\n- Локализация: найди в репо подозрительные файлы (search_code), укажи их.\n- Корневая причина (гипотеза), а не симптом.\n- Объём правки и риск регрессии (что ещё может затронуть).\n- Критерий готовности: как проверить, что починено. Проси скрин/лог ошибки, если нет."],
  ["backend-integration", "Backend / интеграции",
    "api, бэкенд, backend, сервер, база, бд, database, sql, оплата, платёж, вебхук, webhook, интеграция, сервис, миграция, эндпоинт",
    "Постановка backend/интеграционной задачи:\n- Контракт: входы/выходы, формат данных, статусы ошибок.\n- Модель данных и миграции (если меняется схема).\n- Авторизация/секреты: где хранятся, какие env-переменные нужны.\n- Идемпотентность и обработка ошибок/ретраев (особенно вебхуки/платежи).\n- Внешние сервисы: лимиты, ключи, песочница vs прод.\n- В описании: затронутые эндпоинты/таблицы, что есть, чего не хватает, критерии готовности."],
  ["telegram-ai", "Telegram / AI-фичи",
    "telegram, телеграм, бот, bot, mini app, миниапп, ai, ии, llm, gpt, claude, нейросеть, чат-бот, ассистент, промпт",
    "Постановка Telegram/AI-задачи:\n- Telegram: бот или Mini App? Для Mini App — авторизация через initData; для бота — вебхук/поллинг, команды, меню-кнопка.\n- AI: какая модель, что на входе (текст/картинки), нужен ли tool use / доступ к данным, стриминг, оценка стоимости токенов.\n- Промпты: где хранятся, как тестировать качество.\n- В описании: сценарий пользователя, затронутые части, что есть, чего не хватает, критерии готовности."],
];

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
  for (const [slug, title, triggers, playbook] of SEED_SKILLS) {
    await pool.query(
      "INSERT INTO skills (slug, title, triggers, playbook, auto_generated) VALUES ($1,$2,$3,$4,false) ON CONFLICT (slug) DO NOTHING",
      [slug, title, triggers, playbook],
    );
  }
  const c = await pool.query("SELECT count(*)::int AS n FROM role_overrides");
  const s = await pool.query("SELECT count(*)::int AS n FROM skills");
  console.log(`Миграция ок. role_overrides: ${c.rows[0].n}, skills: ${s.rows[0].n}.`);
  await pool.end();
}

main().catch((e) => {
  console.error("Ошибка миграции:", e.message);
  process.exit(1);
});
