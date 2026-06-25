/**
 * Аудит постановщика: проекты, где он reporter, и ВСЕ reporter-логины в этих проектах.
 * Для поиска старого YouTrack-ника при миграции (DEV-27) — чтобы потом reassign-reporter.
 * GET /api/admin/reporter-audit?login=tg723634084
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { reporterAudit } from "@/lib/db";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function GET(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  const login = new URL(req.url).searchParams.get("login");
  if (!login) return NextResponse.json({ error: "login required" }, { status: 400 });
  return NextResponse.json({ login, projects: await reporterAudit(login) });
}
