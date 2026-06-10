/**
 * Одноразовые инвайты: привязка Telegram-пользователя к YouTrack-логину и роли.
 * Server-side only.
 */
import { randomBytes } from "node:crypto";
import { createInvite, getInvite, markInviteUsed, upsertLink } from "./db";
import type { Role } from "./tasks/types";
import type { TgUser } from "./telegram-auth";

const DEFAULT_TTL_HOURS = 72;

/** Создать инвайт, вернуть токен и готовую ссылку для Telegram Mini App. */
export async function generateInvite(
  youtrackLogin: string,
  role: Role,
  ttlHours = DEFAULT_TTL_HOURS,
): Promise<{ token: string; link: string }> {
  const token = randomBytes(16).toString("hex");
  await createInvite(token, youtrackLogin, role, ttlHours);
  return { token, link: inviteLink(token) };
}

export function inviteLink(token: string): string {
  const bot = process.env.TELEGRAM_BOT_USERNAME || "<bot>";
  const app = process.env.TELEGRAM_MINIAPP_SHORTNAME || "";
  // Именованная мини-апп, если задан shortname; иначе Main Mini App (?startapp=).
  return app
    ? `https://t.me/${bot}/${app}?startapp=${token}`
    : `https://t.me/${bot}?startapp=${token}`;
}

/**
 * Применить инвайт для Telegram-пользователя.
 * Возвращает true при успехе (связка создана), false — инвайт невалиден.
 */
export async function redeemInvite(token: string, user: TgUser): Promise<boolean> {
  const inv = await getInvite(token);
  if (!inv) return false;
  if (inv.used_at) return false;
  if (new Date(inv.expires_at).getTime() < Date.now()) return false;

  await upsertLink({
    tg_id: user.id,
    youtrack_login: inv.youtrack_login,
    role: inv.role,
    full_name: user.firstName || user.username || inv.youtrack_login,
  });
  await markInviteUsed(token, user.id);
  return true;
}
