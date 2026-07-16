/**
 * Сменить роль участника (members + tg_links) по admin-токену — для скриптов/восстановления без сессии.
 * То же, что селектор роли в UI «Команда», но через API. При смене на client — переназначает задачи проектов
 * без постановщика на клиента (как при добавлении клиента).
 * POST /api/admin/member-role  { login, role }   role ∈ client | employee | contributor | admin
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { readJsonSmart } from "@/lib/req-body";
import { setMemberRole, getUserProjectKeys, reassignNullReporterToClient } from "@/lib/db";
import type { Role } from "@/lib/tasks/types";
import { revalidatePath } from "next/cache";

const ROLES: Role[] = ["client", "employee", "contributor", "admin"];

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let b: { login?: string; role?: string };
  try { b = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const login = String(b.login || "").trim();
  const role = String(b.role || "").trim() as Role;
  if (!login) return NextResponse.json({ error: "login обязателен" }, { status: 400 });
  if (!ROLES.includes(role)) return NextResponse.json({ error: `role ∈ ${ROLES.join(" | ")}` }, { status: 400 });

  await setMemberRole(login, role);
  if (role === "client") {
    const keys = await getUserProjectKeys(login).catch(() => [] as string[]);
    for (const k of keys) await reassignNullReporterToClient(k).catch(() => {});
  }
  revalidatePath("/admin/team");
  revalidatePath("/admin");
  return NextResponse.json({ ok: true, login, role });
}
