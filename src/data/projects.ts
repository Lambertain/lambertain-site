export type ProjectCategory = "all" | "telegram" | "ai" | "saas" | "web" | "tools";

export interface Project {
  num: string;
  name: string;
  desc: string;
  longDesc: string;
  tags: string[];
  categories: Exclude<ProjectCategory, "all">[];
  url: string | null;
  urlLabel: string | null;
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
    longDesc: "Підтримує YouTube, TikTok, Instagram Reels, голосові повідомлення Telegram, аудіо/відео файли. OpenAI Whisper для транскрипції, GPT для структурованого конспекту. Система тарифів зі Stripe та Telegram Stars, реферальна програма. Безкоштовно — 5 транскрипцій/місяць до 2 годин.",
    tags: ["Python", "OpenAI Whisper", "GPT-4o", "PostgreSQL", "Railway"],
    categories: ["telegram", "ai"],
    url: null,
    urlLabel: null,
    noUrlReason: "Бот у закритому бета-доступі",
  },
  {
    num: "02",
    name: "ALLUMMA",
    desc: "Telegram Mini App для обліку особистих і бізнес-фінансів з AI-аналізом чеків.",
    longDesc: "Multi-tenant архітектура: кілька гаманців, спільний доступ. Фото чека → Claude AI парсить суму, категорію, дату. Повна аналітика витрат з графіками та фільтрами. Експорт у CSV. Telegram initData автентифікація без паролів.",
    tags: ["React", "Fastify", "Prisma", "Claude AI", "Railway"],
    categories: ["telegram", "ai"],
    url: null,
    urlLabel: null,
    noUrlReason: "Mini App у стадії розробки",
  },
  {
    num: "03",
    name: "SOCIAL ORGANIZER",
    desc: "Координаційний додаток взаємної підтримки. Android APK, опублікований у Google Play.",
    longDesc: "Платформа для організації колективної підтримки між учасниками. Веб-версія + Android APK (Capacitor). Система завдань, підтверджень і рейтингів. Localizations: ru/en. Повний CI/CD через Railway та Google Play Internal Testing.",
    tags: ["React 19", "Fastify", "Prisma", "Capacitor", "Railway"],
    categories: ["web"],
    url: "https://play.google.com/store/apps/details?id=com.socialorganizer.app",
    urlLabel: "Google Play",
    noUrlReason: null,
  },
  {
    num: "04",
    name: "POWERINSIDE",
    desc: "AI-платформа для коучингу у силових видах спорту з AI-інтерв'ю тренерів.",
    longDesc: "Тренери проходять AI-інтерв'ю (Claude): методика, спеціалізація, досвід → формується профіль. Атлети задають питання — AI відповідає від імені тренера на базі профілю. Stripe-оплата підписки. Next.js App Router + tRPC end-to-end type safety.",
    tags: ["Next.js", "tRPC", "Prisma", "Claude AI", "Stripe"],
    categories: ["ai", "saas"],
    url: null,
    urlLabel: null,
    noUrlReason: "Платформа у закритому доступі для клієнта",
  },
  {
    num: "05",
    name: "KETTLEBELL",
    desc: "Telegram Mini App для тренувань з готовими програмами і системою досягнень.",
    longDesc: "34 вправи, 10 готових програм тренувань різних рівнів. Трекер прогресу по підходах і повторах. Система досягнень і стриків. Монорепо Turborepo: @kb/db, @kb/shared, @kb/i18n. tRPC забезпечує повну типізацію між фронтом і беком.",
    tags: ["React", "Fastify", "tRPC", "Turborepo", "Railway"],
    categories: ["telegram"],
    url: null,
    urlLabel: null,
    noUrlReason: "Mini App у розробці",
  },
  {
    num: "06",
    name: "TG LEADS PARSER",
    desc: "Мультитенантний SaaS-парсер лідів з Telegram-чатів з Mini App для управління.",
    longDesc: "Підключення власних Telegram-акаунтів через Telethon. Парсинг за ключовими словами, часом, активністю. Фільтрація дублікатів, експорт контактів. Mini App для управління задачами парсингу. SaaS-тарифи з лімітами по чатах і контактах.",
    tags: ["FastAPI", "Telethon", "React", "PostgreSQL", "Railway"],
    categories: ["telegram", "saas"],
    url: null,
    urlLabel: null,
    noUrlReason: "SaaS у стадії MVP",
  },
  {
    num: "07",
    name: "BOOKING AI",
    desc: "AI-букер для фотомоделей: автовідповіді на сайтах агентств через Grok AI.",
    longDesc: "Playwright автоматизує браузерні профілі AdsPower для кожної моделі. Grok AI генерує відповіді фотографам у контексті переписки. Telegram-бот для менеджера з апрувом кожного повідомлення. Tracking знімок у PostgreSQL. Watchdog процес на Windows Server.",
    tags: ["Node.js", "Playwright", "Grammy", "Grok AI"],
    categories: ["ai"],
    url: null,
    urlLabel: null,
    noUrlReason: "Внутрішній інструмент агентства",
  },
  {
    num: "08",
    name: "SVITOVI STANDARTY",
    desc: "Корпоративна платформа управління стандартами. Генерація документів Word.",
    longDesc: "Динамічні поля через field_definitions: UKR/EN пари, різні типи (text, select, date). Генерація .docx через docxtemplater з кастомними шаблонами. Ролева модель: адмін, менеджер, перегляд. Docker Compose на Synology NAS + Cloudflare Tunnel. Захищений доступ через Zero Trust.",
    tags: ["Next.js", "Prisma", "PostgreSQL", "Docker", "Cloudflare"],
    categories: ["web", "saas"],
    url: "https://app.intlstandards.org",
    urlLabel: "intlstandards.org",
    noUrlReason: null,
  },
  {
    num: "09",
    name: "ECADEMY",
    desc: "Платформа автоматизації Meta Ads + CRM-інтеграції (NetHunt, AlfaCRM).",
    longDesc: "API-шлюз між рекламними кабінетами і CRM-системами. Webhook-обробник Lead Ads → автоматична передача лідів в NetHunt або AlfaCRM. Дашборд аналітики витрат і конверсій. Docker Compose деплой на VPS клієнта.",
    tags: ["FastAPI", "React", "PostgreSQL", "Docker"],
    categories: ["web", "saas"],
    url: null,
    urlLabel: null,
    noUrlReason: "Закрита платформа для клієнта",
  },
  {
    num: "10",
    name: "ZENNOSHOP",
    desc: "E-commerce магазин шаблонів ZennoPoster з Cloudflare R2 та Stripe.",
    longDesc: "Каталог шаблонів для автоматизації ZennoPoster/ZennoLab. Cloudflare R2 для зберігання файлів, захищені підписані URL для завантаження після оплати. Stripe Checkout + webhooks. Admin-панель для управління продуктами і замовленнями.",
    tags: ["Next.js", "Prisma", "Tailwind", "Cloudflare R2", "Stripe"],
    categories: ["web", "saas"],
    url: null,
    urlLabel: null,
    noUrlReason: "Магазин на паузі",
  },
  {
    num: "11",
    name: "FRESHFLIX",
    desc: "Chrome/Edge розширення для Netflix: TMDB-рейтинги та метадані на сторінці.",
    longDesc: "Відображає рейтинг TMDB, жанри, рік, опис прямо на сторінці перегляду Netflix без переходів. Manifest V3, content scripts з Shadow DOM ізоляцією стилів. Автоматичний пошук за назвою та роком для точних збігів.",
    tags: ["JavaScript", "Chrome Extension", "Manifest V3", "TMDB API"],
    categories: ["tools"],
    url: null,
    urlLabel: null,
    noUrlReason: "Розширення не опубліковано публічно",
  },
  {
    num: "12",
    name: "CODEX AURA",
    desc: "Python-бібліотека статичного аналізу залежностей коду через AST і Neo4j.",
    longDesc: "Аналізує Python-кодову базу: будує граф залежностей між модулями, класами, функціями через AST. Зберігає у Neo4j для Cypher-запитів. FastAPI сервер для візуалізації графу. Опублікована на PyPI. Корисна для рефакторингу великих проєктів.",
    tags: ["Python", "FastAPI", "Neo4j", "AST", "PyPI"],
    categories: ["tools", "ai"],
    url: "https://pypi.org/project/codex-aura/",
    urlLabel: "PyPI",
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
