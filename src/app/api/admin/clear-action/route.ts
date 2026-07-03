/**
 * Снять ops-флаг ожидания у задачи (admin-токен): clientAction (ждём действие/доступ клиента)
 * и/или ownerAction (ждём ops-шаг супер-админа). Нужно, когда ожидание больше не актуально —
 * напр. клиент отказался давать доступ и сделает шаг сам.
 * POST /api/admin/clear-action  { readableId, which?: "client" | "owner" | "both" }  (по умолчанию "client")
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { readJsonSmart } from "@/lib/req-body";
import { getBackend } from "@/lib/tasks";
import { setClientAction, setOwnerAction } from "@/lib/db";
import { revalidatePath } from "next/cache";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let b: { readableId?: string; which?: string };
  try { b = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const readableId = String(b.readableId || "").trim();
  const which = (String(b.which || "client").trim() || "client") as "client" | "owner" | "both";
  if (!readableId) return NextResponse.json({ error: "readableId обязателен" }, { status: 400 });
  if (!["client", "owner", "both"].includes(which)) return NextResponse.json({ error: "which: client | owner | both" }, { status: 400 });

  const be = getBackend();
  try { await be.getTask(readableId); } catch { return NextResponse.json({ error: `Задача ${readableId} не найдена` }, { status: 404 }); }

  if (which === "client" || which === "both") await setClientAction(readableId, null, null, null);
  if (which === "owner" || which === "both") await setOwnerAction(readableId, null);

  revalidatePath(`/admin/tasks/${readableId}`);
  revalidatePath("/admin");
  return NextResponse.json({ ok: true, readableId, cleared: which });
}
