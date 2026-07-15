/**
 * DEV-51: разовая чистка накопленного шума зеркалирования код-ревью по ВСЕМ проектам:
 *  - дубли зеркальных коментов (🔎 код-рев'ю / 💬 коментар у PR) → оставить по одной канонической копии;
 *  - авто-комменты об ошибках синка (⚠️ Помилка…) → удалить (ошибки теперь идут только админу/в лог).
 * Идемпотентно: повторный прогон уже без дублей вернёт нули. Дедуп нового шума предотвращён в коде
 * (mirrored_pr_items + reportPollError без записи в задачу) — этот эндпоинт лишь подчищает историческое.
 * POST /api/admin/cleanup-mirror-noise            — выполнить чистку.
 * POST /api/admin/cleanup-mirror-noise { dryRun:true } — только показать, сколько будет удалено.
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { readJsonSmart } from "@/lib/req-body";
import { cleanupMirrorNoise } from "@/lib/db";
import { revalidatePath } from "next/cache";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let b: { dryRun?: boolean } = {};
  try { b = await readJsonSmart(req); } catch { /* тело необязательно */ }
  const dryRun = b?.dryRun === true;

  const res = await cleanupMirrorNoise(dryRun);
  if (!dryRun) {
    revalidatePath("/admin");
    revalidatePath("/admin/tasks");
  }
  return NextResponse.json({ ok: true, dryRun, ...res });
}
