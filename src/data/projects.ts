export type ProjectCategory = "all" | "telegram" | "ai" | "saas" | "web" | "tools";

export interface ProjectLink {
  url: string;
  label: string;
}

export interface Project {
  num: string;
  name: string;
  desc: string;
  longDesc: string;
  tags: string[];
  categories: Exclude<ProjectCategory, "all">[];
  links: ProjectLink[];
  noUrlReason: string | null;
}

export const FILTER_LABELS: { key: ProjectCategory; label: string }[] = [
  { key: "all",      label: "Всі" },
  { key: "telegram", label: "Telegram" },
  { key: "ai",       label: "AI" },
  { key: "saas",     label: "SaaS" },
  { key: "web",      label: "Web" },
  { key: "tools",    label: "Tools" },
];

export const PROJECTS: Project[] = [
  {
    num: "01",
    name: "WISPLY",
    desc: "Telegram бот для транскрипції аудіо/відео в текст з AI-конспектом.",
    longDesc: "Підтримує YouTube, TikTok, Instagram Reels, голосові повідомлення, аудіо/відео файли. OpenAI Whisper для транскрипції, GPT для структурованого конспекту. Система тарифів зі Stripe та Telegram Stars, реферальна програма. Безкоштовно — 5 транскрипцій/місяць до 2 годин.",
    tags: ["Python", "OpenAI Whisper", "GPT-4o", "PostgreSQL", "Railway"],
    categories: ["telegram", "ai"],
    links: [{ url: "https://t.me/Wisply_bot", label: "Telegram бот" }],
    noUrlReason: null,
  },
  {
    num: "02",
    name: "ALLUMMA",
    desc: "Telegram Mini App для обліку особистих і бізнес-фінансів з AI-аналізом чеків.",
    longDesc: "Multi-tenant архітектура: кілька гаманців, спільний доступ. Фото чека → Claude AI парсить суму, категорію, дату. Повна аналітика витрат з графіками та фільтрами. Telegram initData автентифікація без паролів. Доступний як веб-сайт і Telegram Mini App.",
    tags: ["React", "Fastify", "Prisma", "Claude AI", "Railway"],
    categories: ["telegram", "ai"],
    links: [
      { url: "https://www.allumma.app/", label: "allumma.app" },
      { url: "https://t.me/Allumma_bot", label: "Mini App" },
    ],
    noUrlReason: null,
  },
  {
    num: "03",
    name: "SOCIAL ORGANIZER",
    desc: "Координаційний додаток взаємної підтримки. Веб, Mini App і Android у Google Play.",
    longDesc: "Платформа для організації взаємної підтримки між учасниками спільноти. Веб-версія, Telegram Mini App і Android APK (Capacitor) в Google Play. Система завдань, підтверджень і рейтингів. Локалізація ru/en. CI/CD через Railway.",
    tags: ["React 19", "Fastify", "Prisma", "Capacitor", "Railway"],
    categories: ["web"],
    links: [
      { url: "https://www.orginizer.com/", label: "orginizer.com" },
      { url: "https://t.me/socialorganizer_bot", label: "Mini App" },
      { url: "https://play.google.com/store/apps/details?id=com.socialorganizer.app", label: "Google Play" },
    ],
    noUrlReason: null,
  },
  {
    num: "04",
    name: "POWERINSIDE",
    desc: "AI-платформа для коучингу у силових видах спорту з AI-інтерв'ю тренерів.",
    longDesc: "Тренери проходять AI-інтерв'ю (Claude): методика, спеціалізація, досвід → формується профіль. Атлети задають питання — AI відповідає від імені тренера. Stripe-оплата підписки. Next.js App Router + tRPC end-to-end type safety. Доступний як веб і Telegram Mini App.",
    tags: ["Next.js", "tRPC", "Prisma", "Claude AI", "Stripe"],
    categories: ["ai", "saas"],
    links: [
      { url: "https://powerinside.app/", label: "powerinside.app" },
      { url: "https://t.me/powerinsideapp_bot", label: "Mini App" },
    ],
    noUrlReason: null,
  },
  {
    num: "05",
    name: "TG LEADS PARSER",
    desc: "Мультитенантний SaaS-парсер лідів з Telegram-чатів з Mini App для управління.",
    longDesc: "Підключення власних Telegram-акаунтів через Telethon. Парсинг за ключовими словами, часом, активністю. Фільтрація дублікатів, експорт контактів. Mini App для управління задачами парсингу. SaaS-тарифи з лімітами по чатах і контактах.",
    tags: ["FastAPI", "Telethon", "React", "PostgreSQL", "Railway"],
    categories: ["telegram", "saas"],
    links: [
      { url: "https://t.me/tgleadsparser_bot", label: "Telegram бот / Mini App" },
    ],
    noUrlReason: null,
  },
  {
    num: "06",
    name: "BOOKING AI",
    desc: "AI-букер для фотомоделей: автовідповіді на сайтах агентств через Grok AI.",
    longDesc: "Playwright автоматизує браузерні профілі AdsPower для кожної моделі. Grok AI генерує відповіді фотографам у контексті переписки. Telegram-бот для менеджера з апрувом кожного повідомлення. Tracking знімок. Watchdog процес на Windows Server. Mini App для моделей і клієнтів.",
    tags: ["Node.js", "Playwright", "Grammy", "Grok AI"],
    categories: ["ai"],
    links: [
      { url: "https://lambertain.agency", label: "lambertain.agency" },
      { url: "https://t.me/lambertain_bot", label: "Mini App" },
    ],
    noUrlReason: null,
  },
  {
    num: "07",
    name: "ZENNOSHOP",
    desc: "E-commerce магазин шаблонів ZennoPoster з Cloudflare R2 та Stripe.",
    longDesc: "Каталог шаблонів для автоматизації ZennoPoster/ZennoLab. Cloudflare R2 для зберігання файлів, захищені підписані URL для завантаження після оплати. Stripe Checkout + webhooks. Admin-панель для управління продуктами і замовленнями. Також доступний як Telegram Mini App.",
    tags: ["Next.js", "Prisma", "Tailwind", "Cloudflare R2", "Stripe"],
    categories: ["web", "saas"],
    links: [
      { url: "https://www.zennotemplates.com/", label: "zennotemplates.com" },
      { url: "https://t.me/zennotemplates_bot", label: "Mini App" },
    ],
    noUrlReason: null,
  },
  {
    num: "08",
    name: "FRESHFLIX",
    desc: "Chrome/Edge розширення для Netflix: TMDB-рейтинги та метадані прямо на сторінці.",
    longDesc: "Відображає рейтинг TMDB, жанри, рік, опис прямо на сторінці перегляду Netflix без переходів. Manifest V3, content scripts з Shadow DOM ізоляцією стилів. Автоматичний пошук за назвою та роком для точних збігів. Опубліковано в Chrome Web Store.",
    tags: ["JavaScript", "Chrome Extension", "Manifest V3", "TMDB API"],
    categories: ["tools"],
    links: [
      { url: "https://chromewebstore.google.com/detail/freshflix/dglagjjecpiliellfdcekmaekalfgldc", label: "Chrome Web Store" },
    ],
    noUrlReason: null,
  },
  {
    num: "09",
    name: "BAS DASHBOARD",
    desc: "Аналітичний дашборд для BAS/1C з візуалізацією продажів і бізнес-метрик.",
    longDesc: "Веб-застосунок для аналітики бізнесу на базі даних BAS/1C. Recharts для інтерактивних графіків і чартів продажів. Next.js 16 + React 19, Tailwind CSS 4. Авторизація, фільтри по датах і підрозділах, експорт звітів. Розгорнуто на Railway.",
    tags: ["Next.js 16", "React 19", "Recharts", "Tailwind", "Railway"],
    categories: ["web", "saas"],
    links: [
      { url: "https://bas-dashboard-production.up.railway.app/", label: "bas-dashboard" },
    ],
    noUrlReason: null,
  },
  {
    num: "10",
    name: "GOLDEN PEOPLE",
    desc: "SaaS-платформа з AI-підбором людей і Stripe-підпискою.",
    longDesc: "Full-stack Next.js 14 платформа для пошуку і підбору людей. NextAuth v4 з Google OAuth і Credentials. Anthropic Claude Haiku для AI-функцій. Stripe для оплати підписок. Prisma 7 + PostgreSQL. Framer Motion анімації. Захищені профілі, зашифровані паролі.",
    tags: ["Next.js 14", "Prisma", "Claude AI", "Stripe", "PostgreSQL"],
    categories: ["web", "saas", "ai"],
    links: [
      { url: "https://goppl.org/", label: "goppl.org" },
    ],
    noUrlReason: null,
  },
  {
    num: "11",
    name: "L-SCHOOL",
    desc: "Освітня платформа з курсами, уроками і Telegram Mini App для навчання.",
    longDesc: "Повноцінна LMS-платформа для онлайн-навчання. Веб-сайт, Telegram Mini App і Android-застосунок у Google Play. Курси, уроки, домашні завдання, відстеження прогресу. Реєстрація та авторизація, особистий кабінет учня.",
    tags: ["React", "Node.js", "PostgreSQL", "Capacitor", "Railway"],
    categories: ["web", "saas"],
    links: [
      { url: "https://www.l-school.app/", label: "l-school.app" },
      { url: "https://t.me/L_School_bot", label: "Mini App" },
    ],
    noUrlReason: null,
  },
  {
    num: "12",
    name: "KABANCHIK MONITOR",
    desc: "Chrome-розширення для моніторингу фріланс-замовлень на Kabanchik.ua з Telegram-сповіщеннями.",
    longDesc: "Автоматично відстежує нові замовлення на Kabanchik.ua у вибраних категоріях. Фільтрація за стоп-словами, захист від дублікатів, авто-очищення через 7 днів. Миттєві сповіщення в Telegram через бот. Налаштовуваний інтервал перевірки.",
    tags: ["JavaScript", "Chrome Extension", "Telegram Bot API"],
    categories: ["tools"],
    links: [],
    noUrlReason: "Ссилка буде пізніше",
  },
  {
    num: "13",
    name: "OLX PARSER",
    desc: "Chrome-розширення для збору контактів з OLX.ua з пакетним експортом у Excel/TXT.",
    longDesc: "Manifest V3 розширення для Chrome. Збирає імена, телефони, тип оголошення з будь-якої категорії OLX.ua. Підтримка фільтрів, автоматична пагінація, вибір кількості (100-1000). Паралельні запити батчами по 300мс для швидкості. Експорт у CSV/Excel і TXT.",
    tags: ["JavaScript", "Chrome Extension", "Manifest V3", "CSV Export"],
    categories: ["tools"],
    links: [],
    noUrlReason: "Ссилка буде пізніше",
  },
  {
    num: "15",
    name: "CHATIV",
    desc: "White-label SaaS-платформа для AI-агентів у Instagram, Telegram і WhatsApp.",
    longDesc: "Multi-tenant платформа для автоматизації чатів з клієнтами через AI. Агенти навчаються на базі знань бізнесу, відповідають 24/7. Омніканальність: Instagram DM, Telegram, WhatsApp. Ескалація на живого оператора з Telegram-сповіщеннями. White-label: кожен тенант отримує власний брендований простір.",
    tags: ["Next.js", "NestJS", "LangChain", "PostgreSQL", "AWS", "BullMQ"],
    categories: ["ai", "saas"],
    links: [
      { url: "https://chativ.app", label: "chativ.app" },
    ],
    noUrlReason: null,
  },
  {
    num: "14",
    name: "PATTERNSHIFT",
    desc: "Веб-платформа та Telegram Mini App для роботи з патернами і шаблонами.",
    longDesc: "Повноцінний веб-застосунок з Telegram Mini App. Зберігання, пошук і управління патернами. Адаптивний інтерфейс, авторизація користувачів, особистий кабінет. Розгорнуто на Railway.",
    tags: ["React", "Node.js", "PostgreSQL", "Railway"],
    categories: ["web", "saas"],
    links: [
      { url: "https://www.patternshift.app/", label: "patternshift.app" },
      { url: "https://t.me/Pattern_shift_bot", label: "Mini App" },
    ],
    noUrlReason: null,
  },
];

export const STACK = [
  {
    label: "Frontend",
    items: ["React / React 19", "Next.js 16", "Vite + TypeScript", "Tailwind CSS", "Telegram Mini Apps", "React Native / Capacitor"],
  },
  {
    label: "Backend",
    items: ["Node.js / Fastify", "Python / FastAPI", "tRPC", "Prisma ORM", "PostgreSQL", "SQLAlchemy"],
  },
  {
    label: "AI & Bots",
    items: ["Claude / Anthropic SDK", "OpenAI / Whisper", "Grok AI", "Telegram Bot API", "aiogram / Grammy", "Telethon / Pyrogram"],
  },
  {
    label: "Infra & Tools",
    items: ["Docker / Compose", "Railway / Synology NAS", "Cloudflare Tunnels / R2", "Turborepo / pnpm", "Stripe / Telegram Stars", "GitHub Actions"],
  },
];

export const MARQUEE_ITEMS = [
  "Python", "React", "Next.js", "Node.js", "FastAPI", "Prisma",
  "PostgreSQL", "Docker", "Railway", "Telegram Bot API",
  "OpenAI Whisper", "Claude AI", "Cloudflare", "tRPC", "Turborepo", "Stripe",
];
