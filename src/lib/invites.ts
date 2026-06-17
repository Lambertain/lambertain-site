/**
 * Одноразовые инвайты: привязка Telegram-пользователя к роли.
 * Логин участника формируется из Telegram-личности (username или tg<id>).
 * Server-side only.
 */
import { randomBytes } from "node:crypto";
import { createInvite, getInvite, markInviteUsed, upsertLink, upsertMember, setDevProjects, setMemberProjects, setProjectShowOnboarding, setProjectOnboardingSet, deleteAccessRequest } from "./db";
import { notifyAdmin, notifyLogins } from "./notify";
import { t, normalizeLocale, DEFAULT_LOCALE } from "./i18n";
import type { Role } from "./tasks/types";
import type { TgUser } from "./telegram-auth";

const ROLE_RU: Record<string, string> = { client: "клиент", contributor: "разработчик", employee: "сотрудник", admin: "админ", unknown: "—" };

const DEFAULT_TTL_HOURS = 24 * 30; // месяц — чтобы приглашённые успевали принять

/** Логин участника из Telegram-личности. */
export function memberLogin(user: TgUser): string {
  return user.username ? user.username.toLowerCase() : `tg${user.id}`;
}

/** Создать инвайт под роль и набор проектов, вернуть токен и ссылку для Mini App. */
export async function generateInvite(
  role: Role,
  projectKeys: string[],
  ttlHours = DEFAULT_TTL_HOURS,
  showOnboarding = false,
  instructionSetToken: string | null = null,
): Promise<{ token: string; link: string }> {
  const token = randomBytes(16).toString("hex");
  await createInvite(token, "", role, ttlHours, projectKeys, showOnboarding, instructionSetToken);
  return { token, link: inviteLink(token) };
}

export function inviteLink(token: string): string {
  const bot = process.env.TELEGRAM_BOT_USERNAME || "<bot>";
  const app = process.env.TELEGRAM_MINIAPP_SHORTNAME || "";
  return app ? `https://t.me/${bot}/${app}?startapp=${token}` : `https://t.me/${bot}?startapp=${token}`;
}

/** Ссылка на бриф через Mini App: клиент авторизуется в боте → попадает как лид с tg-контактом. */
export function briefLink(token: string): string {
  return inviteLink(`brief-${token}`);
}

/** Применить инвайт: создать участника и связку. true при успехе. */
export async function redeemInvite(token: string, user: TgUser): Promise<boolean> {
  const inv = await getInvite(token);
  if (!inv || inv.used_at) return false;
  if (new Date(inv.expires_at).getTime() < Date.now()) return false;

  const login = memberLogin(user);
  const fullName = user.firstName || user.username || login;
  const keys = (inv.project_keys || inv.project_key || "").split(",").map((k) => k.trim()).filter(Boolean);
  await upsertMember(login, fullName, inv.role, user.id);
  // Клиент/сотрудник привязан к одному проекту (project_key); разработчик — ответственный на всех выбранных.
  await upsertLink({ tg_id: user.id, youtrack_login: login, role: inv.role, full_name: fullName, project_key: keys[0] ?? null });
  if (inv.role === "contributor" && keys.length) await setDevProjects(login, keys);
  if (inv.role === "employee" && keys.length) await setMemberProjects(login, keys); // сотрудник — несколько проектов
  // Клиент с флагом онбординга — пометить его проект, чтобы показать инструкцию при входе.
  if (inv.role === "client" && inv.show_onboarding && keys[0]) await setProjectShowOnboarding(keys[0], true);
  // Клиент с привязанным набором инструкций — показать его при входе (баннер на /i/<token>).
  if (inv.role === "client" && inv.instruction_set_token && keys[0]) await setProjectOnboardingSet(keys[0], inv.instruction_set_token);
  await markInviteUsed(token, user.id);
  // Если у человека висела заявка на доступ — он уже вошёл по инвайту, заявку убираем (иначе дубль в «Команде»).
  await deleteAccessRequest(user.id).catch(() => {});
  await notifyAdmin(
    `✅ <b>${fullName}</b> присоединился по приглашению\n` +
      `Роль: ${ROLE_RU[inv.role] || inv.role}${keys.length ? ` · проекты: ${keys.join(", ")}` : ""}\n` +
      `Логин: @${login}`,
  );
  // Приветствие новому участнику — любой роли, на локали его устройства.
  const loc = normalizeLocale(user.languageCode) || DEFAULT_LOCALE;
  await notifyLogins([login], t(loc, "welcome.joined", { role: t(loc, `role.${inv.role}`) })).catch(() => {});
  return true;
}
