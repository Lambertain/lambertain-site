/**
 * Аудит и починка членства клиентов в проектах (рассинхрон tg_links ↔ member_projects).
 * GET  /api/admin/membership            — desync-клиенты (есть в tg_links с project_key, но нет в member_projects)
 *                                          + задачи с reporter IS NULL (набор «Мої задачі» супер-адміна — для діагностики)
 * POST /api/admin/membership  { login, projectKey }  — додати членство (member_projects), idempotent
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { readJsonSmart } from "@/lib/req-body";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function GET(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  // Клиенты с привязкой к проекту (tg_links.project_key), которых НЕТ в member_projects по этому проекту.
  const desync = await q<{ login: string; full_name: string | null; project_key: string }>(
    `SELECT l.youtrack_login AS login, l.full_name, l.project_key
       FROM tg_links l
      WHERE l.role = 'client' AND l.project_key IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM member_projects mp WHERE mp.login = l.youtrack_login AND mp.project_key = l.project_key)
      ORDER BY l.project_key`,
  );
  // Набор «Мої задачі» супер-адміна = reporter IS NULL. Показуємо для діагностики (чому щось туди попадає).
  const nullReporter = await q<{ readable_id: string; project_key: string; status: string | null }>(
    `SELECT t.readable_id, p.key AS project_key, t.status
       FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE t.reporter_id IS NULL
      ORDER BY t.updated_at DESC LIMIT 200`,
  );
  return NextResponse.json({ desyncClients: desync, nullReporterTasks: nullReporter });
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let body: { login?: string; projectKey?: string };
  try { body = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const login = String(body.login || "").trim();
  const projectKey = String(body.projectKey || "").trim();
  if (!login || !projectKey) return NextResponse.json({ error: "login и projectKey обязательны" }, { status: 400 });

  await q("INSERT INTO member_projects (login, project_key) VALUES ($1,$2) ON CONFLICT DO NOTHING", [login, projectKey]);
  const rows = await q<{ project_key: string }>("SELECT project_key FROM member_projects WHERE login = $1 ORDER BY project_key", [login]);
  return NextResponse.json({ ok: true, login, projects: rows.map((r) => r.project_key) });
}
