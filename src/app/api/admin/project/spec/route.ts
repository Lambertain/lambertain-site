/**
 * Спеки проекта. Проект может иметь несколько спек (по модулям/фазам) в meta.specs[] — добавление новой
 * НЕ дописывается в существующую и не раздувает её. Их пишет Claude Code; портал отдаёт разработчику как
 * projectSpec (склейка всех) и использует для kickoff (по одной спеке за раз).
 *
 * POST /api/admin/project/spec
 *   { projectKey, spec, specKey?, title?, order? }  — upsert конкретной спеки (specKey/title) в specs[]
 *   { projectKey, specKey, delete: true }           — удалить спеку
 *   { projectKey, spec }                            — ЛЕГАСИ: одиночная meta.spec (обратная совместимость)
 * GET  /api/admin/project/spec?projectKey=FINE           — список спек проекта
 *      /api/admin/project/spec?projectKey=FINE&specKey=x — одна спека
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { getProjectFull, setProjectMeta } from "@/lib/db";
import { readJsonSmart } from "@/lib/req-body";
import { listSpecs, getSpec, upsertSpec, removeSpec } from "@/lib/specs";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}
function auth(req: Request): NextResponse | null {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });
  return null;
}

export async function POST(req: Request) {
  const bad = auth(req); if (bad) return bad;
  let body: { projectKey?: string; spec?: string; specKey?: string; title?: string; order?: number; delete?: boolean };
  try { body = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const projectKey = String(body.projectKey || "").trim();
  if (!projectKey) return NextResponse.json({ error: "projectKey required" }, { status: 400 });
  const proj = await getProjectFull(projectKey);
  if (!proj) return NextResponse.json({ error: `project ${projectKey} not found` }, { status: 404 });

  const specKey = String(body.specKey || "").trim();
  const title = String(body.title || "").trim();

  // Удаление спеки.
  if (body.delete) {
    if (!specKey) return NextResponse.json({ error: "specKey required to delete" }, { status: 400 });
    await setProjectMeta(projectKey, proj.name, removeSpec(proj.meta, specKey));
    return NextResponse.json({ ok: true, projectKey, deleted: specKey });
  }

  // Мультиспек: указан specKey или title → upsert в specs[].
  if (specKey || title) {
    const now = new Date().toISOString();
    const meta = upsertSpec(proj.meta, { key: specKey || undefined, title: title || specKey, body: String(body.spec ?? ""), order: body.order }, now);
    await setProjectMeta(projectKey, proj.name, meta);
    const saved = listSpecs(meta).find((s) => s.key === (specKey || undefined) || s.title === (title || specKey));
    return NextResponse.json({ ok: true, projectKey, specKey: saved?.key, count: meta.specs?.length ?? 0 });
  }

  // Легаси: одиночная meta.spec.
  await setProjectMeta(projectKey, proj.name, { ...proj.meta, spec: String(body.spec ?? "") });
  return NextResponse.json({ ok: true, projectKey, length: String(body.spec ?? "").length });
}

export async function GET(req: Request) {
  const bad = auth(req); if (bad) return bad;
  const url = new URL(req.url);
  const projectKey = url.searchParams.get("projectKey")?.trim() || "";
  const specKey = url.searchParams.get("specKey")?.trim() || "";
  if (!projectKey) return NextResponse.json({ error: "projectKey required" }, { status: 400 });
  const proj = await getProjectFull(projectKey);
  if (!proj) return NextResponse.json({ error: `project ${projectKey} not found` }, { status: 404 });
  if (specKey) {
    const s = getSpec(proj.meta, specKey);
    if (!s) return NextResponse.json({ error: `spec ${specKey} not found` }, { status: 404 });
    return NextResponse.json({ projectKey, spec: s });
  }
  return NextResponse.json({ projectKey, name: proj.name, specs: listSpecs(proj.meta).map((s) => ({ key: s.key, title: s.title, order: s.order, length: s.body.length, updatedAt: s.updatedAt })) });
}
