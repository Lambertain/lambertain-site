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
- Прод-БД доступна снаружи через публичный TCP-proxy `centerbeam.proxy.rlwy.net:33919` → 5432. Строка — в `.env.local` как `DATABASE_PUBLIC_URL` (взять/обновить можно по Railway GraphQL: `variables` Postgres-сервиса → `RAILWAY_TCP_PROXY_DOMAIN/PORT`, `POSTGRES_USER/PASSWORD/DB`). Миграции на деплое — через preDeployCommand (`scripts/migrate.mjs`).
- **Прямой доступ к прод-БД — только для схемы/разовых read-миграций.** Контент (задачи, комменты, clientAction, гайды и т.п.) менять **через API портала**; если нужного эндпоинта нет — создать его (и добавить в каталог API ниже), а не править данные сырым SQL.
- Домены: `lambertain-site-production.up.railway.app`, `www.lambertain.site`.

## Telegram-бот
- @LambDev_bot. Токен — в `.env.local` (`TELEGRAM_BOT_TOKEN`). Админ chat_id — `TELEGRAM_CHAT_ID` (в .env.local).
- Menu button → `https://lambertain-site-production.up.railway.app/tma`.

## Доступы
Все секреты — в `.env.local` (в git не попадает): `RAILWAY_TOKEN`, `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `DATABASE_URL` (локальная дев-БD `localhost:5434`), `DATABASE_PUBLIC_URL` (прод-БД портала через TCP-proxy), `GITHUB_TOKEN`, `ADMIN_API_TOKEN`. Прод-значения — в env Railway. Полный список — в PM_PORTAL.md.

## Создание задач по API (для Claude/скриптов — без доступа к БД)
`POST /api/admin/create-task`, заголовок `Authorization: Bearer $ADMIN_API_TOKEN` (значение — в `.env.local`).
Тело: `{ "projectKey": "HH", "title": "...", "description": "...", "assigneeLogin"?: "...", "internal"?: false, "recipient"?: "client" }`.
`recipient:"client"` — **вопрос/задача клиенту** (не назначается разработчику, клиент видит и получает пуш, отвечает комментами). Для уточняющих вопросов клиенту по спеке — использовать именно его.
`internal:true` — задача разработчику **мимо клиента**: клиент её не видит, а разработчик получает (dev API пускает internal-задачи с `created_by_role=admin/super`). В портале то же делает чекбокс «Внутрішня — клієнт не бачить» при создании задачи (для админов).
Задача **сразу назначается разработчику проекта** (`assigneeLogin` или `meta.defaultAssignee`) и ему уходит пуш в Telegram. **ИИ-триажа нет** — разбор делает Claude разработчика: он читает задачу, смотрит код и задаёт клиенту уточнения в комментах только если что-то непонятно. Возвращает `{ id, url }`. НЕ ходить в БД напрямую для создания задач.

**Управление задачей по API** (те же `ADMIN_API_TOKEN`, без БД):
- `POST /api/admin/task-edit` `{ readableId, title?, description?, priority?, assigneeLogin? }` → правит переданные поля задачи (`priority`: `""`|`Critical`|`Major`|`Normal`|`Minor`; `assigneeLogin:null` снимает исполнителя). Меняются только присланные поля.
- `POST /api/admin/task-status` `{ readableId, status, summary? }` → смена статуса (+синк Trello-карточки).
- `POST /api/admin/task-deps` `{ readableId, dependsOn: ["1A-1", ...] }` → **полностью заменяет** набор блокеров (только из того же проекта).
- `POST /api/admin/comment` `{ readableId, body, visibleToClient?, review? }` → коммент от агентства (зеркалится в Trello при `visibleToClient`).
- `POST /api/admin/set-client-action` `{ readableId, action, guideId?, field? }` → задать/переписать инструкцию ожидания клиента (текст-баннер под задачей + гайд + поле каталога). Уведомлений НЕ шлёт — пуш/коммент клиенту слать отдельно `comment`ом. Снять ожидание — `clear-action`.
- `POST /api/admin/guide-regenerate` `{ guideId, topic? }` → перегенерировать гайд-инструкцию; с `topic` — под ДРУГОЙ сервис (напр. SendGrid → Resend), тело/заголовок = `topic`.
- `POST /api/admin/cleanup-mirror-noise` `{ dryRun? }` → разовая чистка шума зеркалирования код-ревью (дубли 🔎/💬 → одна копия; авто-комменты ошибок → удалить). `dryRun:true` — только счётчики. Идемпотентно.
- `POST /api/admin/classify-verifiable` `{ projectKey?, dryRun?, reclassify?, moveReviewToDone? }` → бэкфилл `client_verifiable` по задачам (без `projectKey` — все проекты) + перевод неверифицируемых клиентских задач из Review в Done. Новые задачи классифицируются на kickoff. `client_verifiable=false` (внутренняя/техническая) → на готовности сразу Done минуя клиентское ревью; `true`/NULL → ревью клиенту с кнопками.
- `POST /api/admin/member-role` `{ login, role }` (`client|employee|contributor|admin`) → сменить роль участника (members + tg_links). То же есть в UI «Команда». Инвайт роль уже привязанного НЕ меняет (защита от случайного перетирания).

**Заведение/привязка проекта по API** (тоже `ADMIN_API_TOKEN`, не БД):
- `POST /api/admin/project/link` `{ projectKey, name?, devGit?, clientGit?, defaultAssignee? }` → проставляет meta, возвращает **токен проекта**, раскладывает bootstrap CLAUDE.md в `Lambertain/*` дев-репо (layProtocol). Если проекта ещё нет — **создаёт его** (нужен `name`); ручной шаг «завести проект в UI» не требуется.
- `POST /api/admin/project/spec` `{ projectKey, spec }` / `GET ?projectKey=` → записать/прочитать `meta.spec` (спеку пишет Claude Code).
НЕ ходить в БД напрямую для этих операций.
