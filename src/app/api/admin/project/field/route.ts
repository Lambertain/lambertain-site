/**
 * Записать значения поля каталога (project-fields.ts) в проект — включает поле + пишет customFields.
 * POST /api/admin/project/field  { projectKey, fieldKey, values: { <subKey>: <value> } }
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { enableProjectFieldValue } from "@/lib/db";
import { getFieldDef } from "@/lib/project-fields";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let b: { projectKey?: string; fieldKey?: string; values?: Record<string, unknown> };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const projectKey = String(b.projectKey || "").trim();
  const fieldKey = String(b.fieldKey || "").trim();
  const values = b.values && typeof b.values === "object" ? b.values : null;
  if (!projectKey || !fieldKey || !values) return NextResponse.json({ error: "projectKey, fieldKey, values обязательны" }, { status: 400 });
  if (!getFieldDef(fieldKey)) return NextResponse.json({ error: `поле «${fieldKey}» нет в каталоге project-fields.ts` }, { status: 400 });

  const written: string[] = [];
  for (const [subKey, value] of Object.entries(values)) {
    if (value == null || String(value) === "") continue;
    await enableProjectFieldValue(projectKey, fieldKey, subKey, String(value));
    written.push(subKey);
  }
  return NextResponse.json({ ok: true, projectKey, fieldKey, written });
}
