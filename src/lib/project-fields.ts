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
};

const url = (uk: string, ru: string, en: string): FieldSub => ({ key: "url", label: { uk, ru, en }, kind: "url" });
const login: FieldSub = { key: "login", label: { uk: "Логін", ru: "Логин", en: "Login" }, kind: "text" };
const pass: FieldSub = { key: "pass", label: { uk: "Пароль", ru: "Пароль", en: "Password" }, kind: "secret" };

export const PROJECT_FIELD_DEFS: ProjectFieldDef[] = [
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
];

export function getFieldDef(key: string): ProjectFieldDef | undefined {
  return PROJECT_FIELD_DEFS.find((f) => f.key === key);
}
