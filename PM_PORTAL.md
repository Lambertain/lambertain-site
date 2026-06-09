# PM-портал Lambertain

Встроенная в сайт админка/портал управления задачами поверх YouTrack, с веб-версией
и Telegram Mini App из одного кода. Доступ по ролям.

## Роли

| Роль | Доступ |
|------|--------|
| **admin** (Никита) | Полный PM: новая задача, все задачи, клиенты, просрочки, команда (инвайты) |
| **contributor** | Свои назначенные задачи |
| **client** | Свои проекты/заявки, создать задачу/вопрос |

Роль в портале берётся из связки `tg_links` (создаётся инвайтом) либо web-пароль = admin.
Роль в YouTrack (для поллера и экрана «Клиенты») — из проектных ролей «Клиент»/«Контрибьютор».

## Архитектура

```
lambertain.site (Next.js 16, Railway)
├── /                       публичное портфолио
├── /admin/login            вход админа по паролю
├── /admin (route group dash)
│   ├── /admin              новая задача (текст → Claude → превью → YouTrack)
│   ├── /admin/tasks        задачи (ролевой фильтр)
│   ├── /admin/clients      задачи от клиентов + черновики ответов (admin)
│   ├── /admin/overdue      зависшие задачи (admin)
│   └── /admin/team         генерация инвайт-ссылок (admin)
├── /tma                    точка входа Telegram Mini App (валидация initData)
├── /api/tma/auth           авторизация Mini App
│
├── src/lib/tasks/          СЛОЙ АБСТРАКЦИИ задач
│   ├── types.ts            контракт TasksBackend
│   ├── youtrack.ts         адаптер YouTrack (сегодня)
│   ├── meta.ts             парсер YAML-описаний проектов
│   └── index.ts            выбор бэкенда (TASKS_BACKEND)
├── src/lib/structurer.ts   Claude API: текст → структура задачи
├── src/lib/replies.ts      Claude API: черновик ответа клиенту
├── src/lib/auth.ts         сессия (web + telegram), HMAC-кука
├── src/lib/principal.ts    единая личность + резолв роли
├── src/lib/telegram-auth.ts валидация Telegram initData
├── src/lib/invites.ts      одноразовые инвайты
├── src/lib/db.ts           Postgres: связки, инвайты, состояние поллера
└── scripts/poller.mjs      воркер: события YouTrack → Telegram
```

Миграция с YouTrack: реализовать `src/lib/tasks/postgres.ts`, переключить `TASKS_BACKEND` —
UI и бот не меняются.

## Переменные окружения

```
YOUTRACK_URL, YOUTRACK_TOKEN        доступ к YouTrack
TASKS_BACKEND=youtrack
ANTHROPIC_API_KEY, STRUCTURER_MODEL  Claude API (модель: claude-sonnet-4-6)
TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID Telegram-бот и чат для уведомлений
TELEGRAM_BOT_USERNAME, TELEGRAM_MINIAPP_SHORTNAME  для invite-ссылок
ADMIN_PASSWORD                       вход в /admin (web)
ADMIN_TELEGRAM_ID                    Telegram id админа
SESSION_SECRET                       подпись сессионной куки
DATABASE_URL                         Postgres (локально 5434, на Railway — плагин)
# флаги поллера (любой = "0" отключает): NOTIFY_NEW_TASK, NOTIFY_CLIENT_COMMENT, NOTIFY_DONE
# POLL_INTERVAL_SEC=60, POLL_ONCE=1 (один цикл), DRY_RUN=1 (без отправки)
```

Локально секреты — в `.env.local` (в git не попадает).

## Локальный запуск

```
npm install
npm run dev                 # localhost:3000/admin
node --env-file=.env.local scripts/poller.mjs   # поллер (DRY_RUN=1 POLL_ONCE=1 для теста)
```

Postgres локально: `localhost:5434`, БД `lambertain_pm` (создаётся автоматически схемой).

## Деплой на Railway

1. Сервис **web** из репозитория: build `npm run build`, start `npm start`.
2. Плагин **Postgres** → `DATABASE_URL` в web-сервис.
3. Второй сервис **poller** из того же репозитория: start `npm run poller`, те же env + `DATABASE_URL`.
4. Прописать все env в обоих сервисах.
5. В **@BotFather**: `/newapp` для @LambDev_bot → URL мини-аппы `https://<домен>/tma`,
   затем заполнить `TELEGRAM_MINIAPP_SHORTNAME`.

## Известная настройка: роли в YouTrack

Поллер и экран «Клиенты» определяют клиента по роли **«Клиент»** в YouTrack.
Сейчас у пользователей роли не назначены — назначить в YouTrack
(Администрирование → проект → команда/роли), иначе клиентские триггеры не сработают.
Доступ в портал/Mini App от этого не зависит — там роль из инвайта.
```
