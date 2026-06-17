/**
 * Удаление СВОЕГО коммента (созданного через dev-API) по токену проекта. DEV-7.
 * POST /api/dev/comments/<id>/delete
 * Удалять можно только dev_authored-коммент задач ЭТОГО проекта и ТОЛЬКО пока он на модерации (approved=false).
 * Опубликованный клиенту — не удаляем (отредактируй через /edit). Авторизация: Bearer <project_token>.
 */
import { NextResponse } from "next/server";
import { getProjectKeyByToken, getDevCommentMeta, deleteDevComment } from "@/lib/db";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "no token" }, { status: 401 });
  const projectKey = await getProjectKeyByToken(token);
  if (!projectKey) return NextResponse.json({ error: "invalid token" }, { status: 403 });

  const { id } = await params;
  const commentId = Number(id);
  if (!Number.isInteger(commentId)) return NextResponse.json({ error: "bad comment id" }, { status: 400 });

  const meta = await getDevCommentMeta(commentId, projectKey);
  if (!meta) return NextResponse.json({ error: "comment not found or not yours" }, { status: 404 });
  if (meta.approved) return NextResponse.json({ error: "опубликованный коммент удалить нельзя — отредактируй через /edit" }, { status: 409 });

  const ok = await deleteDevComment(commentId, projectKey);
  if (!ok) return NextResponse.json({ error: "delete failed" }, { status: 409 });
  return NextResponse.json({ ok: true, deleted: commentId });
}
