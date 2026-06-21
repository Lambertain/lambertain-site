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
  { key: "googleAnalytics", group: "analytics", label: { uk: "Google Analytics", ru: "Google Analytics", en: "Google Analytics" }, subs: [{ key: "id", label: { uk: "Measurement ID", ru: "Measurement ID", en: "Measurement ID" }, kind: "text" }] },
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
];

export function getFieldDef(key: string): ProjectFieldDef | undefined {
  return PROJECT_FIELD_DEFS.find((f) => f.key === key);
}
