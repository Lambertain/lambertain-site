/**
 * Миграция БД портала: схема + сид ролей. Идемпотентно.
 * Запускается как preDeployCommand на Railway (есть доступ к внутреннему Postgres),
 * либо вручную: node --env-file=.env.local scripts/migrate.mjs
 */
import pg from "pg";
import fs from "fs";

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
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_ref TEXT;
CREATE TABLE IF NOT EXISTS task_deps (
  task_id       INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_id INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_id));
`;

// Стартовые скилы — реальные полные плейбуки (SKILL.md) из открытых источников:
//   anthropics/skills, obra/superpowers, vercel-labs/agent-skills, supabase/agent-skills.
// Полные тексты — в scripts/skills/<file>; здесь slug, заголовок, файл и триггеры (RU+EN).
const SKILLS_DIR = new URL("./skills/", import.meta.url);
const SEED_SKILLS = [
  ["ui-ux-pro-max", "UI/UX Pro Max — дизайн-интеллект", "ui-ux-pro-max.md",
    "дизайн страницы, дизайн экрана, сделать красиво, профессионально, не как шаблон, выбрать стиль, дашборд, dashboard, лендинг, landing, SaaS, админка, дизайн-система, палитра, цвета, типографика, шрифты, glassmorphism, минимализм, бенто, дизайн UI, UX, redesign, улучшить интерфейс"],
  ["frontend-design", "Frontend-дизайн / UI (вкус)", "frontend-design.md",
    "UI, интерфейс, дизайн, вёрстка, верстка, страница, экран, лендинг, компонент, стиль, оформление, визуал, layout, design, типографика, эстетика"],
  ["web-design-guidelines", "Чек-лист веб-интерфейса (a11y/UX)", "web-design-guidelines.md",
    "ревью UI, проверка интерфейса, доступность, accessibility, a11y, UX аудит, юзабилити, форма, фокус, контраст, адаптив, review UI, audit"],
  ["react-best-practices", "React / Next.js best practices", "react-best-practices.md",
    "React, Next.js, next, компонент, ререндер, перерисовка, useEffect, useMemo, server component, серверный компонент, производительность, оптимизация, хук, bundle, hydration"],
  ["systematic-debugging", "Системный дебаггинг", "systematic-debugging.md",
    "баг, ошибка, не работает, падает, краш, дебаг, debug, фикс, починить, сломалось, exception, traceback, стектрейс, регрессия, дефект, bug, fix"],
  ["tdd", "TDD — разработка через тесты", "test-driven-development.md",
    "тест, тесты, TDD, тестирование, покрытие, unit, integration, jest, vitest, playwright, написать тест, red green refactor, test"],
  ["code-review", "Code review перед мержем", "requesting-code-review.md",
    "ревью кода, code review, проверить код, перед мержем, перед коммитом, перед PR, pull request, качество кода, рефакторинг, review"],
  ["verification", "Проверка перед сдачей (verification)", "verification-before-completion.md",
    "проверить готовность, перед коммитом, готово, выполнено, завершить, сдать, definition of done, проверка перед сдачей, verify, done"],
  ["writing-plans", "Планирование задачи / спека", "writing-plans.md",
    "план, спека, спецификация, ТЗ, разбить задачу, декомпозиция, этапы, шаги, roadmap, многошаговая, архитектура решения, plan, spec"],
  ["claude-api", "Claude API / LLM-интеграции", "claude-api.md",
    "Claude, Anthropic, Opus, Sonnet, Haiku, LLM, ИИ, AI, нейросеть, ассистент, промпт, prompt, агент, tool use, эмбеддинг, RAG, токены, стриминг, anthropic SDK, claude-*"],
  ["postgres", "Postgres best practices", "postgres-best-practices.md",
    "Postgres, PostgreSQL, SQL, запрос, индекс, схема БД, миграция, база данных, БД, query, index, performance, vacuum, explain analyze"],
  ["webapp-testing", "Тестирование веб-приложения (Playwright)", "webapp-testing.md",
    "тестирование UI, проверить в браузере, Playwright, e2e, скриншот браузера, проверить фронт, browser test, QA, smoke, консоль браузера"],
];

// Срезаем YAML-фронтматтер (--- ... ---) — в плейбук идёт только тело инструкций.
function stripFrontmatter(text) {
  if (!text.startsWith("---")) return text.trim();
  const end = text.indexOf("\n---", 3);
  if (end === -1) return text.trim();
  const nl = text.indexOf("\n", end + 1);
  return text.slice(nl + 1).trim();
}

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
  // Переходим на реальные полные скилы. Удаляем устаревшие ручные сиды
  // (старые короткие плейбуки и объединённый «telegram-ai»); авто-сгенерированные интейком не трогаем.
  const seedSlugs = SEED_SKILLS.map(([slug]) => slug);
  await pool.query(
    "DELETE FROM skills WHERE auto_generated = false AND slug <> ALL($1::text[])",
    [seedSlugs],
  );
  for (const [slug, title, file, triggers] of SEED_SKILLS) {
    const playbook = stripFrontmatter(fs.readFileSync(new URL(file, SKILLS_DIR), "utf8"));
    await pool.query(
      `INSERT INTO skills (slug, title, triggers, playbook, auto_generated) VALUES ($1,$2,$3,$4,false)
       ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, triggers=EXCLUDED.triggers, playbook=EXCLUDED.playbook
       WHERE skills.auto_generated = false`,
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
