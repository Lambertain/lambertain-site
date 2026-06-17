/**
 * Удалить комментарий (любой) и опционально вложения по id. Для админ-операций/отмены.
 * POST /api/admin/comment-delete  { commentId, attachmentIds?: number[], taskId? }
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { deleteCommentAny } from "@/lib/moderation";
import { readJsonSmart } from "@/lib/req-body";
import { revalidatePath } from "next/cache";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let body: { commentId?: string | number; attachmentIds?: number[]; taskId?: string };
  try { body = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const commentId = String(body.commentId ?? "").trim();
  if (!commentId) return NextResponse.json({ error: "commentId обязателен" }, { status: 400 });

  await deleteCommentAny(commentId);
  let attDeleted = 0;
  const ids = Array.isArray(body.attachmentIds) ? body.attachmentIds.map(Number).filter(Number.isFinite) : [];
  if (ids.length) {
    const r = await q("DELETE FROM attachments WHERE id = ANY($1::int[]) RETURNING id", [ids]);
    attDeleted = r.length;
  }
  if (body.taskId) revalidatePath(`/admin/tasks/${body.taskId}`);
  return NextResponse.json({ ok: true, commentId, attachmentsDeleted: attDeleted });
}
