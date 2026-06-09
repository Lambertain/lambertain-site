/**
 * Валидация Telegram Mini App initData по официальной схеме.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * Server-side only.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface TgUser {
  id: number;
  firstName: string;
  username?: string;
}

export interface InitDataResult {
  user: TgUser;
  startParam?: string;
  authDate: number;
}

const MAX_AGE_SEC = 60 * 60 * 24; // initData считаем валидным сутки

/** Проверяет подпись initData и возвращает пользователя, либо null. */
export function validateInitData(initData: string): InitDataResult | null {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  if (!initData || !token) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  const computed = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (computed.length !== hash.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(computed), Buffer.from(hash))) return null;
  } catch {
    return null;
  }

  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate || Math.floor(Date.now() / 1000) - authDate > MAX_AGE_SEC) return null;

  const userRaw = params.get("user");
  if (!userRaw) return null;
  let u: { id?: number; first_name?: string; username?: string };
  try {
    u = JSON.parse(userRaw);
  } catch {
    return null;
  }
  if (!u.id) return null;

  return {
    user: { id: u.id, firstName: u.first_name || "", username: u.username },
    startParam: params.get("start_param") || undefined,
    authDate,
  };
}
