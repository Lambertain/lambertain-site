/**
 * Смена статуса задачи админ-скриптом/Claude (без сессии портала).
 * POST /api/admin/task-status  { readableId, status, summary? }
 *   status: Open | In Progress | Review | Rework | Done | Blocked (или алиасы in_progress/review).
 *   summary — для Review/Done: краткий итог, уйдёт постановщику комментарием + пушем.
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { readJsonSmart } from "@/lib/req-body";
import { getBackend } from "@/lib/tasks";
import { notifyLogins, notifyProjectClients, taskTag } from "@/lib/notify";
import { statusBucket } from "@/lib/statuses";
import { PORTAL_BASE } from "@/lib/dev-protocol";
import { revalidatePath } from "next/cache";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

const ALIAS: Record<string, string> = { in_progress: "In Progress", review: "Review", done: "Done", rework: "Rework", open: "Open", blocked: "Blocked" };

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  const token = bearer(req);
  if (!token || token !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let body: { readableId?: string; status?: string; summary?: string };
  try { body = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const readableId = String(body.readableId || "").trim();
  const raw = String(body.status || "").trim();
  const status = ALIAS[raw.toLowerCase()] || raw;
  const summary = String(body.summary || "").trim();
  if (!readableId || !status) return NextResponse.json({ error: "readableId и status обязательны" }, { status: 400 });

  const be = getBackend();
  let task;
  try { task = await be.getTask(readableId); } catch { return NextResponse.json({ error: `Задача ${readableId} не найдена` }, { status: 404 }); }
  await be.updateStatus(readableId, status);
  const link = { text: "Открыть задачу", url: `${PORTAL_BASE}/admin/tasks/${readableId}` };

  // Review → постановщику (reporter) на приёмку: комментарий-итог + пуш.
  if (statusBucket(status) === "review") {
    if (summary) await be.addComment(readableId, `✅ <b>Готово до перевірки:</b>\n\n${summary}\n\n— — —\nℹ️ Перевірте результат і прийміть («Готово») або поверніть на доопрацювання.`, "internal").catch(() => {});
    if (task.reporter?.login) await notifyLogins([task.reporter.login], `🔍 <b>На перевірку</b> · ${await taskTag(readableId)}: ${task.summary}${summary ? `\n\n${summary}` : ""}`, [], link).catch(() => {});
  } else if (statusBucket(status) === "done") {
    await notifyProjectClients(task.projectKey, `✅ <b>Готово</b> · ${await taskTag(readableId)}: ${task.summary}`).catch(() => {});
  }
  revalidatePath("/admin");
  revalidatePath("/admin/tasks");
  revalidatePath(`/admin/tasks/${readableId}`);
  return NextResponse.json({ ok: true, readableId, status });
}
