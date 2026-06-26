/**
 * Привязать один или несколько GitHub PR к задаче (мультирепо) по admin-токену.
 * Ручной fallback к авто-привязке gitflow-доставки (напр. для задач, созданных до её появления).
 * POST /api/admin/task-pr  { readableId, prUrls: string[] }  (или prUrl: string)
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { readJsonSmart } from "@/lib/req-body";
import { setTaskPr } from "@/lib/db";
import { revalidatePath } from "next/cache";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}
const PR_RE = /^https?:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/;

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let b: { readableId?: string; prUrls?: string[]; prUrl?: string };
  try { b = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const readableId = String(b.readableId || "").trim();
  const urls = [...(Array.isArray(b.prUrls) ? b.prUrls : []), ...(b.prUrl ? [b.prUrl] : [])].map((u) => String(u).trim()).filter(Boolean);
  if (!readableId || !urls.length) return NextResponse.json({ error: "readableId и prUrls обязательны" }, { status: 400 });
  const bad = urls.filter((u) => !PR_RE.test(u));
  if (bad.length) return NextResponse.json({ error: `не GitHub PR URL: ${bad.join(", ")}` }, { status: 400 });

  let bound = 0;
  for (const u of urls) {
    const r = await setTaskPr(readableId, u);
    if (!r) return NextResponse.json({ error: `задача ${readableId} не найдена` }, { status: 404 });
    bound++;
  }
  revalidatePath(`/admin/tasks/${readableId}`);
  return NextResponse.json({ ok: true, readableId, bound, prUrls: urls });
}
