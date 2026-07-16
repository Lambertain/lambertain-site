/**
 * Одноразовые инвайты: привязка Telegram-пользователя к роли.
 * Логин участника формируется из Telegram-личности (username или tg<id>).
 * Server-side only.
 */
import { randomBytes } from "node:crypto";
import { createInvite, getInvite, markInviteUsed, upsertLink, upsertMember, setDevProjects, setMemberProjects, setProjectShowOnboarding, setProjectOnboardingSet, deleteAccessRequest, reassignNullReporterToClient, getLinkRoleByTgId } from "./db";
import { notifyAdmin, notifyLogins } from "./notify";
import { notifyProjectOnboarding } from "./onboarding-notify";
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
  // ЗАЩИТА от перетирания роли: если tg-пользователь УЖЕ привязан с реальной ролью — инвайт НЕ меняет её,
  // только добавляет проект. Иначе клиент, случайно кликнув чужой (employee/contributor) инвайт, слетал с роли
  // client → employee. Легитимная смена роли — только через админ-UI «Команда» (changeUserRole).
  const existing = await getLinkRoleByTgId(user.id);
  const REAL: Role[] = ["client", "contributor", "employee", "admin"];
  const role: Role = existing && REAL.includes(existing) ? existing : inv.role;
  await upsertMember(login, fullName, role, user.id);
  // tg_links.project_key — primary; полный набор проектов — в member_projects (клиент/сотрудник — несколько); разработчик — ответственный на всех выбранных.
  await upsertLink({ tg_id: user.id, youtrack_login: login, role, full_name: fullName, project_key: keys[0] ?? null });
  if (role === "contributor" && keys.length) await setDevProjects(login, keys);
  if ((role === "employee" || role === "client") && keys.length) await setMemberProjects(login, keys); // несколько проектов
  // Клиент привязался к клиентским проектам → задачи, поставленные мной (kickoff/от меня), переводим на него постановщиком — по каждому проекту.
  if (role === "client") for (const k of keys) await reassignNullReporterToClient(k).catch(() => {});
  // Клиент с флагом онбординга — пометить его проект, чтобы показать инструкцию при входе.
  if (role === "client" && inv.show_onboarding && keys[0]) await setProjectShowOnboarding(keys[0], true);
  // Клиент с привязанным набором инструкций — показать его при входе (баннер на /i/<token>).
  if (role === "client" && inv.instruction_set_token && keys[0]) await setProjectOnboardingSet(keys[0], inv.instruction_set_token);
  await markInviteUsed(token, user.id);
  // Если у человека висела заявка на доступ — он уже вошёл по инвайту, заявку убираем (иначе дубль в «Команде»).
  await deleteAccessRequest(user.id).catch(() => {});
  const roleKept = existing && REAL.includes(existing) && existing !== inv.role;
  await notifyAdmin(
    `✅ <b>${fullName}</b> приєднався за запрошенням\n` +
      `Роль: ${ROLE_RU[role] || role}${roleKept ? ` (інвайт був на «${ROLE_RU[inv.role] || inv.role}», але роль збережено — вже привʼязаний)` : ""}${keys.length ? ` · проєкти: ${keys.join(", ")}` : ""}\n` +
      `Логін: @${login}`,
  );
  // Приветствие новому участнику — любой роли, на локали его устройства.
  const loc = normalizeLocale(user.languageCode) || DEFAULT_LOCALE;
  await notifyLogins([login], t(loc, "welcome.joined", { role: t(loc, `role.${role}`) })).catch(() => {});
  // Онбординг по проектам: разработчику — сколько задач в работе; клиенту/сотруднику — что уже выполнено
  // (если задачи закрыли до его добавления — иначе он этого не увидит).
  if (keys.length) await notifyProjectOnboarding(login, role, keys).catch(() => {});
  return true;
}
