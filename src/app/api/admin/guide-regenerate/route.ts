/**
 * Гайды-инструкции: инспекция и регенерация локалей.
 * GET  /api/admin/guide-regenerate           — список гайдов (id, title по локалям) для проверки языка.
 * POST /api/admin/guide-regenerate { guideId } — перегенерировать ОДИН гайд в правильных uk/ru/en (тема = текущий title).
 * POST /api/admin/guide-regenerate { all:true } — перегенерировать ВСЕ гайды.
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { listGuides, getGuide, updateGuide } from "@/lib/db";
import { genGuideContent } from "@/lib/handoff-classify";
import { readJsonSmart } from "@/lib/req-body";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}
function ok(req: Request): boolean {
  const exp = process.env.ADMIN_API_TOKEN;
  return !!exp && bearer(req) === exp;
}

export async function GET(req: Request) {
  if (!ok(req)) return NextResponse.json({ error: "invalid token" }, { status: 401 });
  const guides = await listGuides();
  return NextResponse.json({ count: guides.length, guides: guides.map((g) => ({ id: g.id, title: g.title, title_ru: g.title_ru, title_en: g.title_en })) });
}

async function regen(id: number): Promise<{ id: number; ok: boolean; title?: string }> {
  const g = await getGuide(id);
  if (!g) return { id, ok: false };
  const topic = g.title || g.title_ru || g.title_en || "інструкція";
  const c = await genGuideContent(topic);
  if (!c) return { id, ok: false };
  await updateGuide(id, c.title_uk, c.body_uk, g.ord, { title_ru: c.title_ru, body_ru: c.body_ru, title_en: c.title_en, body_en: c.body_en });
  return { id, ok: true, title: c.title_uk };
}

export async function POST(req: Request) {
  if (!ok(req)) return NextResponse.json({ error: "invalid token" }, { status: 401 });
  let b: { guideId?: number; all?: boolean };
  try { b = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  if (b.all) {
    const guides = await listGuides();
    const res = [];
    for (const g of guides) res.push(await regen(g.id));
    return NextResponse.json({ ok: true, regenerated: res });
  }
  const id = Number(b.guideId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "guideId or all required" }, { status: 400 });
  return NextResponse.json(await regen(id));
}
