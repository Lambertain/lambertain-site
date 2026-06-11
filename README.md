# lambertain.site

Публичное портфолио агентства **Lambertain** + встроенный **PM-портал** (веб + Telegram Mini App
из одного кода, доступ по ролям). Next.js 16 / React 19 / Tailwind 4 / TypeScript, хостинг Railway.

- `/` — публичное портфолио
- `/admin` — PM-портал (задачи, проекты, команда, дашборд загрузки, скилы интейка)
- `/tma` — точка входа Telegram Mini App

Полная архитектура портала, роли, переменные окружения и деплой — в **[PM_PORTAL.md](./PM_PORTAL.md)**.
Несекретные ID и правила работы — в **[CLAUDE.md](./CLAUDE.md)**. Секреты — в `.env.local` (в git не попадает).

## Локальный запуск

```bash
npm install
npm run dev                                       # http://localhost:3000
node --env-file=.env.local scripts/migrate.mjs    # миграция БД + сид
node --env-file=.env.local scripts/poller.mjs     # поллер (DRY_RUN=1 POLL_ONCE=1 для теста)
```

Postgres локально: `localhost:5434`. Активный бэкенд задач — собственная БД (`TASKS_BACKEND=postgres`).
