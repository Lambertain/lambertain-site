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
  // Имя при сохранении делается уникальным суффиксом `-<8hex>` — восстанавливаем исходное (с расширением .apk и т.п.).
  const fname = (att.name || "file").replace(/-[0-9a-f]{8}$/, "") || "file";
  // HTTP-заголовки только ASCII: фолбэк + RFC 5987 filename* для не-ASCII (кириллица).
  const ascii = (fname.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_")) || "file";
  return new Response(body, {
    headers: {
      "Content-Type": att.mime || "application/octet-stream",
      // attachment → браузер скачивает файл (а не пытается отобразить), с корректным именем.
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fname)}`,
      "Content-Length": String(att.data.length),
      "Cache-Control": "private, max-age=86400",
    },
  });
}
