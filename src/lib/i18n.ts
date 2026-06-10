/**
 * Локализация портала: uk / ru / en. Определяется по устройству пользователя.
 * Все строки — здесь, во всех трёх локалях, без хардкода в компонентах.
 * t(locale, key, params?) — подстановка {name}.
 */
export type Locale = "uk" | "ru" | "en";
export const LOCALES: Locale[] = ["uk", "ru", "en"];
export const DEFAULT_LOCALE: Locale = "uk";

type Entry = Record<Locale, string>;

export const DICT: Record<string, Entry> = {
  // — общее —
  "common.logout": { uk: "Вийти", ru: "Выйти", en: "Log out" },
  "common.inBrowser": { uk: "У браузері", ru: "В браузере", en: "In browser" },
  "common.loggingIn": { uk: "Вхід…", ru: "Вход…", en: "Signing in…" },
  "common.processing": { uk: "Обробка…", ru: "Обработка…", en: "Processing…" },
  "common.creating": { uk: "Створення…", ru: "Создание…", en: "Creating…" },
  "common.generating": { uk: "Генерація…", ru: "Генерация…", en: "Generating…" },
  "common.publishing": { uk: "Публікація…", ru: "Публикация…", en: "Publishing…" },
  "common.sending": { uk: "Надсилаю…", ru: "Отправляю…", en: "Sending…" },
  "common.copy": { uk: "Копіювати", ru: "Копировать", en: "Copy" },
  "common.copied": { uk: "Скопійовано", ru: "Скопировано", en: "Copied" },
  "common.choose": { uk: "— обрати —", ru: "— выбрать —", en: "— select —" },
  "common.cancel": { uk: "Скасувати", ru: "Отмена", en: "Cancel" },
  "common.delete": { uk: "Видалити", ru: "Удалить", en: "Delete" },
  "task.deleteConfirm": { uk: "Видалити задачу? Дію не скасувати.", ru: "Удалить задачу? Действие необратимо.", en: "Delete the task? This cannot be undone." },
  "projects.archive": { uk: "В архів", ru: "В архив", en: "Archive" },
  "projects.restore": { uk: "З архіву", ru: "Из архива", en: "Restore" },
  "projects.archived": { uk: "Архів", ru: "Архив", en: "Archived" },

  // — роли —
  "role.admin": { uk: "адмін", ru: "админ", en: "admin" },
  "role.contributor": { uk: "Розробник", ru: "Разработчик", en: "Developer" },
  "role.client": { uk: "Клієнт", ru: "Клиент", en: "Client" },
  "role.employee": { uk: "Співробітник", ru: "Сотрудник", en: "Employee" },

  // — навигация —
  "nav.newTask": { uk: "Нова задача", ru: "Новая задача", en: "New task" },
  "nav.tasks": { uk: "Задачі", ru: "Задачи", en: "Tasks" },
  "nav.clients": { uk: "Клієнти", ru: "Клиенты", en: "Clients" },
  "nav.overdue": { uk: "Прострочення", ru: "Просрочки", en: "Overdue" },
  "nav.team": { uk: "Команда", ru: "Команда", en: "Team" },
  "nav.projects": { uk: "Проєкти", ru: "Проекты", en: "Projects" },
  "nav.skills": { uk: "Скіли", ru: "Скилы", en: "Skills" },
  "skills.kicker": { uk: "Плейбуки інтейку", ru: "Плейбуки интейка", en: "Intake playbooks" },
  "skills.title": { uk: "Скіли", ru: "Скилы", en: "Skills" },
  "skills.hint": { uk: "Інтейк підбирає скіл під тип задачі, а якщо нема — створює новий (позначено «авто»).", ru: "Интейк подбирает скил под тип задачи, а если нет — создаёт новый (помечено «авто»).", en: "Intake picks a skill per task type, and creates a new one if missing (marked “auto”)." },
  "skills.auto": { uk: "авто", ru: "авто", en: "auto" },
  "skills.usageToday": { uk: "Токени сьогодні", ru: "Токены сегодня", en: "Tokens today" },
  "skills.usageMonth": { uk: "Витрати за місяць", ru: "Расход за месяц", en: "Spend this month" },
  "skills.expand": { uk: "Розгорнути", ru: "Развернуть", en: "Expand" },
  "skills.collapse": { uk: "Згорнути", ru: "Свернуть", en: "Collapse" },
  "viewas.label": { uk: "Перегляд як", ru: "Просмотр как", en: "View as" },
  "viewas.admin": { uk: "Адмін", ru: "Админ", en: "Admin" },
  "viewas.banner": { uk: "Превʼю ролі: {role}. ", ru: "Превью роли: {role}. ", en: "Role preview: {role}. " },
  "viewas.exit": { uk: "вийти з превʼю", ru: "выйти из превью", en: "exit preview" },
  "nav.myTasks": { uk: "Мої задачі", ru: "Мои задачи", en: "My tasks" },
  "nav.myProjects": { uk: "Мої проєкти", ru: "Мои проекты", en: "My projects" },

  // — вход (веб) —
  "login.viaTelegram": { uk: "Увійти через Telegram", ru: "Войти через Telegram", en: "Log in with Telegram" },
  "login.hint": {
    uk: "Відкриється бот. Авторизуйтесь і натисніть «У браузері», щоб повернутися сюди вже в системі.",
    ru: "Откроется бот. Авторизуйтесь и нажмите «В браузере», чтобы вернуться сюда уже в системе.",
    en: "The bot opens. Log in and tap “In browser” to return here signed in.",
  },
  "login.adminPassword": { uk: "Пароль адміністратора", ru: "Пароль администратора", en: "Admin password" },
  "login.wrongPassword": { uk: "Невірний пароль", ru: "Неверный пароль", en: "Wrong password" },
  "login.loginWithPassword": { uk: "Увійти паролем", ru: "Войти паролем", en: "Sign in with password" },
  "login.passwordLink": { uk: "вхід за паролем (адмін) →", ru: "вход по паролю (админ) →", en: "password login (admin) →" },

  // — Mini App —
  "tma.authing": { uk: "Авторизація через Telegram…", ru: "Авторизация через Telegram…", en: "Authorizing via Telegram…" },
  "tma.openInTelegram": { uk: "Відкрий цей застосунок усередині Telegram.", ru: "Открой это приложение внутри Telegram.", en: "Open this app inside Telegram." },
  "tma.authFailed": { uk: "Не вдалося авторизуватися.", ru: "Не удалось авторизоваться.", en: "Authorization failed." },
  "tma.netError": { uk: "Помилка мережі.", ru: "Ошибка сети.", en: "Network error." },
  "tma.requestFailed": { uk: "Не вдалося надіслати заявку.", ru: "Не удалось отправить заявку.", en: "Failed to send request." },
  "tma.whoAreYou": { uk: "Хто ви?", ru: "Кто вы?", en: "Who are you?" },
  "tma.chooseRoleHint": {
    uk: "Оберіть роль — після підтвердження відкриється доступ.",
    ru: "Выберите роль — после подтверждения откроется доступ.",
    en: "Choose a role — access opens after approval.",
  },
  "tma.requestSent": { uk: "Заявку надіслано", ru: "Заявка отправлена", en: "Request sent" },
  "tma.requestSentHint": {
    uk: "Для активації доступу напишіть в особисті повідомлення:",
    ru: "Для активации доступа напишите в личные сообщения:",
    en: "To activate access, message:",
  },
  "tma.writeAdmin": { uk: "Написати @soloveynik", ru: "Написать @soloveynik", en: "Message @soloveynik" },

  // — новая задача —
  "newtask.kicker": { uk: "Постановка", ru: "Постановка", en: "New" },
  "newtask.title": { uk: "Нова задача", ru: "Новая задача", en: "New task" },
  "newtask.hint": {
    uk: "Опиши задачу в чаті — я уточню деталі, гляну код і запропоную готові задачі. Можна додавати скриншоти.",
    ru: "Опиши задачу в чате — я уточню детали, посмотрю код и предложу готовые задачи. Можно прикладывать скриншоты.",
    en: "Describe the task in chat — I’ll clarify details, check the code, and propose ready tasks. You can attach screenshots.",
  },
  "newtask.placeholder": {
    uk: "напр.: на shulex додати експорт справ у PDF, віддати олександру, термін п’ятниця",
    ru: "напр.: на shulex добавить экспорт дел в PDF, отдать александру, срок пятница",
    en: "e.g.: on shulex add case export to PDF, assign to alexander, due Friday",
  },
  "newtask.structure": { uk: "Структурувати", ru: "Структурировать", en: "Structure" },
  "newtask.created": { uk: "Задачу створено: ", ru: "Задача создана: ", en: "Task created: " },
  "newtask.lowConfidence": {
    uk: "⚠ Низька впевненість — перевір проєкт і суть",
    ru: "⚠ Низкая уверенность — проверь проект и суть",
    en: "⚠ Low confidence — check the project and gist",
  },
  "newtask.createBtn": { uk: "Створити задачу", ru: "Создать задачу", en: "Create task" },
  "chat.placeholder": { uk: "Опишіть задачу, додайте скрін…", ru: "Опишите задачу, добавьте скрин…", en: "Describe the task, attach a screenshot…" },
  "chat.send": { uk: "Надіслати", ru: "Отправить", en: "Send" },
  "chat.attach": { uk: "Скрін", ru: "Скрин", en: "Image" },
  "chat.thinking": { uk: "Аналізую…", ru: "Анализирую…", en: "Analyzing…" },
  "chat.proposedTitle": { uk: "Запропоновані задачі", ru: "Предложенные задачи", en: "Proposed tasks" },
  "chat.createAll": { uk: "Створити в портал", ru: "Создать в портал", en: "Create in portal" },
  "chat.createdOk": { uk: "Створено ✓", ru: "Создано ✓", en: "Created ✓" },
  "chat.you": { uk: "Ви", ru: "Вы", en: "You" },
  "chat.attachFile": { uk: "Прикріпити файл", ru: "Прикрепить файл", en: "Attach file" },
  "chat.voice": { uk: "Надиктувати", ru: "Надиктовать", en: "Dictate" },
  "chat.voiceStop": { uk: "Стоп", ru: "Стоп", en: "Stop" },
  "chat.recording": { uk: "Запис…", ru: "Запись…", en: "Recording…" },
  "chat.lockHint": { uk: "вгору — замок, вліво — видалити", ru: "вверх — замок, влево — удалить", en: "up — lock, left — delete" },
  "chat.empty": { uk: "Опишіть задачу. Затисніть кнопку відправки для голосового вводу. Скрін — через Ctrl+V або скріпку.", ru: "Опишите задачу. Зажмите кнопку отправки для голосового ввода. Скрин — через Ctrl+V или скрепку.", en: "Describe the task. Hold the send button for voice input. Paste a screenshot with Ctrl+V or the clip." },

  // — поля —
  "field.project": { uk: "Проєкт", ru: "Проект", en: "Project" },
  "field.assignee": { uk: "Виконавець", ru: "Исполнитель", en: "Assignee" },
  "field.unassigned": { uk: "— не призначено —", ru: "— не назначен —", en: "— unassigned —" },
  "field.title": { uk: "Заголовок", ru: "Заголовок", en: "Title" },
  "field.description": { uk: "Опис", ru: "Описание", en: "Description" },
  "field.priority": { uk: "Пріоритет", ru: "Приоритет", en: "Priority" },
  "field.due": { uk: "Дедлайн (в опис)", ru: "Дедлайн (в описание)", en: "Deadline (into description)" },
  "field.role": { uk: "Роль", ru: "Роль", en: "Role" },

  // — список задач —
  "tasks.allTitle": { uk: "Усі задачі", ru: "Все задачи", en: "All tasks" },
  "tasks.allKicker": { uk: "Активні", ru: "Активные", en: "Active" },
  "tasks.mineTitle": { uk: "Мої задачі", ru: "Мои задачи", en: "My tasks" },
  "tasks.mineKicker": { uk: "Призначено мені", ru: "Назначено мне", en: "Assigned to me" },
  "tasks.clientTitle": { uk: "Мої проєкти", ru: "Мои проекты", en: "My projects" },
  "tasks.clientKicker": { uk: "Мої заявки", ru: "Мои заявки", en: "My requests" },
  "tasks.empty": { uk: "Активних задач немає.", ru: "Активных задач нет.", en: "No active tasks." },
  "error.load": { uk: "Помилка завантаження: ", ru: "Ошибка загрузки: ", en: "Load error: " },

  // — просрочки —
  "overdue.kicker": { uk: "Без руху від {n} дн.", ru: "Без движения от {n} дн.", en: "No activity {n}+ days" },
  "overdue.title": { uk: "Прострочення", ru: "Просрочки", en: "Overdue" },
  "overdue.empty": { uk: "Завислих задач немає — все в русі.", ru: "Зависших задач нет — всё в движении.", en: "No stalled tasks — all moving." },

  // — клиенты —
  "clients.kicker": { uk: "Заявки та питання", ru: "Заявки и вопросы", en: "Requests & questions" },
  "clients.title": { uk: "Клієнти", ru: "Клиенты", en: "Clients" },
  "clients.empty": { uk: "Активних задач від клієнтів немає.", ru: "Активных задач от клиентов нет.", en: "No active client tasks." },
  "clients.question": { uk: "Питання клієнта: ", ru: "Вопрос клиента: ", en: "Client question: " },
  "clients.draftReply": { uk: "Чернетка відповіді", ru: "Черновик ответа", en: "Draft reply" },
  "clients.publish": { uk: "Опублікувати відповідь", ru: "Опубликовать ответ", en: "Publish reply" },
  "clients.regen": { uk: "Перегенерувати", ru: "Перегенерировать", en: "Regenerate" },
  "clients.published": { uk: "Відповідь опубліковано ✓", ru: "Ответ опубликован ✓", en: "Reply published ✓" },

  // — команда —
  "team.kicker": { uk: "Доступ за ролями", ru: "Доступ по ролям", en: "Role-based access" },
  "team.title": { uk: "Команда", ru: "Команда", en: "Team" },
  "team.hint": {
    uk: "Підтверджуй заявки на доступ або генеруй посилання-запрошення. Прив’язка з’єднує Telegram-користувача з обліковкою та роллю.",
    ru: "Подтверждай заявки на доступ или генерируй ссылку-приглашение. Привязка соединяет Telegram-пользователя с учёткой и ролью.",
    en: "Approve access requests or generate an invite link. Linking connects a Telegram user to an account and role.",
  },
  "team.pendingKicker": { uk: "Очікують підтвердження", ru: "Ожидают подтверждения", en: "Pending approval" },
  "team.requestsTitle": { uk: "Заявки на доступ", ru: "Заявки на доступ", en: "Access requests" },
  "team.inviteKicker": { uk: "Запросити посиланням", ru: "Пригласить ссылкой", en: "Invite by link" },
  "team.inviteTitle": { uk: "Запрошення", ru: "Приглашение", en: "Invite" },
  "team.user": { uk: "Користувач", ru: "Пользователь", en: "User" },
  "team.createInvite": { uk: "Створити посилання-запрошення", ru: "Создать ссылку-приглашение", en: "Create invite link" },
  "team.linkLabel": { uk: "Посилання (діє 72 год, одноразове)", ru: "Ссылка (действует 72 ч, одноразовая)", en: "Link (valid 72h, single-use)" },
  "team.linkHint": {
    uk: "Надішли його людині — відкривши в Telegram, вона прив’яже акаунт до цієї ролі.",
    ru: "Отправь её человеку — открыв в Telegram, он привяжет аккаунт к этой роли.",
    en: "Send it to the person — opening in Telegram links their account to this role.",
  },
  "team.wants": { uk: "хоче: ", ru: "хочет: ", en: "wants: " },
  "team.login": { uk: "— логін —", ru: "— логин —", en: "— login —" },
  "team.approve": { uk: "Підтвердити", ru: "Подтвердить", en: "Approve" },
  "team.reject": { uk: "Відхилити", ru: "Отклонить", en: "Reject" },
  "team.approved": { uk: "доступ відкрито", ru: "доступ открыт", en: "access granted" },
  "team.rejected": { uk: "відхилено", ru: "отклонено", en: "rejected" },

  // — проекты / токены для разработчиков —
  "projects.kicker": { uk: "Доступ для розробників", ru: "Доступ для разработчиков", en: "Developer access" },
  "projects.title": { uk: "Проєкти", ru: "Проекты", en: "Projects" },
  "projects.hint": {
    uk: "Токен проєкту дозволяє Claude розробника читати задачі через API — без ручного копіювання.",
    ru: "Токен проекта позволяет Claude разработчика читать задачи через API — без ручного копирования.",
    en: "A project token lets the developer’s Claude read tasks via API — no manual copy-paste.",
  },
  "projects.genToken": { uk: "Згенерувати токен", ru: "Сгенерировать токен", en: "Generate token" },
  "projects.regenToken": { uk: "Перегенерувати", ru: "Перегенерировать", en: "Regenerate" },
  "projects.tokenLabel": { uk: "Токен проєкту", ru: "Токен проекта", en: "Project token" },
  "projects.snippetLabel": { uk: "Рядок для CLAUDE.md розробника", ru: "Строка для CLAUDE.md разработчика", en: "Snippet for the developer’s CLAUDE.md" },
  "projects.noToken": { uk: "токен не створено", ru: "токен не создан", en: "no token yet" },
  "projects.add": { uk: "Додати проєкт", ru: "Добавить проект", en: "Add project" },
  "projects.key": { uk: "Ключ (напр. SHU)", ru: "Ключ (напр. SHU)", en: "Key (e.g. SHU)" },
  "projects.name": { uk: "Назва", ru: "Название", en: "Name" },
  "projects.open": { uk: "Відкрити", ru: "Открыть", en: "Open" },
  "projects.save": { uk: "Зберегти", ru: "Сохранить", en: "Save" },
  "projects.saved": { uk: "Збережено ✓", ru: "Сохранено ✓", en: "Saved ✓" },
  "projects.repos": { uk: "Репозиторії", ru: "Репозитории", en: "Repositories" },
  "projects.clientGit": { uk: "Git клієнта", ru: "Git клиента", en: "Client git" },
  "projects.devGit": { uk: "Dev git (команда)", ru: "Dev git (команда)", en: "Dev git (team)" },
  "projects.localPath": { uk: "Локальний шлях", ru: "Локальный путь", en: "Local path" },
  "projects.hosting": { uk: "Хостинг", ru: "Хостинг", en: "Hosting" },
  "projects.prodUrl": { uk: "Прод URL", ru: "Прод URL", en: "Prod URL" },
  "projects.devUrl": { uk: "Dev URL", ru: "Dev URL", en: "Dev URL" },
  "projects.deploy": { uk: "Деплой", ru: "Деплой", en: "Deploy" },
  "projects.prodBranch": { uk: "Гілка прод", ru: "Ветка прод", en: "Prod branch" },
  "projects.devBranch": { uk: "Гілка dev", ru: "Ветка dev", en: "Dev branch" },
  "projects.design": { uk: "Дизайн (Figma)", ru: "Дизайн (Figma)", en: "Design (Figma)" },
  "projects.creds": { uk: "Доступи (рядок: роль|env|логін|пароль)", ru: "Доступы (строка: роль|env|логин|пароль)", en: "Credentials (line: role|env|login|pass)" },
  "projects.defaultAssignee": { uk: "Відповідальний (розробник)", ru: "Ответственный (разработчик)", en: "Responsible (developer)" },
  "projects.conventions": { uk: "Конвенції / правила (для інтейку)", ru: "Конвенции / правила (для интейка)", en: "Conventions / rules (for intake)" },
  "projects.conventionsHint": { uk: "Для проєктів з клієнтським репо (де CLAUDE.md у .gitignore). Інтейк читає звідси.", ru: "Для проектов с клиентским репо (где CLAUDE.md в .gitignore). Интейк читает отсюда.", en: "For projects with a client repo (CLAUDE.md gitignored). Intake reads from here." },

  // — страница задачи —
  "task.back": { uk: "← до задач", ru: "← к задачам", en: "← to tasks" },
  "task.description": { uk: "Опис", ru: "Описание", en: "Description" },
  "task.noDescription": { uk: "Опис відсутній.", ru: "Описание отсутствует.", en: "No description." },
  "task.comments": { uk: "Коментарі", ru: "Комментарии", en: "Comments" },
  "task.noComments": { uk: "Коментарів немає.", ru: "Комментариев нет.", en: "No comments." },
  "task.addComment": { uk: "Додати коментар", ru: "Добавить комментарий", en: "Add comment" },
  "task.send": { uk: "Надіслати", ru: "Отправить", en: "Send" },

  // — карточка задачи —
  "card.stale": { uk: "висить {n} дн.", ru: "висит {n} дн.", en: "{n}d idle" },
  "card.unassigned": { uk: "не призначено", ru: "не назначен", en: "unassigned" },
  "card.from": { uk: "від {name}", ru: "от {name}", en: "from {name}" },
  "card.clientTag": { uk: " (клієнт)", ru: " (клиент)", en: " (client)" },
  "card.updated": { uk: "оновл. {date}", ru: "обновл. {date}", en: "upd. {date}" },
};

export function t(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const entry = DICT[key];
  let s = entry ? entry[locale] ?? entry[DEFAULT_LOCALE] : key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
  return s;
}

/** Нормализация кода языка (ru-RU, uk, en-US, …) в нашу локаль. */
export function normalizeLocale(code: string | null | undefined): Locale | null {
  if (!code) return null;
  const c = code.toLowerCase().slice(0, 2);
  if (c === "uk" || c === "ua") return "uk";
  if (c === "ru" || c === "be") return "ru";
  if (c === "en") return "en";
  return null;
}

/** Локаль из заголовка Accept-Language. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  for (const part of header.split(",")) {
    const code = part.split(";")[0].trim();
    const loc = normalizeLocale(code);
    if (loc) return loc;
  }
  return DEFAULT_LOCALE;
}

/** Определение локали на клиенте: язык Telegram (в Mini App) -> navigator.language. */
export function detectClientLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  // @ts-expect-error — SDK Telegram, если открыто в Mini App
  const tgLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
  return normalizeLocale(tgLang) || normalizeLocale(navigator.language) || DEFAULT_LOCALE;
}
