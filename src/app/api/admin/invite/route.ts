/**
 * Сгенерировать одноразовые инвайт-ссылки (роль + проекты).
 * POST /api/admin/invite  { role, projectKeys: string[], count?: number, ttlHours?: number }
 * Возвращает массив ссылок (по count, по умолч. 1). Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { generateInvite } from "@/lib/invites";
import { readJsonSmart } from "@/lib/req-body";
import type { Role } from "@/lib/tasks/types";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

const PERSON_ROLES = ["client", "contributor", "employee", "admin"];

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let body: { role?: string; projectKeys?: string[]; count?: number; ttlHours?: number };
  try { body = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const role = String(body.role || "").trim() as Role;
  const projectKeys = Array.isArray(body.projectKeys) ? body.projectKeys.map((k) => String(k).trim().toUpperCase()).filter(Boolean) : [];
  const count = Math.max(1, Math.min(20, Number(body.count) || 1));
  const ttlHours = Number(body.ttlHours) > 0 ? Number(body.ttlHours) : 24 * 30; // по умолчанию месяц
  if (!PERSON_ROLES.includes(role)) return NextResponse.json({ error: "role: client|contributor|employee|admin" }, { status: 400 });
  if (role !== "admin" && !projectKeys.length) return NextResponse.json({ error: "projectKeys обязательны для этой роли" }, { status: 400 });

  const links: string[] = [];
  for (let i = 0; i < count; i++) {
    const { link } = await generateInvite(role, projectKeys, ttlHours);
    links.push(link);
  }
  return NextResponse.json({ ok: true, role, projectKeys, count, ttlHours, links });
}
