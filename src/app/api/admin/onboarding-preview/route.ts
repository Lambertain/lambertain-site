/**
 * Предпросмотр онбординг-уведомления участнику проекта — БЕЗ отправки (для проверки).
 * GET /api/admin/onboarding-preview?projectKey=TSYM&role=client
 *   role: client | contributor | employee
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { buildProjectOnboarding } from "@/lib/onboarding-notify";
import type { Role } from "@/lib/tasks/types";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function GET(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  const url = new URL(req.url);
  const projectKey = (url.searchParams.get("projectKey") || "").trim();
  const role = (url.searchParams.get("role") || "client").trim() as Role;
  if (!projectKey) return NextResponse.json({ error: "projectKey required" }, { status: 400 });

  const text = await buildProjectOnboarding(role, projectKey);
  if (text == null) return NextResponse.json({ error: `проект ${projectKey} не найден` }, { status: 404 });
  return NextResponse.json({ projectKey, role, text });
}
