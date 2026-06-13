@AGENTS.md

# Lambertain.site — портфолио + PM-портал

> Полная архитектура портала — в `PM_PORTAL.md`. Секреты — в `.env.local` (в git не попадает); тут только имена переменных и несекретные ID.

## Git
- Коммиты — на русском.
- Remote: `origin` → github.com/Lambertain/lambertain-site — основной репо (наш). Клиентского репо нет.

## Стек
- Next.js 16 + React 19 + Tailwind 4 + TypeScript. Хостинг: Railway.
- `/` — публичное портфолио; `/admin` — PM-портал (см. PM_PORTAL.md); `/tma` — Telegram Mini App.

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
Все секреты — в `.env.local` (в git не попадает): `RAILWAY_TOKEN`, `YOUTRACK_TOKEN`, `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `DATABASE_URL`, `GITHUB_TOKEN`. Прод-значения — в env Railway. Полный список — в PM_PORTAL.md.

<!-- LAMBERTAIN-PROTOCOL:START -->
## Протокол задач Lambertain (для Claude Code)

Проект ведётся в PM-портале Lambertain. Портал делает только лёгкий триаж (требование + теги) — спеку и
реализацию делаешь ТЫ здесь, с полным доступом к репозиторию. Работай по протоколу, не дожидаясь настройки.

1. **Возьми задачу.**
   - список: `curl -s -H "Authorization: Bearer pk_35d969226edef4aa8c8951294f8ea7743aa3e42f" "https://lambertain-site-production.up.railway.app/api/dev/tasks"`
   - конкретная (требование + теги + тред): `.../api/dev/tasks?id=DEV-<N>` → поле `tags` = `{type, complexity, skills:[slug...]}`.
2. **Подключи скилы по тегам.** Плейбуки под задачу: `curl -s -H "Authorization: Bearer pk_35d969226edef4aa8c8951294f8ea7743aa3e42f" "https://lambertain-site-production.up.railway.app/api/dev/skills?tags=<tags.skills через запятую>"` → следуй им.
   **Статусы ставишь ТЫ (Claude), а не разработчик** — автоматически по ходу работы (тело — через UTF-8 файл, как в п.5):
   - взял в работу → `POST https://lambertain-site-production.up.railway.app/api/dev/status` `{"taskId":"DEV-<N>","status":"in_progress"}`;
   - закончил → `{"taskId":"DEV-<N>","status":"review","summary":"<что сделано ПРОСТЫМИ словами на языке задачи, без тех-терминов — для клиента>"}` (портал опубликует итог клиенту). Дальше задачу примет/вернёт постановщик.
   - Статусы Blocked (эскалация), Done/Доработка (постановщик) ставятся автоматически — их НЕ трогай.
3. **Действуй по сложности (`tags.complexity`):**
   - `small` (баг/правка/мелочь) — реализуй СРАЗУ по скилам и конвенциям этого репо, без церемоний.
   - `feature` (крупное/многофайловое/неоднозначное) — применяй spec-driven подход (github/spec-kit): сначала **spec** (что и критерии приёмки) → **plan** (архитектура, затронутые файлы, риски) → **tasks** (шаги по порядку) → **implement**. Короткий план запушь в задачу внутренним комментом (п.5, `"kind":"admin"`), чтобы Никита видел, и продолжай.
   Конвенции проекта — твоя «конституция» (CLAUDE.md/AGENTS.md репо); читай их один раз в начале.
4. **Технические развилки решай САМ** разумным дефолтом по конвенциям — НЕ заставляй разработчика выбирать вариант.
5. **Нужно уточнение — эскалируй САМ (НЕ спрашивай человека-разработчика).** Любой вопрос по задаче решается через портал:
   - `"kind":"client"` (по умолчанию) — вопрос конечному КЛИЕНТУ (портал оформит от лица агентства, задача → Blocked);
   - `"kind":"admin"` — вопрос/решение ПОСТАНОВЩИКУ задачи (кто её создал — может быть Никита или админ-коллега; уйдёт именно ему).
   ВАЖНО ПРО КОДИРОВКУ: тело с кириллицей передавай ТОЛЬКО через файл в UTF-8 — инлайн `-d '...'` ломает кодировку в консоли Windows.
   - запиши тело в файл `esc.json` (UTF-8): `{"taskId":"DEV-<N>","question":"<вопрос>","kind":"client|admin"}`
   - отправь: `curl -s -X POST -H "Authorization: Bearer pk_35d969226edef4aa8c8951294f8ea7743aa3e42f" -H "Content-Type: application/json; charset=utf-8" --data-binary @esc.json "https://lambertain-site-production.up.railway.app/api/dev/escalate"`
6. **Перед продолжением перечитывай задачу** (`?id=`): `awaitingClient: true` — ещё ждём ответа; `lastClientAnswer` — ответ клиента. Продолжай по нему.

Токен проекта — ниже; в публичный код не коммитить.
Project: `DEV` · Token: `pk_35d969226edef4aa8c8951294f8ea7743aa3e42f`
<!-- LAMBERTAIN-PROTOCOL:END -->
