/**
 * Одноразовые инвайты: привязка Telegram-пользователя к роли.
 * Логин участника формируется из Telegram-личности (username или tg<id>).
 * Server-side only.
 */
import { randomBytes } from "node:crypto";
import { createInvite, getInvite, markInviteUsed, upsertLink, upsertMember, setDevProjects, setMemberProjects } from "./db";
import { notifyAdmin } from "./notify";
import type { Role } from "./tasks/types";
import type { TgUser } from "./telegram-auth";

const ROLE_RU: Record<string, string> = { client: "клиент", contributor: "разработчик", employee: "сотрудник", admin: "админ", unknown: "—" };

const DEFAULT_TTL_HOURS = 72;

/** Логин участника из Telegram-личности. */
export function memberLogin(user: TgUser): string {
  return user.username ? user.username.toLowerCase() : `tg${user.id}`;
}

/** Создать инвайт под роль и набор проектов, вернуть токен и ссылку для Mini App. */
export async function generateInvite(
  role: Role,
  projectKeys: string[],
  ttlHours = DEFAULT_TTL_HOURS,
): Promise<{ token: string; link: string }> {
  const token = randomBytes(16).toString("hex");
  await createInvite(token, "", role, ttlHours, projectKeys);
  return { token, link: inviteLink(token) };
}

export function inviteLink(token: string): string {
  const bot = process.env.TELEGRAM_BOT_USERNAME || "<bot>";
  const app = process.env.TELEGRAM_MINIAPP_SHORTNAME || "";
  return app ? `https://t.me/${bot}/${app}?startapp=${token}` : `https://t.me/${bot}?startapp=${token}`;
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
  await markInviteUsed(token, user.id);
  await notifyAdmin(
    `✅ <b>${fullName}</b> присоединился по приглашению\n` +
      `Роль: ${ROLE_RU[inv.role] || inv.role}${keys.length ? ` · проекты: ${keys.join(", ")}` : ""}\n` +
      `Логин: @${login}`,
  );
  return true;
}
