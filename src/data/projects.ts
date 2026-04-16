export interface Project {
  num: string;
  name: string;
  desc: string;
  tags: string[];
}

export const PROJECTS: Project[] = [
  {
    num: "01",
    name: "WISPLY",
    desc: "Telegram бот для транскрипції аудіо/відео в текст з AI-конспектом. Підтримка YouTube, TikTok, голосових повідомлень.",
    tags: ["Python", "OpenAI Whisper", "PostgreSQL", "Railway"],
  },
  {
    num: "02",
    name: "ALLUMMA",
    desc: "Telegram Mini App для обліку особистих і бізнес-фінансів з AI-аналізом чеків через Claude. Multi-tenant архітектура.",
    tags: ["React", "Fastify", "Prisma", "Claude AI", "Railway"],
  },
  {
    num: "03",
    name: "SOCIAL ORGANIZER",
    desc: "Координаційний додаток взаємної підтримки. Веб-застосунок і Android APK (Capacitor), опублікований у Google Play.",
    tags: ["React 19", "Fastify", "Prisma", "Capacitor", "Railway"],
  },
  {
    num: "04",
    name: "POWERINSIDE",
    desc: "AI-платформа для коучингу у силових видах спорту. AI-інтерв'ю тренерів, Q&A для атлетів, Stripe-оплата.",
    tags: ["Next.js", "tRPC", "Prisma", "Claude AI", "Stripe"],
  },
  {
    num: "05",
    name: "KETTLEBELL",
    desc: "Telegram Mini App для тренувань з готовими програмами і системою досягнень. Монорепо на Turborepo.",
    tags: ["React", "Fastify", "tRPC", "Turborepo", "Railway"],
  },
  {
    num: "06",
    name: "TG LEADS PARSER",
    desc: "Мультитенантний SaaS-парсер лідів з Telegram-чатів. Mini App для управління та фільтрації. SaaS-тарифи.",
    tags: ["FastAPI", "Telethon", "React", "PostgreSQL", "Railway"],
  },
  {
    num: "07",
    name: "BOOKING AI",
    desc: "AI-букер для фотомоделей: автоматична обробка вхідних повідомлень на сайтах, генерація відповідей через Grok AI.",
    tags: ["Node.js", "Playwright", "Grammy", "Grok AI"],
  },
  {
    num: "08",
    name: "SVITOVI STANDARTY",
    desc: "Корпоративна платформа управління стандартами. Генерація документів Word, ролева модель доступу, Cloudflare Tunnel.",
    tags: ["Next.js", "Prisma", "PostgreSQL", "Docker", "Cloudflare"],
  },
  {
    num: "09",
    name: "ECADEMY",
    desc: "Платформа автоматизації Meta Ads з CRM-інтеграціями (NetHunt, AlfaCRM). API-шлюз, webhook-обробник, аналітика.",
    tags: ["FastAPI", "React", "PostgreSQL", "Docker"],
  },
  {
    num: "10",
    name: "ZENNOSHOP",
    desc: "E-commerce магазин шаблонів ZennoPoster з Cloudflare R2 для файлів і Stripe-платежами.",
    tags: ["Next.js", "Prisma", "Tailwind", "Cloudflare R2"],
  },
  {
    num: "11",
    name: "FRESHFLIX",
    desc: "Chrome/Edge розширення для Netflix: TMDB-рейтинги та інформація про фільм прямо на сторінці перегляду.",
    tags: ["JavaScript", "Chrome Extension", "Manifest V3", "TMDB API"],
  },
  {
    num: "12",
    name: "CODEX AURA",
    desc: "Python-бібліотека для статичного аналізу залежностей коду через AST і Neo4j. Опублікована на PyPI.",
    tags: ["Python", "FastAPI", "Neo4j", "PyPI"],
  },
];

export const STACK = [
  {
    label: "Frontend",
    items: ["React / React 19", "Next.js 16", "Vite + TypeScript", "Tailwind CSS", "Telegram Mini Apps", "Capacitor (Android)"],
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
