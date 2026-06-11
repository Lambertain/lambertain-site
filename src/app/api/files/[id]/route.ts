/**
 * Отдаёт вложение задачи (картинку, скачанную из YouTrack и сохранённую в нашей БД).
 * GET /api/files/<id>. Доступно только авторизованному пользователю портала.
 */
import { getPrincipal } from "@/lib/principal";
import { getAttachment } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getPrincipal();
  if (!me) return new Response("unauthorized", { status: 401 });
  const { id } = await params;
  const att = await getAttachment(Number(id));
  if (!att) return new Response("not found", { status: 404 });
  // BYTEA из pg приходит как Buffer.
  const body = new Uint8Array(att.data);
  return new Response(body, {
    headers: {
      "Content-Type": att.mime || "application/octet-stream",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
