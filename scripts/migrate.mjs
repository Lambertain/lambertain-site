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
CREATE TABLE IF NOT EXISTS project_reads (
  login TEXT NOT NULL, project_key TEXT NOT NULL, last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (login, project_key));
CREATE TABLE IF NOT EXISTS member_projects (
  login TEXT NOT NULL, project_key TEXT NOT NULL, PRIMARY KEY (login, project_key));
ALTER TABLE tg_links ADD COLUMN IF NOT EXISTS project_key TEXT;
ALTER TABLE invites ADD COLUMN IF NOT EXISTS project_key TEXT;
ALTER TABLE invites ADD COLUMN IF NOT EXISTS project_keys TEXT;
ALTER TABLE invites ADD COLUMN IF NOT EXISTS show_onboarding BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS alias TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by_role TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_ref TEXT;
-- Состояние ИИ-проработки задачи: pending (триаж) | waiting (ждёт ответа клиента) | done | NULL.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ai_status TEXT;
-- Теги триажа: { type, complexity: small|feature, skills: [slug,...] } — портал не читает репо,
-- Claude разработчика по тегам подключает скилы и применяет spec-kit адаптивно.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tags JSONB;
-- Внутренняя задача (разработчик → админ, напр. доступы): клиенту НЕ видна.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS internal BOOLEAN NOT NULL DEFAULT false;
-- Авто-готово: задачи по спеке от супер-админа на готовности идут сразу в Done (без ручной приёмки).
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS auto_done BOOLEAN NOT NULL DEFAULT false;
-- Действие владельца: задача требует ручного ops-шага только владельца (деплой/регистрация/токен) — передаётся
-- супер-админу «на доработку». Клиент видит «в работе» (status не меняется); это внутренний флаг.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS owner_action TEXT;
CREATE TABLE IF NOT EXISTS task_deps (
  task_id       INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_id INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_id));
CREATE TABLE IF NOT EXISTS attachments (
  id         SERIAL PRIMARY KEY,
  task_id    INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  mime       TEXT,
  data       BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, name));
-- Бриф лида (до клиента/проекта): открывается по публичной ссылке /brief/<token>, заполняется, привязывается к проекту позже.
CREATE TABLE IF NOT EXISTS briefs (
  id           SERIAL PRIMARY KEY,
  token        TEXT UNIQUE NOT NULL,
  label        TEXT,                                  -- метка лида (имя/контакт) для админа
  project_type TEXT,                                  -- визитка|landing|shop|saas|portfolio|other
  payload      JSONB,                                 -- ответы формы
  status       TEXT NOT NULL DEFAULT 'draft',         -- draft | submitted
  project_key  TEXT,                                  -- привязка к проекту (проставляется позже)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ);
-- Гайды-инструкции (растущая библиотека): регистрация GitHub/хостинг/бот и т.п. Каждый гайд — markdown-страница.
CREATE TABLE IF NOT EXISTS guides (
  id         SERIAL PRIMARY KEY,
  slug       TEXT UNIQUE NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',               -- markdown
  ord        INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
-- Какие гайды включены клиенту по проекту.
CREATE TABLE IF NOT EXISTS project_guides (
  project_key TEXT NOT NULL,
  guide_id    INT  NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  PRIMARY KEY (project_key, guide_id));
-- Стартовые гайды (идемпотентно).
INSERT INTO guides (slug, title, body, ord) VALUES
 ('github', 'Реєстрація GitHub', E'Потрібен акаунт GitHub, щоб зберігати код проєкту.\n\n1. Відкрийте https://github.com/signup\n2. Вкажіть e-mail, придумайте пароль і ім''я користувача.\n3. Підтвердіть e-mail (лист від GitHub).\n4. Надішліть мені ваш нік (username) — додам вас до репозиторію.', 10),
 ('railway', 'Реєстрація хостингу (Railway)', E'Хостинг — де працює сайт онлайн.\n\n1. Відкрийте https://railway.com\n2. Увійдіть через GitHub (кнопка «Login with GitHub»).\n3. Підтвердіть доступ.\n4. Напишіть мені — підключу проєкт і налаштую автодеплой.', 20),
 ('tg-bot', 'Реєстрація Telegram-бота', E'Якщо проєкту потрібен Telegram-бот.\n\n1. У Telegram відкрийте @BotFather.\n2. Команда /newbot → задайте ім''я та username бота (закінчується на *bot*).\n3. BotFather надішле **токен** — скопіюйте його.\n4. Надішліть токен мені (приватно) — підключу бота.', 30)
ON CONFLICT (slug) DO NOTHING;
CREATE INDEX IF NOT EXISTS idx_attachments_task ON attachments(task_id);
-- Сохранение исходного автора/исполнителя (логин+роль) для переноса истории при уходе с YouTrack:
-- член может быть удалён (ник YouTrack), а коммент/задачу потом привяжем к новому tg-пользователю.
ALTER TABLE comments ADD COLUMN IF NOT EXISTS orig_author_login TEXT;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS orig_author_role TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS orig_assignee_login TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS orig_reporter_login TEXT;
-- Штамп исходного автора по существующим строкам (идемпотентно: только где ещё не проставлено).
UPDATE comments c SET orig_author_login=m.login, orig_author_role=m.role
  FROM members m WHERE c.author_id=m.id AND c.orig_author_login IS NULL;
UPDATE tasks t SET orig_assignee_login=m.login FROM members m WHERE t.assignee_id=m.id AND t.orig_assignee_login IS NULL;
UPDATE tasks t SET orig_reporter_login=m.login FROM members m WHERE t.reporter_id=m.id AND t.orig_reporter_login IS NULL;
-- Настройки портала (JSON по ключу) и медиа онбординг-инструкции (публичные картинки шагов).
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS onboarding_media (
  id SERIAL PRIMARY KEY, mime TEXT, data BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
`;

// Подробная пошаговая инструкция онбординга клиента (украинский). Сидится один раз —
// дальнейшие правки админа (текст + скрины) не затираются (ON CONFLICT DO NOTHING).
const ONBOARDING = {
  steps: [
    {
      title: "Реєстрація на GitHub",
      body: "GitHub — це сервіс, де зберігається код вашого проєкту.\n\n1. Відкрийте [github.com](https://github.com) і натисніть **Sign up** (праворуч угорі).\n2. Введіть свою електронну пошту → придумайте надійний пароль → оберіть нікнейм (ім'я користувача).\n3. Підтвердіть пошту: GitHub надішле лист із кодом — введіть його.\n\nГотово — обліковий запис створено. Залишайтесь у ньому залогінені.",
    },
    {
      title: "Створіть приватний репозиторій",
      body: "Репозиторій — це «папка» вашого проєкту всередині GitHub.\n\n1. Натисніть **+** у правому верхньому куті → **New repository**.\n2. У полі **Repository name** вкажіть будь-яку назву (наприклад `my-project`).\n3. Нижче оберіть **Private** — приватний, щоб код бачили лише ви та я.\n4. Натисніть зелену кнопку **Create repository**.",
    },
    {
      title: "Додайте мене як колаборатора",
      body: "Щоб я міг працювати над проєктом, надайте мені доступ до репозиторія.\n\n1. У вашому репозиторії відкрийте вкладку **Settings** (угорі праворуч).\n2. У меню зліва оберіть **Collaborators** (GitHub може попросити пароль).\n3. Натисніть **Add people**, введіть нікнейм **Lambertain** і підтвердіть.\n\nЯ отримаю запрошення та прийму його — після цього доступ налаштовано. Нижче вставте посилання на ваш репозиторій (скопіюйте з адресного рядка).",
      collect: "clientGit",
    },
    {
      title: "Реєстрація на Railway (хостинг) — бонус у подарунок",
      body: "Railway — це хостинг, на якому працюватиме ваш сайт. За моїм посиланням ви отримаєте **другий місяць хостингу безкоштовно**.\n\n1. Перейдіть за посиланням: [railway.com](https://railway.com?referralCode=JgKp7P)\n2. Натисніть **Login** → **Login with GitHub**.\n3. Дозвольте Railway доступ до вашого GitHub (кнопка **Authorize**).",
    },
    {
      title: "Сплатіть тариф HOBBY ($5)",
      body: "Базовий тариф, якого достатньо для вашого проєкту.\n\n1. Відкрийте [railway.com/workspace/plans](https://railway.com/workspace/plans)\n2. Оберіть тариф **HOBBY** ($5 / місяць).\n3. Прив'яжіть картку та підтвердіть оплату.",
    },
    {
      title: "Створіть токен і вставте нижче",
      body: "Токен — це ключ, який дозволяє мені керувати деплоєм вашого проєкту.\n\n1. Відкрийте [railway.com/account/tokens](https://railway.com/account/tokens)\n2. Натисніть **Create Token**, дайте йому будь-яку назву.\n3. Скопіюйте токен і вставте його нижче (він збережеться автоматично).\n\n⚠️ Токен показується лише **один раз** — скопіюйте його одразу після створення.",
      collect: "railwayToken",
    },
  ],
};

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
  ["code-audit", "Аудит кода (баги, тех долг)", "code-audit.md",
    "аудит кода, ревизия, тех долг, дубли, мёртвый код, рефакторинг, качество кода, проверить код, найти проблемы, code audit, technical debt, smells"],
  ["security", "Безопасность (security review)", "security.md",
    "безопасность, уязвимость, дыра, OWASP, инъекция, XSS, CSRF, авторизация, аутентификация, доступы, IDOR, секреты, валидация, security, vulnerability, auth"],
  ["business-logic", "Бизнес-логика", "business-logic.md",
    "бизнес-логика, бизнес логика, правила, домен, корректность, состояния, статусы, edge-cases, деньги, оплата, расчёты, идемпотентность, инварианты, business logic"],
  ["customer-journey", "Путь клиента (UX-флоу)", "customer-journey.md",
    "путь клиента, путь пользователя, UX, сценарий, флоу, онбординг, конверсия, воронка, трение, пустое состояние, мобильный опыт, customer journey, user flow, funnel"],
  ["seo", "SEO-оптимизация", "seo.md",
    "SEO, сео, поисковая оптимизация, метатеги, title, description, sitemap, robots, schema, structured data, canonical, OpenGraph, индексация, ранжирование, search"],
  ["performance", "Скорость загрузки / производительность", "performance.md",
    "скорость, производительность, оптимизация загрузки, Core Web Vitals, LCP, CLS, INP, бандл, lazy, кэш, медленно, тормозит, performance, speed, optimize, lighthouse"],
  ["accessibility", "Доступность (a11y)", "accessibility.md",
    "доступность, a11y, accessibility, скринридер, клавиатура, фокус, ARIA, контраст, инклюзивность, WCAG"],
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
// Разработчики (curupa8888, oksanabagrova19, mr.bezpaliva) убраны: это никнеймы YouTrack,
// в дев-портал они заходят по Telegram (member создаётся инвайтом с tg-логином).
const ROLES = [
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
  await pool.query(
    "INSERT INTO settings (key, value) VALUES ('onboarding', $1) ON CONFLICT (key) DO NOTHING",
    [JSON.stringify(ONBOARDING)],
  );
  // Глобальный фидбек-проект Lamb.dev: виден всем, каждый видит только свои задачи (фидбек по порталу).
  // meta мержим (не затирая ручные правки), но гарантируем флаг feedback + devGit на наш репо.
  await pool.query(
    `INSERT INTO projects (key, name, meta) VALUES ('DEV', 'Lamb.dev', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET meta = projects.meta || $1::jsonb`,
    [JSON.stringify({ feedback: true, devGit: "https://github.com/Lambertain/lambertain-site.git" })],
  );
  const c = await pool.query("SELECT count(*)::int AS n FROM role_overrides");
  const s = await pool.query("SELECT count(*)::int AS n FROM skills");
  console.log(`Миграция ок. role_overrides: ${c.rows[0].n}, skills: ${s.rows[0].n}.`);
  await pool.end();
}

main().catch((e) => {
  console.error("Ошибка миграции:", e.message);
  process.exit(1);
});
