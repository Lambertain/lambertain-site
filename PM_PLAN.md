# План: табы по проектам/статусам, AI code-review, мульти-проекты разрабам, дашборд загрузки

> Рабочий план фичи от 2026-06-11. Источник требований — задача Никиты. Завтра выполняем по этому файлу.
> Текущая модель: задачи в Postgres (`TASKS_BACKEND=postgres`), статусы — свободный текст,
> dev↔проект через `meta.defaultAssignee` (один логин), `ProjectMeta` — jsonb (можно расширять без миграции схемы).

## Требования (как сформулировал Никита)

1. **Задачи разнести по табам: проект → внутри проекта табы статусов.**
   - Первый таб всегда «В работе» (то, что у разраба).
   - Разраб сделал → меняет статус на «Ревью» → задача уходит в таб «Ревью», **ИИ проводит код-ревью**:
     - всё ок → ИИ сам ставит «Готово»;
     - нужна доработка → ИИ пишет в комментарии что доделать и возвращает в «В работе».
   - Если в «В работе» пусто → показываются остальные **не начатые**; клик по задаче → статус «В работе».
2. **При приглашении разраба — добавлять ему другие проекты позже** (пригласил в 1 проект → потом добавляю ещё и ещё).
3. **На главной (админ) — дашборд: блок на каждого разраба:**
   - перечень проектов разраба;
   - общая стоимость проектов, которые он ведёт;
   - по каждому проекту: сколько дней ведётся, предположительно сколько до конца (**прогресс-бар**), стоимость, количество задач сделать/сделано.
   - Цель: оценивать загруженность, ценность, длительность.

---

## Принятые решения (флажки — если завтра не согласен, меняем)

- **[D1] dev↔проект = `meta.assignees: string[]`.** Перехожу с одиночного `defaultAssignee` на массив логинов
  разрабов проекта; `defaultAssignee` остаётся = `assignees[0]` (для автоназначения новых задач). Так проект
  может вести и несколько разрабов, а дашборд группирует по каждому. Миграция: при чтении проекта, если есть
  старый `defaultAssignee` и нет `assignees` — поднять в `assignees:[defaultAssignee]`.
- **[D2] Экономика проекта — поля в `ProjectMeta` (jsonb, без миграции схемы):**
  `cost?: number`, `currency?: string` (дефолт `"$"`), `startedAt?: string` (ISO-дата; дефолт — дата создания
  проекта/самой ранней задачи), `deadline?: string` (ISO-дата, плановый конец).
- **[D3] Прогресс-бар = время** (прошло дней / (deadline − startedAt)), отдельно числом — задачи сделано/всего.
  «Сколько до конца» = `deadline − сегодня` (дни). Если `deadline` не задан — бар скрыт, показываем только дни ведётся.
- **[D4] Статусы канонизируем в «корзины»** по ключевым словам (устойчиво к импортированным именам из YouTrack),
  helper в `statuses.ts`: `notStarted | inProgress | review | done | blocked`. Канонические значения, которые
  ставит портал: `Open`, `In Progress`, `Review`, `Done`, `Blocked` (переименовать `To Verify`→`Review`).
- **[D5] AI code-review запускает поллер** (cron `*/5`), не синхронно в server action (ревью долгое/дорогое).
  Идемпотентность — по маркеру `ai_reviewed_at` на задаче (ревьюим один раз за вход в «Ревью»; сбрасываем при
  возврате в «В работе»).
- **[D6] Что ревьюить (контекст кода):** при переводе в «Ревью» разраб может указать ссылку на коммит/PR/ветку
  (опциональное поле). ИИ читает этот diff через GitHub-доступ (`lib/github.ts`); если не указано — читает HEAD
  dev-репо проекта + файлы по ключевым словам задачи. Вердикт — в комментарий.

---

## Изменения по файлам

### 1. Модель данных / типы
- `src/lib/tasks/types.ts`
  - `ProjectMeta`: добавить `assignees?: string[]`, `cost?: number`, `currency?: string`, `startedAt?: string`,
    `deadline?: string`. `defaultAssignee` оставить (легаси/праймери).
- `scripts/migrate.mjs` (preDeploy)
  - `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ai_reviewed_at TIMESTAMPTZ;`
  - `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_ref TEXT;` (коммит/PR/ветка от разраба).
  - Бэкофилл `meta.assignees` из `defaultAssignee` одним UPDATE по jsonb (где assignees отсутствует).
- `src/lib/db.ts`
  - Хелперы: `setProjectMeta` уже есть. Добавить `listProjectsWithMeta()` (key,name,meta,archived) — для дашборда/scope.
  - `assignDevToProjects(login, keys[])` / `removeDevFromProject(login, key)` — правят `meta.assignees`.
  - `taskCountsByProject()` — `{ projectKey, total, done }[]` (done = статус в корзине done) для дашборда.
  - `setReviewRef(id, ref)`, `markAiReviewed(id)`, `clearAiReviewed(id)`.

### 2. Статусы
- `src/lib/statuses.ts`
  - `STATUSES = ["Open","In Progress","Review","Done","Blocked"]`.
  - `statusBucket(status): "notStarted"|"inProgress"|"review"|"done"|"blocked"` (по тем же regex, что и `statusColor`).
  - `bucketOrder` и подписи (i18n) для табов: В работе → Ревью → Готово → Не начатые → (Заблок.).

### 3. Страница задач — табы проект→статус
- `src/app/admin/(dash)/page.tsx` (главная) сейчас = TaskBoard. **Разделяем:**
  - Для **admin** главная становится **дашбордом разрабов** (см. §6). Задачи остаются на `/admin/tasks`.
  - Для **contributor/client/employee** главная = задачи с табами.
- Новый компонент `task-tabs.tsx` (client):
  - Верхний ряд табов — **проекты** (видимые по scope). Скрыт, если проект один.
  - Внутри — ряд табов **статусов** в порядке [В работе, Ревью, Готово, Не начатые, Заблок.], дефолт «В работе».
  - Если в «В работе» нет задач → активным открываем «Не начатые».
  - В табе «Не начатые» клик по задаче = `updateTaskStatus(id,"In Progress")` (не раскрытие). В остальных табах —
    как сейчас (раскрытие + смена статуса чипом). Переиспользуем `Row` из `task-board.tsx` (вынести/параметризовать
    «onTitleClick»: start | expand).
- `tasks-actions.ts`: добавить `setReviewRef`-экшен (если делаем поле ссылки при переводе в «Ревью»).

### 4. AI code-review (поллер)
- Новый `src/lib/review.ts`: `runReview(taskId)` —
  - грузит задачу (+проект, +`review_ref`), собирает контекст кода через `lib/github.ts`
    (diff коммита/PR/ветки или HEAD dev-репо + поиск по ключевым словам),
  - вызывает Anthropic (как в `intake.ts`: модель `claude-opus-4-8`, логировать `logUsage`),
    инструмент/структурный ответ `{ verdict: "approve"|"rework", comment: string }`,
  - approve → `updateStatus(id,"Done")` + комментарий «✅ Код-ревью пройдено»;
  - rework → `addComment(id, "🔧 На доработку:\n"+comment)` + `updateStatus(id,"In Progress")` + `clearAiReviewed`.
  - В обоих случаях `markAiReviewed(id)` (от повторов в том же входе).
- `scripts/poller.mjs`: новый шаг — выбрать задачи `statusBucket=review AND ai_reviewed_at IS NULL`, для каждой
  `runReview`. Флаг отключения `NOTIFY_/REVIEW_ENABLED`. Уведомление разрабу в TG о результате.
- Уведомления: разрабу — на approve/rework; клиенту — на «Готово» (уже есть NOTIFY_DONE).

### 5. Команда: мульти-проекты разрабу
- `src/app/admin/(dash)/team/` — новый блок «Разработчики»:
  - список разрабов (members role=contributor) с их проектами (чипы) и мульти-селектом «добавить проект».
  - Экшены `assignDevProjects(login, keys[])`, `unassignDevProject(login, key)` → правят `meta.assignees`,
    `revalidatePath`.
  - Инвайт-форму оставить как есть (стартовая привязка); докрутка проектов — через новый блок.

### 6. Дашборд разрабов (главная админа)
- `src/app/admin/(dash)/page.tsx` для admin → рендер `dev-dashboard.tsx`:
  - данные: `listProjectsWithMeta()` + `taskCountsByProject()` + `listUsers()`.
  - группировка по разрабу (`meta.assignees`), на каждого карточка-блок:
    - имя разраба; **общая стоимость** = Σ cost его проектов;
    - таблица/список проектов: название · стоимость · дней ведётся (`today−startedAt`) ·
      до конца (`deadline−today`) · **прогресс-бар по времени** · задачи `done/total`;
    - агрегат: число проектов, суммарно задач open.
  - Без проектов-сирот: проекты без `assignees` — отдельный блок «Не назначены».
- Карточка проекта в `meta-form.tsx`: добавить поля cost/currency/startedAt/deadline/assignees(мультиселект).

### 7. i18n (uk/ru/en) — сразу все локали, без хардкода
- Табы статусов: `tab.inProgress`, `tab.review`, `tab.done`, `tab.notStarted`, `tab.blocked`.
- Дашборд: `dash.devTitle`, `dash.totalCost`, `dash.daysRunning`, `dash.daysLeft`, `dash.progress`,
  `dash.tasksDoneTotal`, `dash.unassigned`, `dash.projectsCount`.
- Поля проекта: `field.cost`, `field.currency`, `field.startedAt`, `field.deadline`, `field.assignees`.
- Ревью: `review.passed`, `review.rework`, `review.refLabel` (ссылка на коммит/PR).
- Команда: `team.devs`, `team.addProject`.

---

## Порядок выполнения (завтра)

1. Миграция: `ALTER TABLE` (ai_reviewed_at, review_ref) + бэкофилл `meta.assignees`. Типы `ProjectMeta`.
2. `statuses.ts`: STATUSES + `statusBucket` + порядок/подписи. i18n табов.
3. `db.ts`-хелперы (assign/unassign, taskCounts, listProjectsWithMeta, review-маркеры).
4. `task-tabs.tsx` + рефактор `Row` → задачи с табами проект/статус, клик-старт в «Не начатые».
5. `scope.ts`: учитывать `assignees` (contributor видит проекты, где он в assignees).
6. `review.ts` + шаг поллера + уведомления.
7. Команда: блок разрабов с мульти-проектами. `meta-form.tsx`: cost/deadline/assignees.
8. Дашборд разрабов на главной админа.
9. i18n добить, `npm run build` → 0 ошибок, коммит/пуш, деплой (вручную через Railway API: webhook не триггерит),
   дождаться SUCCESS, проверить прод (логин по SESSION_SECRET-куке).
10. Обновить `PM_PORTAL.md` (новая модель статусов, дашборд, мульти-проекты).

## Открытые вопросы к Никите (не блокируют старт)
- **Стоимость проекта** — фиксированная сумма, которую я ввожу руками? (так заложено, [D2]). Валюта по умолчанию `$` или `₴`?
- **Прогресс-бар** — по времени (до deadline) или по задачам (done/total)? Заложил по времени ([D3]); легко переключить.
- **Несколько разрабов на проект** — нужно ли реально, или строго один ответственный? Заложил массив ([D1]).
- **AI-ревью кода** — ок ли, что без явного коммита ИИ ревьюит HEAD dev-репо? Лучше приучить разрабов давать
  ссылку на коммит/PR при переводе в «Ревью» ([D6]).
