/**
 * Задать блокеры задачи (зависимости) — для Claude/скриптов, без сессии портала.
 * POST /api/admin/task-deps  { readableId, dependsOn: ["PLAN-4", ...] }
 * Полностью ЗАМЕНЯЕТ набор блокеров задачи (пустой массив — снять все). Самозависимость игнорируется.
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { readJsonSmart } from "@/lib/req-body";
import { setTaskDeps } from "@/lib/db";
import { getBackend } from "@/lib/tasks";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let body: { readableId?: string; dependsOn?: string[] };
  try { body = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const readableId = String(body.readableId || "").trim();
  if (!readableId) return NextResponse.json({ error: "readableId required" }, { status: 400 });
  const deps = Array.isArray(body.dependsOn) ? body.dependsOn.map((d) => String(d).trim()).filter(Boolean) : [];

  // Блокеры — только из того же проекта (по префиксу ключа).
  const projectKey = readableId.split("-")[0];
  const foreign = deps.filter((d) => d.split("-")[0] !== projectKey);
  if (foreign.length) return NextResponse.json({ error: `блокеры из чужого проекта: ${foreign.join(", ")}` }, { status: 400 });

  try {
    await getBackend().getTask(readableId);
  } catch {
    return NextResponse.json({ error: `задача ${readableId} не найдена` }, { status: 404 });
  }
  try {
    await setTaskDeps(readableId, deps);
    return NextResponse.json({ ok: true, readableId, dependsOn: deps.filter((d) => d !== readableId) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
