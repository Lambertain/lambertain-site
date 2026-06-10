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
    `Постановка фронтенд/UI-задачи.

1. Контекст в коде (обязательно сверься):
   - Найди существующие компоненты/токены дизайна (list_dir, search_code) — переиспользуй, не плоди дубли.
   - Прочитай дизайн-правила из CLAUDE.md/конвенций проекта и следуй им.
2. Адаптив:
   - Проверь поведение на мобиле и в Telegram Mini App (узкий экран ~360px): нет горизонтального переполнения, элементы переносятся, шрифты резиновые.
   - box-sizing: border-box, ширины в %, без фиксированных пикселей шире вьюпорта.
3. Локализация (если в проекте есть i18n):
   - Все новые строки сразу во все локали, без хардкода.
4. Иконки — SVG, не эмодзи (эмодзи допустимы только в комментариях кода).
5. Доступность: контраст, фокус, кликабельные области ≥40px на тач.

В описании задачи укажи:
- какие компоненты/файлы затронуты и что в них уже есть;
- чего конкретно не хватает в коде для реализации;
- критерии готовности — что именно увидит пользователь (по шагам/состояниям).`],
  ["bug-fix", "Баги / правки",
    "баг, ошибка, не работает, падает, фикс, дефект, сломалось, починить, краш, exception, некорректно",
    `Постановка баг-задачи (методичный дебаг).

1. Воспроизведение:
   - Точные шаги; что ожидается vs что происходит; на каких данных/устройстве/роли; стабильно или плавающе.
   - Запроси скриншот/лог ошибки, если их нет.
2. Локализация в коде:
   - search_code по симптому/сообщению ошибки → укажи подозрительные файлы и строки.
   - Проверь связанные места (один баг часто живёт в нескольких файлах — DRY).
3. Корневая причина:
   - Сформулируй гипотезу о ПРИЧИНЕ, а не симптоме. Не предлагай «костыль», если виден корень.
4. Объём и риск:
   - Что ещё затронет правка; риск регрессии; нужен ли тест/проверка.

В описании: воспроизведение, затронутые файлы, корневая причина, что не хватает для фикса, критерий готовности (как проверить, что починено).`],
  ["backend-integration", "Backend / интеграции",
    "api, бэкенд, backend, сервер, база, бд, database, sql, оплата, платёж, вебхук, webhook, интеграция, сервис, миграция, эндпоинт",
    `Постановка backend/интеграционной задачи.

1. Контракт:
   - Входы/выходы, формат данных, коды и тела ошибок, идемпотентность.
2. Данные:
   - Модель/схема, нужна ли миграция; индексы; обратная совместимость.
3. Безопасность:
   - Авторизация, какие секреты/env-переменные нужны (хранить в .env, не в коде/репо).
   - Валидация входа (никогда не доверять клиенту).
4. Надёжность:
   - Обработка ошибок и ретраев, таймауты; для вебхуков/платежей — идемпотентность и подтверждение доставки.
5. Внешние сервисы:
   - Лимиты, ключи, песочница vs прод; что делать при недоступности.

В описании: затронутые эндпоинты/таблицы, что уже есть, чего не хватает, env-переменные, критерии готовности.`],
  ["telegram-bot", "Telegram-боты / Mini Apps",
    "telegram, телеграм, бот, bot, mini app, миниапп, webhook, initdata, botfather, меню, команда, вебхук",
    `Постановка задачи по Telegram-боту / Mini App.

1. Тип поверхности:
   - Бот (вебхук/поллинг, команды, inline-кнопки, меню-кнопка) или Mini App (веб в Telegram).
2. Mini App:
   - Авторизация через initData (валидация подписи токеном бота, с учётом поля signature).
   - Узкий экран, нет прокрутки всей апки, тёмная тема Telegram.
3. Бот:
   - Регистрация вебхука, обработка апдейтов, антидубли, состояние диалога.
   - Настройки в BotFather (меню-кнопка, Main Mini App URL, домен) — отдельным шагом.
4. Уведомления: кому и когда шлём DM; не спамить.

В описании: сценарий пользователя, поверхность (бот/Mini App), затронутые части, что есть, чего не хватает, критерии готовности.`],
  ["ai-llm", "AI / LLM-фичи",
    "ai, ии, llm, gpt, claude, нейросеть, ассистент, промпт, prompt, эмбеддинг, rag, tool use, токены, транскрипция, генерация",
    `Постановка задачи по AI/LLM-фиче.

1. Модель и провайдер:
   - Какая модель (по умолчанию — актуальный Claude); ключ в .env; оценка стоимости токенов.
2. Вход/выход:
   - Текст/изображения/документы на входе; нужен ли structured output (tool use) для надёжного формата.
   - Нужен ли доступ к данным/коду (инструменты/RAG) — что именно читать.
3. Промпты:
   - Где хранятся и версионируются; как тестировать качество (примеры, голден-кейсы).
4. UX:
   - Стриминг ответа, индикатор обработки, обработка ошибок/таймаутов, лимиты.

В описании: сценарий, модель, что на входе/выходе, нужны ли инструменты/данные, критерии готовности и как мерить качество.`],
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
  // Старый объединённый скил «Telegram + AI» разделён на telegram-bot и ai-llm.
  await pool.query("DELETE FROM skills WHERE slug = 'telegram-ai'");
  for (const [slug, title, triggers, playbook] of SEED_SKILLS) {
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
