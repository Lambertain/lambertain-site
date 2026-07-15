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
CREATE TABLE IF NOT EXISTS notifications_log (
  id SERIAL PRIMARY KEY, chat_id TEXT NOT NULL, task_id TEXT, text TEXT NOT NULL,
  ok BOOLEAN NOT NULL, error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_notiflog_chat ON notifications_log (chat_id, created_at DESC);
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
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ, source TEXT DEFAULT 'portal');
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
ALTER TABLE tg_links ADD COLUMN IF NOT EXISTS lang TEXT;
ALTER TABLE invites ADD COLUMN IF NOT EXISTS project_key TEXT;
ALTER TABLE invites ADD COLUMN IF NOT EXISTS project_keys TEXT;
ALTER TABLE invites ADD COLUMN IF NOT EXISTS instruction_set_token TEXT;
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
-- Верифицируема ли задача КЛИЕНТОМ (может проверить глазами/руками — открыть экран, кликнуть, увидеть результат):
-- true → на ревью клиенту с кнопками «Готово/На доработку»; false → внутренняя/техническая (миграция, схема,
-- бэкап, деплой-настройка, серверная интеграция без UI) → на готовности идёт сразу в Done, минуя клиентское
-- ревью (клиент всё равно не может это проверить); NULL → ещё не классифицировано (ведёт себя как true — на ревью).
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS client_verifiable BOOLEAN;
-- Действие владельца: задача требует ручного ops-шага только владельца (деплой/регистрация/токен) — передаётся
-- супер-админу «на доработку». Клиент видит «в работе» (status не меняется); это внутренний флаг.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS owner_action TEXT;
-- DEV-48: вопрос разработчика ПОСТАНОВЩИКУ (escalate admin). Задача НЕ уходит в Blocked (иначе постановщик
-- не заглянет в тот таб) — статус не меняется, остаётся на первом табе; это маркер-плашка + мини-секция
-- «Очікують вашої відповіді» вверху доски. Снимается ответом постановщика (коммент).
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reporter_action TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS client_action TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS client_action_guide INT;
-- Целевое поле каталога (project-fields) для client_action, формат "fieldKey.subKey" (напр. "aiKeys.anthropic"):
-- значение, введённое клиентом, ляжет в structured meta.customFields[fieldKey][subKey], а не в legacy-секрет.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS client_action_field TEXT;
-- Сколько суточных окон (от created_at) по задаче уже напомнили исполнителю — чтобы слать максимум 1 раз в 24 ч.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS remind_count INT NOT NULL DEFAULT 0;
-- Деплой-стадия задачи (независимо от Open/Review/Done): pr → dev → prod. pr_url — PR от разработчика.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS pr_url TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deploy_stage TEXT;
-- Курсор зеркалирования код-ревью из GitHub PR в задачу: created_at последнего зазеркаленного
-- ревью-коммента. NULL = ещё не инициализировано (первый проход ставит now(), историю не тянем).
-- (legacy, single-PR; для мультирепо курсор — per-PR в task_prs.review_synced_at ниже.)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS pr_review_synced_at TIMESTAMPTZ;
-- Мультирепо-задачи (gitflow + extraRepos: backend+app тощо) дают НЕСКОЛЬКО PR на одну задачу.
-- task_prs хранит ВСЕ PR задачи; деплой-стадия задачи двигается по ВСЕМ её PR (dev — когда все
-- смержены в develop; prod — когда все доехали до main). review_synced_at — курсор зеркала ревью per-PR.
-- tasks.pr_url остаётся как «первичный» PR (для совместимости/отображения).
CREATE TABLE IF NOT EXISTS task_prs (
  task_id          INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  pr_url           TEXT NOT NULL,
  review_synced_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, pr_url));
-- Бэкфилл: существующие одиночные PR (tasks.pr_url) переносим в task_prs, сохраняя курсор ревью.
INSERT INTO task_prs (task_id, pr_url, review_synced_at)
  SELECT id, pr_url, pr_review_synced_at FROM tasks WHERE pr_url IS NOT NULL
  ON CONFLICT (task_id, pr_url) DO NOTHING;
-- DEV-51: идемпотентное зеркалирование код-ревью. Каждый GitHub-элемент (review/inline-comment/issue-comment)
-- мирорим РОВНО ОДИН РАЗ, ключ — стабильный GitHub id (gh_type, gh_id), а не временной курсор (который давал
-- бесконечные дубли из-за расхождения формата времени). Маппинг переживает рестарты (состояние в БД).
-- comment_id — зеркальный коммент в задаче (для правки при редактировании оригинала на GitHub); sig — подпись
-- содержимого (updated_at#len) для детекта правок. review_synced_at в task_prs остаётся как окно fetch/базлайн.
CREATE TABLE IF NOT EXISTS mirrored_pr_items (
  id         SERIAL PRIMARY KEY,
  task_id    INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  pr_url     TEXT NOT NULL,
  gh_type    TEXT NOT NULL,                                   -- 'review' | 'inline' | 'issue'
  gh_id      BIGINT NOT NULL,                                 -- стабильный GitHub id элемента
  comment_id INT REFERENCES comments(id) ON DELETE SET NULL,  -- зеркальный коммент задачи (NULL — базлайн/история, не постился)
  sig        TEXT,                                            -- подпись содержимого (детект правок)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gh_type, gh_id));
CREATE INDEX IF NOT EXISTS idx_mirrored_pr_items_pr ON mirrored_pr_items(pr_url);
CREATE TABLE IF NOT EXISTS task_deps (
  task_id       INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_id INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_id));
-- DEV-32: журнал событий задачи (audit/activity timeline). Только для разработчиков (internal), клиент не видит.
-- Immutable: пишется автоматически в choke-точках (смена статуса/стадии, PR, модерация, эскалация, assignee, создание).
-- type — вид события; actor_login/role — кто (NULL/system = автоматика портала); trigger — причина авто-изменения;
-- from_val/to_val — было→стало; details — доп. данные (prUrl тощо). Отдаётся в UI-ленту и через dev-API.
CREATE TABLE IF NOT EXISTS task_events (
  id          SERIAL PRIMARY KEY,
  task_id     INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  actor_login TEXT,
  actor_role  TEXT,
  trigger     TEXT,
  from_val    TEXT,
  to_val      TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id, created_at);
CREATE TABLE IF NOT EXISTS attachments (
  id         SERIAL PRIMARY KEY,
  task_id    INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  mime       TEXT,
  data       BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, name));
-- Вложение может быть проектным (не привязано к задаче) — напр. файлы в «Інфо для розробника». Тогда task_id NULL, project_id задан.
ALTER TABLE attachments ALTER COLUMN task_id DROP NOT NULL;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS project_id INT REFERENCES projects(id) ON DELETE CASCADE;
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
-- Контакт лида = Telegram (определяется при авторизации в боте, не спрашиваем в форме).
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS tg_id BIGINT;
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS tg_username TEXT;
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS tg_name TEXT;
-- Гайды-инструкции (растущая библиотека): регистрация GitHub/хостинг/бот и т.п. Каждый гайд — markdown-страница.
CREATE TABLE IF NOT EXISTS guides (
  id         SERIAL PRIMARY KEY,
  slug       TEXT UNIQUE NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',               -- markdown (uk — основная локаль)
  ord        INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
-- Мультилокальность гайдов: title/body = uk; ru/en — опциональные переводы (fallback на uk).
ALTER TABLE guides ADD COLUMN IF NOT EXISTS title_ru TEXT;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS body_ru TEXT;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS title_en TEXT;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS body_en TEXT;
-- Какие гайды включены клиенту по проекту.
CREATE TABLE IF NOT EXISTS project_guides (
  project_key TEXT NOT NULL,
  guide_id    INT  NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  PRIMARY KEY (project_key, guide_id));
-- Картинки гайдов (скрины из буфера обмена): отдаются через /api/guide-files/<id>.
CREATE TABLE IF NOT EXISTS guide_images (
  id         SERIAL PRIMARY KEY,
  mime       TEXT,
  data       BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
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
-- dev_authored — коммент создан через dev-API (Claude разработчика). Маркер «свой коммент Клода»:
-- по нему Claude (dev-API) и разработчик (вебинтерфейс) могут править/удалять именно эти комменты,
-- не трогая комменты клиента/админа/супер-админа (у тех тоже author_id может быть NULL).
ALTER TABLE comments ADD COLUMN IF NOT EXISTS dev_authored BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS orig_assignee_login TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS orig_reporter_login TEXT;
-- Штамп исходного автора по существующим строкам (идемпотентно: только где ещё не проставлено).
UPDATE comments c SET orig_author_login=m.login, orig_author_role=m.role
  FROM members m WHERE c.author_id=m.id AND c.orig_author_login IS NULL;
UPDATE tasks t SET orig_assignee_login=m.login FROM members m WHERE t.assignee_id=m.id AND t.orig_assignee_login IS NULL;
UPDATE tasks t SET orig_reporter_login=m.login FROM members m WHERE t.reporter_id=m.id AND t.orig_reporter_login IS NULL;
-- Осиротевший ответственный: defaultAssignee указывает на удалённого участника → снять (проект уходит в «Без відповідального»).
UPDATE projects SET meta = meta - 'defaultAssignee'
  WHERE meta ? 'defaultAssignee' AND meta->>'defaultAssignee' NOT IN (SELECT login FROM members);
-- Настройки портала (JSON по ключу) и медиа онбординг-инструкции (публичные картинки шагов).
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS onboarding_media (
  id SERIAL PRIMARY KEY, mime TEXT, data BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
-- Договоры: ФОПы-исполнители (наши реквизиты), шаблоны с плейсхолдерами {{key}}, сгенерированные договоры.
CREATE TABLE IF NOT EXISTS contractors (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, address TEXT, ipn TEXT, iban TEXT,
  bank_name TEXT, bank_mfo TEXT, bank_edrpou TEXT, phone TEXT, email TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS email TEXT;
CREATE TABLE IF NOT EXISTS contract_templates (
  id SERIAL PRIMARY KEY, title TEXT NOT NULL, lang TEXT NOT NULL DEFAULT 'uk', body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS contracts (
  id SERIAL PRIMARY KEY, number TEXT, contract_date DATE, city TEXT, title TEXT,
  template_id INT REFERENCES contract_templates(id) ON DELETE SET NULL,
  contractor_id INT REFERENCES contractors(id) ON DELETE SET NULL,
  client_requisites TEXT, vars JSONB NOT NULL DEFAULT '{}', body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
-- Наборы инструкций: выбранные блоки-гайды → публичная ссылка (для отправки лидам/клиентам) или привязка к инвайту.
CREATE TABLE IF NOT EXISTS instruction_sets (
  id SERIAL PRIMARY KEY, token TEXT UNIQUE NOT NULL, title TEXT,
  guide_ids INTEGER[] NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS project_secrets (
  id SERIAL PRIMARY KEY, project_key TEXT NOT NULL, name TEXT NOT NULL, value TEXT, note TEXT, env TEXT,
  filled_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS project_secrets_uniq ON project_secrets (project_key, name, coalesce(env, ''));
-- Уведомления (колокольчик в хедере): все события портала по получателю, попроектно-позадачно, с пометкой прочтения.
CREATE TABLE IF NOT EXISTS notifications (
  id              SERIAL PRIMARY KEY,
  recipient_tg_id BIGINT NOT NULL,
  task_id         TEXT,                                   -- readable_id задачи (напр. SAD-12); NULL для общих событий
  project_key     TEXT,
  title           TEXT NOT NULL,                          -- текст последнего события
  link            TEXT,                                   -- куда вести по клику (URL задачи)
  count           INTEGER NOT NULL DEFAULT 1,             -- сколько событий схлопнуто в эту запись
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),     -- время последнего события
  read_at         TIMESTAMPTZ);
CREATE INDEX IF NOT EXISTS notifications_recipient_unread ON notifications (recipient_tg_id) WHERE read_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_unread_task ON notifications (recipient_tg_id, task_id) WHERE read_at IS NULL AND task_id IS NOT NULL;
-- Страховка от дублей номеров задач (основная защита — advisory-lock в createTask).
-- best-effort: если в проде уже есть дубль (project_id, num) — индекс не создастся, но миграция не упадёт.
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS tasks_project_num_uniq ON tasks(project_id, num);
EXCEPTION WHEN others THEN
  RAISE NOTICE 'tasks_project_num_uniq skipped: %', SQLERRM;
END $$;
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

// Типовой договор на услуги веб-разработки (укр) с плейсхолдерами {{key}}. Сидится один раз.
const CONTRACT_TEMPLATE_UK = `# ДОГОВІР № {{number}}
## про надання послуг з розробки веб-сайту

**м. {{city}}**, {{date}}

{{contractor.name}}, що діє на підставі виписки з Єдиного державного реєстру (далі — «Виконавець»), з однієї сторони, та {{client.name}} (далі — «Замовник»), з іншої сторони, а разом — «Сторони», уклали цей Договір про наступне:

## 1. ПРЕДМЕТ ДОГОВОРУ
1.1. Виконавець зобов'язується за завданням Замовника надати послуги з розробки, дизайну та програмування веб-сайту (далі — «Послуги»), а Замовник зобов'язується прийняти та оплатити їх на умовах цього Договору.
1.2. Склад та обсяг Послуг: {{subject}}
1.3. Результатом робіт є працездатний веб-сайт, розміщений за погодженою Сторонами адресою (доменом).

## 2. ВАРТІСТЬ ПОСЛУГ ТА ПОРЯДОК РОЗРАХУНКІВ
2.1. Загальна вартість Послуг за цим Договором становить {{price}} грн ({{price_words}}). Виконавець не є платником ПДВ.
2.2. Оплата здійснюється частинами згідно з графіком платежів:
{{payments}}
2.3. Перший платіж згідно з графіком є передоплатою. Підставою для здійснення кожного наступного платежу є настання відповідної умови (строку або етапу робіт), зазначеної у графіку.
2.4. Розрахунки здійснюються у безготівковій формі шляхом перерахування коштів на поточний рахунок Виконавця, зазначений у розділі 9 цього Договору. Днем оплати вважається день зарахування коштів на рахунок Виконавця.

## 3. СТРОКИ ВИКОНАННЯ
3.1. Строк надання Послуг: {{term}}.
3.2. Строк може бути продовжено за взаємною згодою Сторін у разі зміни обсягу робіт або несвоєчасного надання Замовником матеріалів, доступів чи інформації.

## 4. ПРАВА ТА ОБОВ'ЯЗКИ СТОРІН
4.1. Виконавець зобов'язується надати Послуги якісно та у погоджені строки.
4.2. Замовник зобов'язується своєчасно надавати Виконавцю всі необхідні матеріали, доступи та інформацію, а також прийняти й оплатити Послуги.
4.3. Замовник має право контролювати хід надання Послуг, не втручаючись у господарську діяльність Виконавця.

## 5. ПЕРЕДАЧА ПРАВ ІНТЕЛЕКТУАЛЬНОЇ ВЛАСНОСТІ
5.1. Майнові права інтелектуальної власності на створений за цим Договором веб-сайт переходять до Замовника після повної оплати вартості Послуг.
5.2. Виконавець гарантує, що результати робіт не порушують прав інтелектуальної власності третіх осіб.

## 6. ПРИЙМАННЯ ПОСЛУГ
6.1. Приймання наданих Послуг оформлюється Актом наданих послуг.
6.2. У разі наявності зауважень Замовник надає їх письмово протягом 5 (п'яти) робочих днів. За відсутності зауважень у цей строк Послуги вважаються прийнятими в повному обсязі.

## 7. ВІДПОВІДАЛЬНІСТЬ СТОРІН ТА ФОРС-МАЖОР
7.1. За невиконання або неналежне виконання зобов'язань Сторони несуть відповідальність згідно з чинним законодавством України.
7.2. Сторони звільняються від відповідальності за часткове або повне невиконання зобов'язань, якщо воно є наслідком дії обставин непереборної сили (форс-мажор).

## 8. СТРОК ДІЇ ТА ІНШІ УМОВИ
8.1. Договір набирає чинності з моменту підписання та діє до повного виконання Сторонами своїх зобов'язань.
8.2. Усі зміни та доповнення до Договору оформлюються письмово за взаємною згодою Сторін.
8.3. Спори вирішуються шляхом переговорів, а в разі недосягнення згоди — у судовому порядку згідно із законодавством України.
8.4. Договір складено у двох примірниках, що мають однакову юридичну силу, по одному для кожної зі Сторін.

## 9. РЕКВІЗИТИ ТА ПІДПИСИ СТОРІН

**ВИКОНАВЕЦЬ**
{{contractor.name}}
Адреса: {{contractor.address}}
ІПН/ЄДРПОУ: {{contractor.ipn}}
IBAN: {{contractor.iban}}
Банк: {{contractor.bank_name}}, МФО {{contractor.bank_mfo}}, ЄДРПОУ банку {{contractor.bank_edrpou}}
Тел.: {{contractor.phone}}

_______________________ / {{contractor.name}}

**ЗАМОВНИК**
{{client.requisites}}

_______________________ /`;

// Пример нашего ФОПа-исполнителя (реквизиты Никиты). Сидится, только если справочник пуст.
const SEED_CONTRACTOR = {
  name: "ФОП Герасимюк Наталія Борисівна",
  address: "29015, м. Хмельницький, проспект Миру, 78/2, кв. 1а",
  ipn: "2871021324",
  iban: "UA373220010000026008370097416",
  bank_name: 'АТ "УНІВЕРСАЛ БАНК"',
  bank_mfo: "322001",
  bank_edrpou: "21133352",
  phone: "0676019264",
};

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
  // Типовой договор веб-разработки — сидим один раз (по точному заголовку, чтобы не плодить дубли).
  await pool.query(
    `INSERT INTO contract_templates (title, lang, body)
     SELECT $1, 'uk', $2
     WHERE NOT EXISTS (SELECT 1 FROM contract_templates WHERE title = $1)`,
    ["Послуги веб-розробки (ФОП)", CONTRACT_TEMPLATE_UK],
  );
  // Обновляем нетронутый типовой шаблон до актуальной версии (график платежей вместо {{prepay}}).
  // Признак нетронутого сида — наличие старого плейсхолдера {{prepay}}; правленный вручную шаблон не трогаем.
  await pool.query(
    `UPDATE contract_templates SET body = $2, updated_at = now()
     WHERE title = $1 AND body LIKE '%{{prepay}}%'`,
    ["Послуги веб-розробки (ФОП)", CONTRACT_TEMPLATE_UK],
  );
  // ФОП-исполнитель по умолчанию — только если справочник ещё пуст (дальше правится через UI).
  await pool.query(
    `INSERT INTO contractors (name, address, ipn, iban, bank_name, bank_mfo, bank_edrpou, phone)
     SELECT $1,$2,$3,$4,$5,$6,$7,$8 WHERE NOT EXISTS (SELECT 1 FROM contractors)`,
    [SEED_CONTRACTOR.name, SEED_CONTRACTOR.address, SEED_CONTRACTOR.ipn, SEED_CONTRACTOR.iban,
     SEED_CONTRACTOR.bank_name, SEED_CONTRACTOR.bank_mfo, SEED_CONTRACTOR.bank_edrpou, SEED_CONTRACTOR.phone],
  );
  // (Убрано: авто-перенос meta.credentials/railwayToken → project_secrets. Выполнялся на каждом деплое и
  //  воскрешал удалённые секреты. Доступы теперь — поля реестра проекта, отдаются дев-Клоду через /api/dev/secrets.)
  const c = await pool.query("SELECT count(*)::int AS n FROM role_overrides");
  const s = await pool.query("SELECT count(*)::int AS n FROM skills");
  console.log(`Миграция ок. role_overrides: ${c.rows[0].n}, skills: ${s.rows[0].n}.`);
  await pool.end();
}

main().catch((e) => {
  console.error("Ошибка миграции:", e.message);
  process.exit(1);
});
