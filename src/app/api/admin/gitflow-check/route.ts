/**
 * Диагностика: проверить, сольётся ли feature-ветка с актуальным клиентским develop (по всем парам репо
 * проекта) — БЕЗ push/PR. Тот же конфликт-чек, что портал делает при сдаче задачи (gitflow). Read-only.
 * POST /api/admin/gitflow-check  { projectKey, branch, base? }
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { readJsonSmart } from "@/lib/req-body";
import { getProjectFull } from "@/lib/db";
import { checkGitflowConflicts } from "@/lib/sync-client";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let b: { projectKey?: string; branch?: string; base?: string };
  try { b = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const projectKey = String(b.projectKey || "").trim();
  const branch = String(b.branch || "").trim();
  const base = String(b.base || "develop").trim();
  if (!projectKey || !branch) return NextResponse.json({ error: "projectKey и branch обязательны" }, { status: 400 });

  const proj = await getProjectFull(projectKey);
  if (!proj) return NextResponse.json({ error: `проект ${projectKey} не найден` }, { status: 404 });

  try {
    const results = await checkGitflowConflicts(proj.meta, branch, base);
    const conflicting = results.filter((r) => r.mergeable === false);
    return NextResponse.json({
      ok: true,
      branch,
      base,
      mergeable: conflicting.length === 0,
      results,
      conflicts: conflicting.map((c) => ({ repo: c.clientRepo, files: c.conflicts ?? [] })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ошибка проверки" }, { status: 502 });
  }
}
