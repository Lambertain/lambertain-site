/**
 * Реестр кастомных полей проекта (пополняется кодом — по запросу Никиты).
 * Поле включается в конкретный проект через селект в настройках (meta.enabledFields),
 * значения хранятся в meta.customFields[key], видимость — через meta.fieldVisibility (field-visibility.ts).
 * Чтобы добавить новое поле (напр. для нового клиента) — просто допиши запись сюда: оно сразу появится
 * в селекте во всех проектах. Постоянный `key` менять нельзя (по нему хранятся значения).
 */
type L = { uk: string; ru: string; en: string };

export type FieldSub = {
  key: string; // подполе (хранится в customFields[fieldKey][subKey])
  label: L;
  kind?: "text" | "url" | "secret"; // secret — пароль/токен (скрытый ввод)
};

export type ProjectFieldDef = {
  key: string; // постоянный ключ поля
  group: "hosting" | "social" | "messenger" | "analytics" | "access" | "other";
  label: L;
  subs: FieldSub[];
  /**
   * Поле «отражает» существующую структуру meta (НЕ хранится в customFields): значения живут в
   * meta.clientDeploy / meta.clientVercel — их читает логика деплоя. Реестр лишь даёт UI вкл/выкл + видимость.
   * Подполя такого поля = ключи соответствующей структуры meta.
   */
  backed?: "clientDeploy" | "clientVercel";
};

const url = (uk: string, ru: string, en: string): FieldSub => ({ key: "url", label: { uk, ru, en }, kind: "url" });
const login: FieldSub = { key: "login", label: { uk: "Логін", ru: "Логин", en: "Login" }, kind: "text" };
const pass: FieldSub = { key: "pass", label: { uk: "Пароль", ru: "Пароль", en: "Password" }, kind: "secret" };

export const PROJECT_FIELD_DEFS: ProjectFieldDef[] = [
  // Хостинг/деплой — значения «отражают» meta.clientDeploy / meta.clientVercel (логика деплоя не трогается).
  { key: "railway", group: "hosting", backed: "clientDeploy", label: { uk: "Railway (деплой)", ru: "Railway (деплой)", en: "Railway (deploy)" }, subs: [
    { key: "railwayToken", label: { uk: "Railway токен", ru: "Railway токен", en: "Railway token" }, kind: "secret" },
    { key: "projectId", label: { uk: "Project ID", ru: "Project ID", en: "Project ID" }, kind: "text" },
    { key: "environmentId", label: { uk: "Environment ID", ru: "Environment ID", en: "Environment ID" }, kind: "text" },
    { key: "serviceId", label: { uk: "Service ID (app)", ru: "Service ID (app)", en: "Service ID (app)" }, kind: "text" },
    { key: "pgServiceId", label: { uk: "Postgres Service ID", ru: "Postgres Service ID", en: "Postgres Service ID" }, kind: "text" },
  ] },
  { key: "vercel", group: "hosting", backed: "clientVercel", label: { uk: "Vercel (деплой)", ru: "Vercel (деплой)", en: "Vercel (deploy)" }, subs: [
    { key: "token", label: { uk: "Vercel токен", ru: "Vercel токен", en: "Vercel token" }, kind: "secret" },
    { key: "projectId", label: { uk: "Project ID", ru: "Project ID", en: "Project ID" }, kind: "text" },
    { key: "teamId", label: { uk: "Team ID", ru: "Team ID", en: "Team ID" }, kind: "text" },
  ] },
  { key: "facebook", group: "social", label: { uk: "Facebook", ru: "Facebook", en: "Facebook" }, subs: [url("Сторінка/URL", "Страница/URL", "Page/URL"), login, pass] },
  { key: "instagram", group: "social", label: { uk: "Instagram", ru: "Instagram", en: "Instagram" }, subs: [url("Профіль/URL", "Профиль/URL", "Profile/URL"), login, pass] },
  { key: "tiktok", group: "social", label: { uk: "TikTok", ru: "TikTok", en: "TikTok" }, subs: [url("Профіль/URL", "Профиль/URL", "Profile/URL"), login, pass] },
  { key: "youtube", group: "social", label: { uk: "YouTube", ru: "YouTube", en: "YouTube" }, subs: [url("Канал/URL", "Канал/URL", "Channel/URL"), login, pass] },
  { key: "whatsapp", group: "messenger", label: { uk: "WhatsApp", ru: "WhatsApp", en: "WhatsApp" }, subs: [{ key: "phone", label: { uk: "Номер", ru: "Номер", en: "Phone" }, kind: "text" }, { key: "note", label: { uk: "Нотатка", ru: "Заметка", en: "Note" }, kind: "text" }] },
  { key: "telegram", group: "messenger", label: { uk: "Telegram", ru: "Telegram", en: "Telegram" }, subs: [{ key: "handle", label: { uk: "@юзернейм/бот", ru: "@юзернейм/бот", en: "@username/bot" }, kind: "text" }, { key: "token", label: { uk: "Токен бота", ru: "Токен бота", en: "Bot token" }, kind: "secret" }] },
  { key: "viber", group: "messenger", label: { uk: "Viber", ru: "Viber", en: "Viber" }, subs: [{ key: "phone", label: { uk: "Номер", ru: "Номер", en: "Phone" }, kind: "text" }] },
  { key: "email", group: "access", label: { uk: "Email", ru: "Email", en: "Email" }, subs: [{ key: "address", label: { uk: "Адреса", ru: "Адрес", en: "Address" }, kind: "text" }, pass] },
  { key: "resend", group: "access", label: { uk: "Resend (пошта форм)", ru: "Resend (почта форм)", en: "Resend (form email)" }, subs: [
    { key: "apiKey", label: { uk: "API Key", ru: "API Key", en: "API Key" }, kind: "secret" },
    { key: "from", label: { uk: "From (адреса відправника)", ru: "From (адрес отправителя)", en: "From (sender address)" }, kind: "text" },
    { key: "managerInbox", label: { uk: "Email менеджера (куди заявки)", ru: "Email менеджера (куда заявки)", en: "Manager email (leads)" }, kind: "text" },
  ] },
  { key: "googleAnalytics", group: "analytics", label: { uk: "Google Analytics", ru: "Google Analytics", en: "Google Analytics" }, subs: [{ key: "id", label: { uk: "Measurement ID", ru: "Measurement ID", en: "Measurement ID" }, kind: "text" }] },
  // Trello — таск-трекер клиента (портал тянет/синкает задачи с доски). Нужен разработчику/порталу.
  { key: "trello", group: "other", label: { uk: "Trello", ru: "Trello", en: "Trello" }, subs: [
    { key: "key", label: { uk: "API Key", ru: "API Key", en: "API Key" }, kind: "secret" },
    { key: "token", label: { uk: "API Token", ru: "API Token", en: "API Token" }, kind: "secret" },
    { key: "board", label: { uk: "Дошка (ID/URL)", ru: "Доска (ID/URL)", en: "Board (ID/URL)" }, kind: "text" },
  ] },
  // Binotel — телефония клиента (REST API 4.0: история звонков + ссылки на записи). Нужен разработчику/порталу.
  { key: "binotel", group: "other", label: { uk: "Binotel (телефонія)", ru: "Binotel (телефония)", en: "Binotel (telephony)" }, subs: [
    { key: "key", label: { uk: "API Key", ru: "API Key", en: "API Key" }, kind: "secret" },
    { key: "secret", label: { uk: "API Secret", ru: "API Secret", en: "API Secret" }, kind: "secret" },
  ] },
  { key: "domain", group: "hosting", label: { uk: "Домен / реєстратор", ru: "Домен / регистратор", en: "Domain / registrar" }, subs: [url("Домен", "Домен", "Domain"), { key: "registrar", label: { uk: "Реєстратор", ru: "Регистратор", en: "Registrar" }, kind: "text" }, login, pass] },
  // AI / LLM ключі — потрібні розробнику локально (генерація, агенти). За замовчуванням видно лише розробнику (field-visibility).
  { key: "aiKeys", group: "access", label: { uk: "AI / LLM ключі", ru: "AI / LLM ключи", en: "AI / LLM keys" }, subs: [
    { key: "anthropic", label: { uk: "Anthropic API key", ru: "Anthropic API key", en: "Anthropic API key" }, kind: "secret" },
    { key: "openai", label: { uk: "OpenAI API key", ru: "OpenAI API key", en: "OpenAI API key" }, kind: "secret" },
    { key: "gemini", label: { uk: "Google Gemini API key", ru: "Google Gemini API key", en: "Google Gemini API key" }, kind: "secret" },
  ] },
  // Object storage (Cloudflare R2 / S3) — креди для завантажень/медіа, потрібні розробнику.
  { key: "objectStorage", group: "hosting", label: { uk: "Object storage (R2/S3)", ru: "Object storage (R2/S3)", en: "Object storage (R2/S3)" }, subs: [
    { key: "accountId", label: { uk: "Account ID", ru: "Account ID", en: "Account ID" }, kind: "text" },
    { key: "accessKeyId", label: { uk: "Access Key ID", ru: "Access Key ID", en: "Access Key ID" }, kind: "secret" },
    { key: "secretAccessKey", label: { uk: "Secret Access Key", ru: "Secret Access Key", en: "Secret Access Key" }, kind: "secret" },
    { key: "bucket", label: { uk: "Bucket", ru: "Bucket", en: "Bucket" }, kind: "text" },
    { key: "endpoint", label: { uk: "Endpoint (S3 API)", ru: "Endpoint (S3 API)", en: "Endpoint (S3 API)" }, kind: "text" },
    { key: "publicUrl", label: { uk: "Public URL", ru: "Public URL", en: "Public URL" }, kind: "url" },
  ] },
  // Cloudflare — акаунтний інфра-креденшел (зони/DNS/R2/токени). Спільний на аккаунт, тримаємо в реєстрі.
  { key: "cloudflare", group: "hosting", label: { uk: "Cloudflare (API)", ru: "Cloudflare (API)", en: "Cloudflare (API)" }, subs: [
    { key: "accountId", label: { uk: "Account ID", ru: "Account ID", en: "Account ID" }, kind: "text" },
    { key: "apiToken", label: { uk: "API Token", ru: "API Token", en: "API Token" }, kind: "secret" },
    { key: "globalKey", label: { uk: "Global API Key", ru: "Global API Key", en: "Global API Key" }, kind: "secret" },
    { key: "email", label: { uk: "Акаунт (email)", ru: "Аккаунт (email)", en: "Account (email)" }, kind: "text" },
  ] },
  // PlayFab — бекенд гри (каталог, промокоди/купони, інвентар підписок). Потрібен розробнику для монетизації.
  { key: "playfab", group: "other", label: { uk: "PlayFab", ru: "PlayFab", en: "PlayFab" }, subs: [
    { key: "titleId", label: { uk: "Title ID", ru: "Title ID", en: "Title ID" }, kind: "text" },
    { key: "secretKey", label: { uk: "Secret Key (Admin/Server)", ru: "Secret Key (Admin/Server)", en: "Secret Key (Admin/Server)" }, kind: "secret" },
  ] },
  // Вчасно.Каса — ПРРО/фіскалізація: токен API каси для видачі фіскальних чеків (напр. онлайн-оплати). Потрібен розробнику/бекенду.
  { key: "vchasnoKasa", group: "other", label: { uk: "Вчасно.Каса (ПРРО)", ru: "Вчасно.Касса (ПРРО)", en: "Vchasno.Kasa (fiscal)" }, subs: [
    { key: "token", label: { uk: "Токен каси (API)", ru: "Токен кассы (API)", en: "Kasa token (API)" }, kind: "secret" },
  ] },
];

export function getFieldDef(key: string): ProjectFieldDef | undefined {
  return PROJECT_FIELD_DEFS.find((f) => f.key === key);
}

// ——— Цели сбора данных гайдом (клиент вписывает значение в поле под гайдом → сохраняется в настройки проекта) ———
export type CollectTarget = { value: string; label: L; kind: "text" | "url" | "secret" };

/** Плоский список целей сбора: спец. `clientGit` + каждое подполе каталога как `fieldKey.subKey`. */
export function collectTargets(): CollectTarget[] {
  const out: CollectTarget[] = [
    { value: "clientGit", label: { uk: "Посилання на репозиторій (Git)", ru: "Ссылка на репозиторий (Git)", en: "Repository link (Git)" }, kind: "url" },
  ];
  for (const f of PROJECT_FIELD_DEFS) {
    for (const s of f.subs) {
      out.push({
        value: `${f.key}.${s.key}`,
        label: { uk: `${f.label.uk} · ${s.label.uk}`, ru: `${f.label.ru} · ${s.label.ru}`, en: `${f.label.en} · ${s.label.en}` },
        kind: s.kind ?? "text",
      });
    }
  }
  return out;
}

/** Резолв цели сбора по строке `collect_field` гайда / `clientActionField` задачи (лейбл + тип инпута у клиента). */
export function collectTarget(value: string | null | undefined): CollectTarget | undefined {
  if (!value) return undefined;
  return collectTargets().find((t) => t.value === value);
}

// ——— Валидация значений, которые вписывает клиент (жёсткая: неверный формат → сохранить нельзя) ———
// Модуль чистый (без server-only импортов) → используется и на клиенте (ClientActionBar), и на сервере.
// Ключ правила — точная цель сбора (`clientGit` | `fieldKey.subKey`); фолбэк — по `kind` подполя.
type Validator = { test: (v: string) => boolean; hint: string };

const reUrl = /^https?:\/\/[^\s]+\.[^\s]{2,}/i;
const reGit = /^(https?:\/\/[^\s]+|git@[^\s:]+:[^\s]+)$/i; // https://… или git@host:path
const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const reTgToken = /^\d{6,12}:[A-Za-z0-9_-]{30,}$/;   // 123456789:AA...(~35)
const reGaId = /^(G|GT|UA|AW)-[A-Z0-9-]+$/i;         // Measurement/Ads ID
const rePhone = /^\+?\d[\d\s()-]{6,}$/;

// Точечные форматы (важные — то, что нельзя перепутать: токены/ключи/ссылки/почта).
const BY_TARGET: Record<string, Validator> = {
  "clientGit": { test: (v) => reGit.test(v), hint: "посилання на git-репозиторій (https://… або git@…)" },
  "telegram.token": { test: (v) => reTgToken.test(v), hint: "токен бота виду 123456789:AA… (цифри, двокрапка, ~35 символів)" },
  "telegram.handle": { test: (v) => /^@?[A-Za-z0-9_]{4,}$/.test(v), hint: "@юзернейм (латиниця, цифри, підкреслення)" },
  "resend.apiKey": { test: (v) => /^re_[A-Za-z0-9_]{10,}$/.test(v), hint: "ключ Resend виду re_…" },
  "resend.from": { test: (v) => reEmail.test(v), hint: "email-адреса відправника" },
  "resend.managerInbox": { test: (v) => reEmail.test(v), hint: "email-адреса" },
  "email.address": { test: (v) => reEmail.test(v), hint: "email-адреса" },
  "cloudflare.email": { test: (v) => reEmail.test(v), hint: "email-адреса акаунта" },
  "googleAnalytics.id": { test: (v) => reGaId.test(v), hint: "Measurement ID виду G-XXXXXXX" },
  "whatsapp.phone": { test: (v) => rePhone.test(v), hint: "номер телефону" },
  "viber.phone": { test: (v) => rePhone.test(v), hint: "номер телефону" },
};

// Фолбэк по типу подполя.
const BY_KIND: Record<string, Validator> = {
  url: { test: (v) => reUrl.test(v), hint: "посилання виду https://…" },
  secret: { test: (v) => v.trim().length > 0 && !/\s/.test(v), hint: "токен/ключ без пробілів" },
  text: { test: (v) => v.trim().length > 0, hint: "не порожнє значення" },
};

function ruleFor(targetValue: string, kind: string): Validator {
  return BY_TARGET[targetValue] ?? BY_KIND[kind] ?? BY_KIND.text;
}

/** Подсказка ожидаемого формата для поля (показываем клиенту под инпутом). */
export function collectHint(targetValue: string, kind: string): string {
  return ruleFor(targetValue, kind).hint;
}

/** Проверка значения. Возвращает текст ошибки (укр., клиенту) или null, если формат верный / значение пустое. */
export function validateCollectValue(targetValue: string, kind: string, value: string): string | null {
  const v = (value ?? "").trim();
  if (!v) return null; // пустое — не «неверный формат»; обязательность обеспечивает UI (кнопка выключена)
  const rule = ruleFor(targetValue, kind);
  return rule.test(v) ? null : `Невірний формат — очікується ${rule.hint}.`;
}

