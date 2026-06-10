/**
 * Единая личность пользователя для веба и Telegram Mini App.
 * Резолвится из сессионной куки (auth.ts) + связок в БД (db.ts).
 * Server-side only.
 */
import { cookies } from "next/headers";
import { readSubject } from "./auth";
import { getLinkByTgId } from "./db";
import type { Role } from "./tasks/types";

export interface Principal {
  source: "web" | "telegram";
  /** Эффективная роль (с учётом превью админа). */
  role: Role;
  /** Реальная роль (для админа всегда admin, даже когда он смотрит как клиент/разраб). */
  realRole: Role;
  /** Логин (для контрибьютора/клиента); у веб-админа отсутствует. */
  youtrackLogin?: string;
  tgId?: number;
  fullName: string;
}

async function viewAs(): Promise<Role | null> {
  const v = (await cookies()).get("view_as")?.value;
  return v === "client" || v === "contributor" ? v : null;
}

function adminTgId(): number | null {
  const v = process.env.ADMIN_TELEGRAM_ID;
  return v ? Number(v) : null;
}

/** Текущая личность или null (не залогинен / Telegram не привязан). */
export async function getPrincipal(): Promise<Principal | null> {
  const subject = await readSubject();
  if (!subject) return null;

  if (subject === "web") {
    const preview = await viewAs();
    return { source: "web", role: preview ?? "admin", realRole: "admin", fullName: "Никита" };
  }

  if (subject.startsWith("tg:")) {
    const tgId = Number(subject.slice(3));
    if (!Number.isFinite(tgId)) return null;
    // Админ по Telegram id — без связки.
    if (adminTgId() && tgId === adminTgId()) {
      const preview = await viewAs();
      return { source: "telegram", role: preview ?? "admin", realRole: "admin", tgId, fullName: "Никита" };
    }
    const link = await getLinkByTgId(tgId);
    if (!link) return null; // не привязан — нужен инвайт
    return {
      source: "telegram",
      role: link.role,
      realRole: link.role,
      youtrackLogin: link.youtrack_login,
      tgId,
      fullName: link.full_name || link.youtrack_login,
    };
  }

  return null;
}

export async function requireAdmin(): Promise<Principal> {
  const p = await getPrincipal();
  if (!p || p.realRole !== "admin") throw new Error("Forbidden");
  return p;
}
