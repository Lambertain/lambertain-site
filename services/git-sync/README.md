# git-sync (отдельный Railway-сервис)

Зеркалит клиентские репо → наши дев-репо (`client → dev`) для проектов со «спільна розробка».
Internal-only: вызывается **только** web-порталом по приватной сети, публичного домена не имеет.

## Зачем отдельный сервис
Нужен системный **git в рантайме**, которого не даёт билдер web-портала (Railpack). Плюс изоляция и
переиспользование под будущих клиентов. Образ с git гарантирует `Dockerfile`.

## Контракт
- `POST /sync` · `Authorization: Bearer $GIT_SYNC_SECRET` · body `{ pairs: [{ dev, client }] }`
  → `{ results: [{ devRepo, clientRepo, branches:[{branch,sha}], error? }] }`.
  Тянет дефолтную ветку клиента + `develop` (если есть) и пушит в дев-репо как `client-sync/<branch>`.
- `GET /health` → `{ ok: true }`.

## Заведение в Railway (руками, проект lambertain)
1. **New Service →から репозитория** `Lambertain/lambertain-site` (тот же репо, что web/poller).
2. **Settings → Build:** Builder = `Dockerfile`, Dockerfile Path = `services/git-sync/Dockerfile`,
   Root Directory = `services/git-sync` (чтобы Docker-контекст видел `server.mjs`).
   Watch Paths = `services/git-sync/**` (автодеплой только на изменения сервиса).
3. **Variables:**
   - `GITHUB_TOKEN` — тот же токен, что у web (доступ push к нашим и клиентским репо).
   - `GIT_SYNC_SECRET` — любой длинный секрет (общий с web).
   - `PORT` = `8080`.
4. **Networking:** только **Private Networking** (публичный домен НЕ нужен). Internal-хост получится
   `git-sync.railway.internal`.
5. На **web-сервисе** добавить переменные:
   - `GIT_SYNC_URL` = `http://git-sync.railway.internal:8080`
   - `GIT_SYNC_SECRET` = тот же секрет, что у сервиса.

После этого `POST /api/dev/sync` (web, по токену проекта) проксирует сюда и возвращает разработчику отчёт.
