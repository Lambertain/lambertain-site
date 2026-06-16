/**
 * Скачивание вложения задачи по токену проекта (для Claude Code).
 * GET /api/dev/files/<attachmentId>  — отдаёт файл, ТОЛЬКО если он прикреплён к задаче ЭТОГО проекта.
 * Авторизация: Authorization: Bearer <project_token>. Чужой файл — 404.
 */
import { getProjectKeyByToken, getDevAttachment } from "@/lib/db";

export const dynamic = "force-dynamic";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = bearer(req);
  if (!token) return new Response("no token", { status: 401 });
  const projectKey = await getProjectKeyByToken(token);
  if (!projectKey) return new Response("invalid token", { status: 403 });

  const { id } = await params;
  const att = await getDevAttachment(Number(id), projectKey);
  if (!att) return new Response("not found", { status: 404 });

  const filename = (att.name || `file-${id}`).replace(/["\\\r\n]/g, "_");
  return new Response(new Uint8Array(att.data), {
    headers: {
      "Content-Type": att.mime || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
