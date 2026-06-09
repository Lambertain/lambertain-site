/**
 * Единая сессия для веба и Telegram Mini App.
 * Кука хранит "субъект" (web | tg:<id>), подписанный HMAC-SHA256 на SESSION_SECRET.
 * Роль/личность субъекта резолвится в principal.ts.
 * Server-side only.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "pm_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 дней

function sign(payload: string): string {
  const secret = process.env.SESSION_SECRET || "";
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Подписанный токен сессии для субъекта ("web" | "tg:<id>"). */
export function createToken(subject: string): string {
  const payload = `${subject}.${Math.floor(Date.now() / 1000)}`;
  return `${payload}.${sign(payload)}`;
}

/** Проверить токен, вернуть субъект или null. */
export function verifyToken(token: string | undefined): string | null {
  if (!token) return null;
  const idx = token.lastIndexOf(".");
  if (idx < 0) return null;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  const dot = payload.lastIndexOf(".");
  return dot < 0 ? null : payload.slice(0, dot);
}

/** Проверка пароля при веб-логине администратора. */
export function checkPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected || !password) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function readSubject(): Promise<string | null> {
  const store = await cookies();
  return verifyToken(store.get(SESSION_COOKIE)?.value);
}

export async function setSession(subject: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, createToken(subject), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
