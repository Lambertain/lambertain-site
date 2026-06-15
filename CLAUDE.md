@AGENTS.md

# Lambertain.site — портфолио + PM-портал

> Полная архитектура портала — в `PM_PORTAL.md`. Секреты — в `.env.local` (в git не попадает); тут только имена переменных и несекретные ID.

## Git
- Коммиты — на русском.
- Remote: `origin` → github.com/Lambertain/lambertain-site — основной репо (наш). Клиентского репо нет.

## Стек
- Next.js 16 + React 19 + Tailwind 4 + TypeScript. Хостинг: Railway.
- `/` — публичное портфолио; `/admin` — PM-портал (см. PM_PORTAL.md); `/tma` — Telegram Mini App.

## Дизайн (анти-дженерик)
- Перед версткой нового UI/лендинга — НЕ выдумывать палитру «из головы» (это даёт одинаковый warm-cream/serif/terracotta на всех проектах). Сначала получить арт-дирекшен скилом `ui-ux-pro-max`:
  `python .claude/skills/ui-ux-pro-max/scripts/search.py "<продукт> <индустрия> <тон>" --design-system`
  → вернёт паттерн, стиль, палитру (hex-токены), пару шрифтов, эффекты и список AVOID (включая «AI purple/pink gradients»). Строить ровно по этим токенам.
- Доменные запросы: `--domain color|style|typography|landing|ux "<keywords>"`. Доп. скилы: `frontend-design` (вкус/различимость), `web-design-guidelines` (a11y/ревью), `customer-journey` (UX-флоу).
- Разные продукты → разные системы (fintech→amber/минимализм, kids→blue/clay, luxury→near-black/glass). Если две задачи дают одинаковую палитру — менять ключевые слова запроса.

## Railway
- Endpoint GraphQL: `https://backboard.railway.app/graphql/v2`, заголовок `Authorization: Bearer $RAILWAY_TOKEN` (токен — в `.env.local`).
- Нативный fetch в .mjs, `{ projects }` (не `{ me { projects } }`), variableUpsert через variables.
- IDs (не секретны):
  - Project: `18f5f4a9-0766-4370-bc10-3b8561d3ef67`
  - Environment (production): `2ccf4a50-6c1d-4463-86b1-89f7cf12138c`
  - Web service `lambertain-site`: `e085dd1f-af3f-4d1f-b2b5-88e75cd6f08c` (build `npm run build`, start `npm start`, preDeploy `node scripts/migrate.mjs`)
  - Poller service `poller`: `8d8d1b53-2036-4c92-9352-38e80aaec4ae` (start `npm run poller`, cron `*/5 * * * *`, POLL_ONCE=1)
  - Postgres service `64ddd9a1-62ed-4b60-90e8-a684b8810a05` (image postgres:16, internal `postgres.railway.internal:5432`, db `railway`)
- Внешнего TCP-прокси к Postgres нет — миграции через preDeployCommand (`scripts/migrate.mjs`).
- Домены: `lambertain-site-production.up.railway.app`, `www.lambertain.site`.

## Telegram-бот
- @LambDev_bot. Токен — в `.env.local` (`TELEGRAM_BOT_TOKEN`). Админ chat_id — `TELEGRAM_CHAT_ID` (в .env.local).
- Menu button → `https://lambertain-site-production.up.railway.app/tma`.

## Доступы
Все секреты — в `.env.local` (в git не попадает): `RAILWAY_TOKEN`, `YOUTRACK_TOKEN`, `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `DATABASE_URL`, `GITHUB_TOKEN`, `ADMIN_API_TOKEN`. Прод-значения — в env Railway. Полный список — в PM_PORTAL.md.

## Создание задач по API (для Claude/скриптов — без доступа к БД)
`POST /api/admin/create-task`, заголовок `Authorization: Bearer $ADMIN_API_TOKEN` (значение — в `.env.local`).
Тело: `{ "projectKey": "HH", "title": "...", "description": "...", "assigneeLogin"?: "...", "internal"?: false, "triage"?: true }`.
`internal:true` — задача разработчику **мимо клиента**: клиент её не видит, а разработчик получает (dev API пускает internal-задачи с `created_by_role=admin/super`). В портале то же делает чекбокс «Внутрішня — клієнт не бачить» при создании задачи (для админов).
По умолчанию `triage:true` — задача проходит ИИ-триаж (заголовок/требование/теги), назначается исполнитель проекта (`meta.defaultAssignee`) и ему уходит уведомление в Telegram — как при создании в портале. `triage:false` — сразу назначить и уведомить без ИИ. Возвращает `{ id, url }`. НЕ ходить в БД напрямую для создания задач.

**Триаж отложен на ~5 минут** (`TRIAGE_DELAY_MIN`, по умолч. 5) — окно, чтобы автор успел отредактировать задачу/коммент до обработки и уведомления разработчика. Механика: при создании задача помечается `ai_status='pending'` (триаж сразу НЕ запускается); поллер (cron `*/5`) находит pending-задачи старше 5 мин и дёргает `POST /api/admin/run-triage {taskId}` (тот же `ADMIN_API_TOKEN`), который атомарно забирает задачу (`pending→triaging`) и запускает `draftTask`. Переменные поллера: `ADMIN_API_TOKEN`, `PORTAL_BASE`, `TRIAGE_DELAY_MIN`, флаг `TRIAGE` (=`0` отключает).
