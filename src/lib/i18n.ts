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

  // — подсказка разработчику (как работать с Claude Code + порталом) —
  "help.label": { uk: "Підказка", ru: "Подсказка", en: "Help" },
  "help.title": { uk: "Як працювати з задачами", ru: "Как работать с задачами", en: "How to work on tasks" },
  "help.startT": { uk: "1. Старт", ru: "1. Старт", en: "1. Start" },
  "help.startB": {
    uk: "Відкрий репозиторій проєкту, запусти Claude Code і скажи: «візьми мою задачу з порталу і зроби її». Claude сам прочитає CLAUDE.md, знайде задачу по токену і почне — копіювати задачу вручну не треба.",
    ru: "Открой репозиторий проекта, запусти Claude Code и скажи: «возьми мою задачу из портала и сделай её». Claude сам прочитает CLAUDE.md, найдёт задачу по токену и начнёт — копировать задачу вручную не надо.",
    en: "Open the project repo, run Claude Code and say: “take my task from the portal and do it.” Claude reads CLAUDE.md, fetches the task by token and starts — no manual copying.",
  },
  "help.optionsT": { uk: "2. Якщо Claude питає «який варіант обрати»", ru: "2. Если Claude спрашивает «какой вариант выбрать»", en: "2. If Claude asks “which option”" },
  "help.optionsB": {
    uk: "Технічні розвилки він має вирішувати сам. Якщо все ж питає — скажи: «виріши сам розумним дефолтом за конвенціями проєкту». Якщо питання для клієнта — скажи: «ескалюй це питання клієнту через портал», і нічого пересилати не треба.",
    ru: "Технические развилки он должен решать сам. Если всё же спрашивает — скажи: «реши сам разумным дефолтом по конвенциям проекта». Если вопрос для клиента — скажи: «эскалируй этот вопрос клиенту через портал», пересылать ничего не надо.",
    en: "Technical choices he should make himself. If he still asks — say: “decide yourself with a sensible default per project conventions.” If it’s for the client — say: “escalate this question to the client via the portal”, nothing to forward.",
  },
  "help.answeredT": { uk: "3. Коли клієнт відповів", ru: "3. Когда клиент ответил", en: "3. When the client answered" },
  "help.answeredB": {
    uk: "Просто скажи Claude «продовжуй» — він перечитає задачу з порталу і побачить відповідь клієнта. Переказувати відповідь не треба.",
    ru: "Просто скажи Claude «продолжай» — он перечитает задачу из портала и увидит ответ клиента. Пересказывать ответ не надо.",
    en: "Just tell Claude “continue” — he re-reads the task from the portal and sees the client’s answer. No need to relay it.",
  },
  "help.phrasesT": { uk: "Корисні фрази Claude", ru: "Полезные фразы Claude", en: "Useful phrases for Claude" },
  "help.phrasesB": {
    uk: "• «візьми задачу з порталу» / «покажи мої задачі»\n• «виріши технічну розвилку сам»\n• «ескалюй це питання клієнту»\n• «продовжуй — перевір, чи відповів клієнт»",
    ru: "• «возьми задачу из портала» / «покажи мои задачи»\n• «реши техническую развилку сам»\n• «эскалируй этот вопрос клиенту»\n• «продолжай — проверь, ответил ли клиент»",
    en: "• “take the task from the portal” / “show my tasks”\n• “decide the technical choice yourself”\n• “escalate this question to the client”\n• “continue — check if the client replied”",
  },
  "help.note": {
    uk: "Токен проєкту вже лежить у CLAUDE.md репозиторія — налаштовувати нічого не треба.",
    ru: "Токен проекта уже лежит в CLAUDE.md репозитория — настраивать ничего не надо.",
    en: "The project token is already in the repo’s CLAUDE.md — nothing to set up.",
  },

  // — навигация —
  "nav.newTask": { uk: "Нова задача", ru: "Новая задача", en: "New task" },
  "nav.tasks": { uk: "Задачі", ru: "Задачи", en: "Tasks" },
  "nav.clients": { uk: "Клієнти", ru: "Клиенты", en: "Clients" },
  "nav.overdue": { uk: "Прострочення", ru: "Просрочки", en: "Overdue" },
  "nav.team": { uk: "Команда", ru: "Команда", en: "Team" },
  "nav.projects": { uk: "Проєкти", ru: "Проекты", en: "Projects" },
  "nav.skills": { uk: "Скіли", ru: "Скилы", en: "Skills" },
  "nav.onboarding": { uk: "Інструкція", ru: "Инструкция", en: "Onboarding" },
  "onb.kicker": { uk: "Онбординг", ru: "Онбординг", en: "Onboarding" },
  "onb.title": { uk: "Інструкція для клієнта", ru: "Инструкция для клиента", en: "Client onboarding" },
  "onb.hint": { uk: "Покрокова інструкція підключення (GitHub + Railway + токен). Редагуйте текст і вставляйте скріни у потрібних місцях. Клієнту надсилайте публічне посилання.", ru: "Пошаговая инструкция подключения (GitHub + Railway + токен). Редактируйте текст и вставляйте скрины в нужных местах. Клиенту отправляйте публичную ссылку.", en: "Step-by-step connection guide (GitHub + Railway + token). Edit text and insert screenshots where needed. Send the public link to the client." },
  "onb.publicLink": { uk: "Публічне посилання", ru: "Публичная ссылка", en: "Public link" },
  "onb.copy": { uk: "Копіювати", ru: "Копировать", en: "Copy" },
  "onb.copied": { uk: "Скопійовано ✓", ru: "Скопировано ✓", en: "Copied ✓" },
  "onb.step": { uk: "Крок", ru: "Шаг", en: "Step" },
  "onb.titlePh": { uk: "Заголовок кроку", ru: "Заголовок шага", en: "Step title" },
  "onb.bodyPh": { uk: "Текст кроку (Markdown). Кнопкою нижче вставляйте скріни.", ru: "Текст шага (Markdown). Кнопкой ниже вставляйте скрины.", en: "Step text (Markdown). Use the button below to insert screenshots." },
  "onb.insertImage": { uk: "Вставити скрін", ru: "Вставить скрин", en: "Insert screenshot" },
  "onb.addStep": { uk: "Додати крок", ru: "Добавить шаг", en: "Add step" },
  "onb.removeStep": { uk: "Видалити крок", ru: "Удалить шаг", en: "Remove step" },
  "onb.save": { uk: "Зберегти", ru: "Сохранить", en: "Save" },
  "onb.savedOk": { uk: "Збережено ✓", ru: "Сохранено ✓", en: "Saved ✓" },
  "onb.collect": { uk: "Збирати поле", ru: "Собирать поле", en: "Collect field" },
  "onb.collectNone": { uk: "— нічого —", ru: "— ничего —", en: "— none —" },
  "onb.collectRepo": { uk: "Посилання на репозиторій", ru: "Ссылка на репозиторий", en: "Repository link" },
  "onb.collectToken": { uk: "Railway токен", ru: "Railway токен", en: "Railway token" },
  "onb.banner": { uk: "Залишилось налаштувати підключення проєкту.", ru: "Осталось настроить подключение проекта.", en: "Finish setting up your project connection." },
  "onb.bannerCta": { uk: "Пройти інструкцію →", ru: "Пройти инструкцию →", en: "Open the guide →" },
  "invite.showOnboarding": { uk: "Показати клієнту інструкцію з підключення при вході", ru: "Показать клиенту инструкцию подключения при входе", en: "Show client the onboarding guide on first login" },
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
  "request.placeholder": { uk: "Введіть або вставте опис задачі…", ru: "Введите или вставьте описание задачи…", en: "Type or paste the task description…" },
  "request.titlePh": { uk: "Введіть заголовок", ru: "Введите заголовок", en: "Enter a title" },
  "request.titleRequired": { uk: "Вкажіть заголовок", ru: "Укажите заголовок", en: "Enter a title" },
  "request.submit": { uk: "Створити задачу", ru: "Создать задачу", en: "Create task" },
  "request.sent": { uk: "Прийняв, розберуся з кодом. Можете закрити це вікно — ви отримаєте сповіщення в боті, коли задачу буде поставлено, або якщо знадобиться уточнення.", ru: "Принял, разберусь с кодом. Можете закрыть это окно — вы получите уведомление в бот, когда задача будет поставлена, или если понадобится уточнение.", en: "Got it, I'll dig into the code. You can close this window — you'll get a bot notification when the task is ready, or if I need a clarification." },
  "request.another": { uk: "Створити ще одну", ru: "Создать ещё одну", en: "Create another" },
  "request.edit": { uk: "Редагувати", ru: "Редактировать", en: "Edit" },
  "request.editSave": { uk: "Зберегти", ru: "Сохранить", en: "Save" },
  "request.editCancel": { uk: "Скасувати", ru: "Отмена", en: "Cancel" },
  "request.editDelete": { uk: "Видалити", ru: "Удалить", en: "Delete" },
  "ai.drafting": { uk: "Lambertain опрацьовує задачу — готує специфікацію.", ru: "Lambertain прорабатывает задачу — готовит спецификацию.", en: "Lambertain is working on the task — preparing the spec." },
  "ai.waiting": { uk: "Lambertain очікує вашої відповіді на уточнення нижче.", ru: "Lambertain ждёт вашего ответа на уточнение ниже.", en: "Lambertain is waiting for your answer to the clarification below." },
  "ai.retry": { uk: "Перепрацювати", ru: "Перепроработать", en: "Re-draft" },
  "taskedit.edit": { uk: "Редагувати задачу", ru: "Редактировать задачу", en: "Edit task" },
  "taskedit.title": { uk: "Редагування задачі", ru: "Редактирование задачи", en: "Edit task" },
  "taskedit.summary": { uk: "Заголовок", ru: "Заголовок", en: "Title" },
  "taskedit.description": { uk: "Опис / запит", ru: "Описание / запрос", en: "Description / request" },
  "taskedit.assignee": { uk: "Виконавець", ru: "Исполнитель", en: "Assignee" },
  "taskedit.noAssignee": { uk: "— не призначено —", ru: "— не назначен —", en: "— unassigned —" },
  "taskedit.priority": { uk: "Пріоритет", ru: "Приоритет", en: "Priority" },
  "review.creatorHint": { uk: "Розробник завершив — перевірте результат і прийміть або поверніть на доопрацювання.", ru: "Разработчик завершил — проверьте результат и примите или верните на доработку.", en: "The developer finished — review the result and accept or send back for rework." },
  "review.accept": { uk: "Прийняти (Готово)", ru: "Принять (Готово)", en: "Accept (Done)" },
  "review.rework": { uk: "На доопрацювання", ru: "На доработку", en: "Send to rework" },
  "review.reworkPh": { uk: "Що доопрацювати (необовʼязково)", ru: "Что доработать (необязательно)", en: "What to rework (optional)" },

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
  "invite.projectsHint": { uk: "можна кілька", ru: "можно несколько", en: "multiple allowed" },
  "invite.adminWarn": { uk: "Повний доступ до всього порталу. Запрошуйте лише довірених (партнер).", ru: "Полный доступ ко всему порталу. Приглашайте только доверенных (партнёр).", en: "Full portal access. Invite only trusted people (partner)." },
  "approval.pending": { uk: "🟠 Задача на затвердженні", ru: "🟠 Задача на утверждении", en: "🟠 Task pending approval" },
  "approval.hint": { uk: "Задача очікує підтвердження, щоб взяли в роботу.", ru: "Задача ожидает подтверждения, чтобы взяли в работу.", en: "Task is awaiting approval to start work." },
  "approval.by": { uk: "створив {name}", ru: "создал {name}", en: "created by {name}" },
  "approval.approve": { uk: "Затвердити", ru: "Утвердить", en: "Approve" },
  "approval.reject": { uk: "Відхилити", ru: "Отклонить", en: "Reject" },
  "approval.approvedOk": { uk: "Затверджено ✓", ru: "Утверждено ✓", en: "Approved ✓" },
  "approval.rejectedOk": { uk: "Відхилено", ru: "Отклонено", en: "Rejected" },
  "invite.newProject": { uk: "Або створити новий проєкт", ru: "Или создать новый проект", en: "Or create a new project" },
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
  "team.linkedKicker": { uk: "Хто приєднався", ru: "Кто присоединился", en: "Who joined" },
  "team.linkedTitle": { uk: "Привʼязані акаунти", ru: "Привязанные аккаунты", en: "Linked accounts" },
  "team.linkedEmpty": { uk: "Поки ніхто не приєднався по запрошенню.", ru: "Пока никто не присоединился по приглашению.", en: "Nobody has joined via invite yet." },
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
  "projects.manage": { uk: "Управління проєктами →", ru: "Управление проектами →", en: "Manage projects →" },
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
  "projects.clientDeploy": { uk: "Деплой клієнта (Railway)", ru: "Деплой клиента (Railway)", en: "Client deploy (Railway)" },
  "projects.clientDeployHint": { uk: "Токен і ID клієнтського Railway — для доставки dev→client: апрув деплою, моніторинг, URL БД для міграції.", ru: "Токен и ID клиентского Railway — для доставки dev→client: апрув деплоя, мониторинг, URL БД для миграции.", en: "Client Railway token and IDs — for dev→client delivery: approve deploy, monitor, DB URL for migration." },
  "projects.cdToken": { uk: "Railway-токен клієнта", ru: "Railway-токен клиента", en: "Client Railway token" },
  "projects.cdProject": { uk: "Project ID", ru: "Project ID", en: "Project ID" },
  "projects.cdEnv": { uk: "Environment ID", ru: "Environment ID", en: "Environment ID" },
  "projects.cdService": { uk: "App Service ID", ru: "App Service ID", en: "App Service ID" },
  "projects.cdPg": { uk: "Postgres Service ID", ru: "Postgres Service ID", en: "Postgres Service ID" },
  "deliver.title": { uk: "Доставка dev → client", ru: "Доставка dev → client", en: "Deliver dev → client" },
  "deliver.hint": { uk: "Доставити код dev-репо в client-репо одним комітом. Перевіряє зміни схеми БД перед пушем.", ru: "Доставить код dev-репо в client-репо одним коммитом. Проверяет изменения схемы БД перед пушем.", en: "Deliver dev-repo code to client-repo in one commit. Checks DB schema changes before push." },
  "deliver.open": { uk: "Підготувати доставку", ru: "Подготовить доставку", en: "Prepare delivery" },
  "deliver.files": { uk: "Файлів: {n}", ru: "Файлов: {n}", en: "Files: {n}" },
  "deliver.schemaChanged": { uk: "⚠ Схема БД змінилася ({n}) — накати міграцію на клієнтську БД ДО доставки", ru: "⚠ Схема БД изменилась ({n}) — накати миграцию на клиентскую БД ДО доставки", en: "⚠ DB schema changed ({n}) — apply migration to client DB BEFORE delivery" },
  "deliver.schemaConfirm": { uk: "Міграцію накатив, продовжити", ru: "Миграцию накатил, продолжить", en: "Migration applied, continue" },
  "deliver.branch": { uk: "Гілка-приймач у client", ru: "Ветка-приёмник в client", en: "Target branch in client" },
  "deliver.toMain": { uk: "У дефолтну гілку — спрацює авто-деплой клієнта", ru: "В дефолтную ветку — сработает авто-деплой клиента", en: "To default branch — client auto-deploy will trigger" },
  "deliver.toBranch": { uk: "В окрему гілку — клієнт змержить сам", ru: "В отдельную ветку — клиент смержит сам", en: "To a separate branch — the client merges it" },
  "deliver.run": { uk: "Доставити", ru: "Доставить", en: "Deliver" },
  "deliver.done": { uk: "Доставлено {n} файлів у гілку {branch}", ru: "Доставлено {n} файлов в ветку {branch}", en: "Delivered {n} files to branch {branch}" },
  "deliver.commit": { uk: "Коміт", ru: "Коммит", en: "Commit" },
  "deliver.deploy": { uk: "Деплой клієнта", ru: "Деплой клиента", en: "Client deploy" },
  "projects.conventions": { uk: "Конвенції / правила (для інтейку)", ru: "Конвенции / правила (для интейка)", en: "Conventions / rules (for intake)" },
  "projects.conventionsHint": { uk: "Для проєктів з клієнтським репо (де CLAUDE.md у .gitignore). Інтейк читає звідси.", ru: "Для проектов с клиентским репо (где CLAUDE.md в .gitignore). Интейк читает отсюда.", en: "For projects with a client repo (CLAUDE.md gitignored). Intake reads from here." },

  // — страница задачи —
  "task.back": { uk: "← до задач", ru: "← к задачам", en: "← to tasks" },
  "task.description": { uk: "Опис", ru: "Описание", en: "Description" },
  "task.noDescription": { uk: "Опис відсутній.", ru: "Описание отсутствует.", en: "No description." },
  "task.comments": { uk: "Коментарі", ru: "Комментарии", en: "Comments" },
  "task.noComments": { uk: "Коментарів немає.", ru: "Комментариев нет.", en: "No comments." },
  "task.addComment": { uk: "Додати коментар", ru: "Добавить комментарий", en: "Add comment" },
  "comment.visibleToClient": { uk: "Видно клієнту", ru: "Видно клиенту", en: "Visible to client" },
  "comment.internalOnly": { uk: "Внутрішній — клієнт не побачить", ru: "Внутренний — клиент не увидит", en: "Internal — client won’t see it" },
  "comment.willSeeClient": { uk: "Клієнт побачить цей коментар", ru: "Клиент увидит этот комментарий", en: "The client will see this comment" },
  "comment.internalBadge": { uk: "внутр.", ru: "внутр.", en: "internal" },
  "comment.newBelow": { uk: "NEW нижче · {n}", ru: "NEW ниже · {n}", en: "NEW below · {n}" },

  // — ответ клиенту через ИИ (по фидбеку разраба, от лица Lambertain) —
  "creply.open": { uk: "Відповісти клієнту (ІІ)", ru: "Ответить клиенту (ИИ)", en: "Reply to client (AI)" },
  "creply.title": { uk: "Відповідь клієнту через ІІ", ru: "Ответ клиенту через ИИ", en: "AI reply to client" },
  "creply.hint": {
    uk: "ІІ прочитав задачу, переписку та код і пропонує відповідь від імені Lambertain. Виправ текст, або дай вказівки що змінити, або опублікуй як є.",
    ru: "ИИ прочитал задачу, переписку и код и предлагает ответ от имени Lambertain. Поправь текст, или дай указания что изменить, или опубликуй как есть.",
    en: "AI read the task, thread and code and proposes a reply as Lambertain. Edit the text, tell AI what to change, or publish as is.",
  },
  "creply.reading": { uk: "ІІ читає задачу, переписку та код…", ru: "ИИ читает задачу, переписку и код…", en: "AI is reading the task, thread and code…" },
  "creply.instrLabel": { uk: "Що змінити у відповіді (необовʼязково)", ru: "Что изменить в ответе (необязательно)", en: "What to change in the reply (optional)" },
  "creply.instrPlaceholder": { uk: "напр.: прибери технічні деталі, додай про строки", ru: "напр.: убери технические детали, добавь про сроки", en: "e.g.: remove technical details, add about timelines" },
  "creply.regenerate": { uk: "Перегенерувати з правками", ru: "Перегенерировать с правками", en: "Regenerate with changes" },
  "creply.draftLabel": { uk: "Чернетка (перевір і виправ)", ru: "Черновик (проверь и поправь)", en: "Draft (review and edit)" },
  "creply.publish": { uk: "Опублікувати клієнту", ru: "Опубликовать клиенту", en: "Publish to client" },
  "creply.published": { uk: "Опубліковано клієнту ✓", ru: "Опубликовано клиенту ✓", en: "Published to client ✓" },
  "task.send": { uk: "Надіслати", ru: "Отправить", en: "Send" },

  // — табы статусов —
  "tab.inProgress": { uk: "В роботі", ru: "В работе", en: "In progress" },
  "tab.review": { uk: "Ревʼю", ru: "Ревью", en: "Review" },
  "tab.rework": { uk: "Доопрацювання", ru: "Доработка", en: "Rework" },
  "tab.done": { uk: "Готово", ru: "Готово", en: "Done" },
  "tab.notStarted": { uk: "Не розпочаті", ru: "Не начатые", en: "Not started" },
  "tab.blocked": { uk: "Заблоковані", ru: "Заблок.", en: "Blocked" },
  "tab.startHint": { uk: "Клік — взяти в роботу", ru: "Клик — взять в работу", en: "Click — take to work" },
  "tab.allProjects": { uk: "Усі", ru: "Все", en: "All" },

  // — ревью кода (ИИ, on-demand) —
  "review.refLabel": { uk: "Посилання на коміт/PR/гілку (необовʼязково)", ru: "Ссылка на коммит/PR/ветку (необязательно)", en: "Commit/PR/branch link (optional)" },
  "review.refPlaceholder": { uk: "напр. https://github.com/org/repo/pull/12", ru: "напр. https://github.com/org/repo/pull/12", en: "e.g. https://github.com/org/repo/pull/12" },
  "review.send": { uk: "На ревʼю", ru: "На ревью", en: "To review" },
  "review.request": { uk: "ІІ-ревʼю коду", ru: "ИИ-ревью кода", en: "AI code review" },
  "review.running": { uk: "ІІ перевіряє…", ru: "ИИ проверяет…", en: "AI reviewing…" },
  "review.doneApprove": { uk: "✅ ІІ: готово", ru: "✅ ИИ: готово", en: "✅ AI: approved" },
  "review.doneRework": { uk: "🔧 ІІ: є зауваження — див. коментар", ru: "🔧 ИИ: есть замечания — см. комментарий", en: "🔧 AI: needs rework — see comment" },
  "review.hint": { uk: "Друга пара очей по дифу. Рантайм перевіряєш сам на dev.", ru: "Вторая пара глаз по диффу. Рантайм проверяешь сам на dev.", en: "A second pair of eyes on the diff. You still verify runtime on dev." },

  // — блокеры (зависимости задач) —
  "deps.title": { uk: "Залежить від", ru: "Зависит от", en: "Depends on" },
  "deps.hint": { uk: "Поки блокери не «Готово» — задача заблокована, її не можна взяти в роботу.", ru: "Пока блокеры не «Готово» — задача заблокирована, её нельзя взять в работу.", en: "Until blockers are Done, the task is blocked and can’t be started." },
  "deps.none": { uk: "немає кандидатів", ru: "нет кандидатов", en: "no candidates" },
  "deps.save": { uk: "Зберегти залежності", ru: "Сохранить зависимости", en: "Save dependencies" },
  "deps.blockedBy": { uk: "Заблоковано:", ru: "Заблокировано:", en: "Blocked by:" },

  // — дашборд загрузки разработчиков —
  "dash.kicker": { uk: "Завантаженість команди", ru: "Загрузка команды", en: "Team workload" },
  "dash.title": { uk: "Дашборд", ru: "Дашборд", en: "Dashboard" },
  "dash.totalCost": { uk: "Сумарна вартість", ru: "Суммарная стоимость", en: "Total value" },
  "dash.projectsCount": { uk: "проєктів", ru: "проектов", en: "projects" },
  "dash.openTasks": { uk: "відкритих задач", ru: "открытых задач", en: "open tasks" },
  "dash.daysRunning": { uk: "ведеться, дн.", ru: "ведётся, дн.", en: "days running" },
  "dash.daysLeft": { uk: "до кінця, дн.", ru: "до конца, дн.", en: "days left" },
  "dash.overdueDays": { uk: "прострочка, дн.", ru: "просрочка, дн.", en: "days overdue" },
  "dash.byTime": { uk: "за часом", ru: "по времени", en: "by time" },
  "dash.byTasks": { uk: "за задачами", ru: "по задачам", en: "by tasks" },
  "dash.tasks": { uk: "задачі", ru: "задачи", en: "tasks" },
  "dash.noDeadline": { uk: "без дедлайну", ru: "без дедлайна", en: "no deadline" },
  "dash.unassigned": { uk: "Без відповідального", ru: "Без ответственного", en: "Unassigned" },
  "dash.paid": { uk: "Оплачено", ru: "Оплачено", en: "Paid" },
  "dash.unpaid": { uk: "Залишок", ru: "Остаток", en: "Remaining" },
  "dash.parts": { uk: "частин", ru: "частей", en: "parts" },
  "fin.kicker": { uk: "Фінанси", ru: "Финансы", en: "Finance" },
  "fin.title": { uk: "Зведення", ru: "Сводка", en: "Summary" },
  "fin.projectsInWork": { uk: "проєктів у роботі", ru: "проектов в работе", en: "projects in work" },
  "fin.personal": { uk: "особистих (без вартості)", ru: "личных (без стоимости)", en: "personal (no cost)" },
  "fin.client": { uk: "клієнтських (з вартістю)", ru: "клиентских (со стоимостью)", en: "client (with cost)" },
  "fin.total": { uk: "сума всіх клієнтських", ru: "сумма всех клиентских", en: "total client value" },
  "fin.received": { uk: "отримано", ru: "получено", en: "received" },
  "fin.notReceived": { uk: "ще не отримано", ru: "ещё не получено", en: "not yet received" },
  "dash.empty": { uk: "Проєктів поки немає.", ru: "Проектов пока нет.", en: "No projects yet." },

  // — команда: разработчики и их проекты —
  "team.devsKicker": { uk: "Розробники та проєкти", ru: "Разработчики и проекты", en: "Developers & projects" },
  "team.devsTitle": { uk: "Розробники", ru: "Разработчики", en: "Developers" },
  "team.devsHint": {
    uk: "Признач розробнику проєкти — він стає відповідальним і бачить їх задачі. Один проєкт — один розробник.",
    ru: "Назначь разработчику проекты — он становится ответственным и видит их задачи. Один проект — один разработчик.",
    en: "Assign projects to a developer — they become responsible and see those tasks. One project — one developer.",
  },
  "team.noProjects": { uk: "немає проєктів", ru: "нет проектов", en: "no projects" },
  "team.saveProjects": { uk: "Зберегти проєкти", ru: "Сохранить проекты", en: "Save projects" },

  // — пользователи (присоединившиеся; раскрывающиеся карточки) —
  "users.kicker": { uk: "Хто приєднався", ru: "Кто присоединился", en: "Who joined" },
  "users.title": { uk: "Користувачі", ru: "Пользователи", en: "Users" },
  "users.empty": { uk: "Поки ніхто не приєднався.", ru: "Пока никто не присоединился.", en: "Nobody has joined yet." },
  "users.alias": { uk: "Імʼя (бачите тільки ви)", ru: "Имя (видите только вы)", en: "Name (only you see it)" },
  "users.delete": { uk: "Видалити користувача", ru: "Удалить пользователя", en: "Delete user" },
  "users.deleteConfirm": { uk: "Видалити безповоротно? Доступ і привʼязки зникнуть (історія задач збережеться).", ru: "Удалить безвозвратно? Доступ и привязки исчезнут (история задач сохранится).", en: "Delete permanently? Access and links will be removed (task history is kept)." },
  "users.deleteYes": { uk: "Так, видалити", ru: "Да, удалить", en: "Yes, delete" },

  // — перенос истории (старый ник YouTrack → новый tg-пользователь) —
  "relink.kicker": { uk: "Старі ніки YouTrack", ru: "Старые ники YouTrack", en: "Former YouTrack logins" },
  "relink.title": { uk: "Перенос історії", ru: "Перенос истории", en: "History transfer" },
  "relink.hint": {
    uk: "Коментарі та задачі видалених нікнеймів YouTrack. Прив’яжи до нового користувача, який зайшов по Telegram.",
    ru: "Комментарии и задачи удалённых никнеймов YouTrack. Привяжи к новому пользователю, зашедшему по Telegram.",
    en: "Comments and tasks of deleted YouTrack nicknames. Bind them to the new user who joined via Telegram.",
  },
  "relink.counts": { uk: "коментарів: {c} · задач: {tk}", ru: "комментариев: {c} · задач: {tk}", en: "comments: {c} · tasks: {tk}" },
  "relink.bind": { uk: "Прив’язати", ru: "Привязать", en: "Bind" },
  "relink.done": { uk: "Перенесено: {c} коментарів, {tk} задач ✓", ru: "Перенесено: {c} комментариев, {tk} задач ✓", en: "Transferred: {c} comments, {tk} tasks ✓" },

  // — поля проекта: экономика —
  "field.cost": { uk: "Вартість", ru: "Стоимость", en: "Cost" },
  "field.currency": { uk: "Валюта", ru: "Валюта", en: "Currency" },
  "field.parts": { uk: "Частин (платежів)", ru: "Частей (платежей)", en: "Parts (payments)" },
  "field.paidParts": { uk: "Оплачено частин", ru: "Оплачено частей", en: "Parts paid" },
  "field.startedAt": { uk: "Старт (дата)", ru: "Старт (дата)", en: "Start date" },
  "field.deadline": { uk: "Дедлайн (дата)", ru: "Дедлайн (дата)", en: "Deadline" },

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
/** Сохранить выбранную/определённую локаль: кука `locale` (для серверного рендера) + localStorage. */
export function persistLocale(l: Locale): void {
  if (typeof document !== "undefined") document.cookie = `locale=${l};path=/;max-age=31536000`;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem("locale", l);
  } catch {
    /* localStorage может быть недоступен */
  }
}

export function detectClientLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  // Ручной выбор (переключатель) приоритетнее автоопределения.
  try {
    const saved = normalizeLocale(window.localStorage?.getItem("locale"));
    if (saved) return saved;
  } catch {
    /* localStorage может быть недоступен */
  }
  // @ts-expect-error — SDK Telegram, если открыто в Mini App
  const tgLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
  return normalizeLocale(tgLang) || normalizeLocale(navigator.language) || DEFAULT_LOCALE;
}
