/**
 * Правка СВОЕГО коммента (созданного через dev-API) по токену проекта. DEV-7.
 * POST /api/dev/comments/<id>/edit  { "text": "..." }
 * Можно править только dev_authored-комменты задач ЭТОГО проекта (чужие — 404). Авторизация: Bearer <project_token>.
 */
import { NextResponse } from "next/server";
import { getProjectKeyByToken, editDevComment } from "@/lib/db";
import { readJsonSmart } from "@/lib/req-body";

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

  let body: { text?: string };
  try { body = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const text = String(body.text || "").trim();
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const updated = await editDevComment(commentId, projectKey, text);
  // null — коммент не твой (создан не через dev-API), не найден или из чужого проекта.
  if (!updated) return NextResponse.json({ error: "comment not found or not yours" }, { status: 404 });
  return NextResponse.json({ ok: true, comment: { id: updated.id, approved: updated.approved, visibility: updated.visibility } });
}
