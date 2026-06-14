/**
 * Отдаёт картинку гайда (скрин из буфера). GET /api/guide-files/<id>. Доступно авторизованному пользователю портала.
 */
import { getPrincipal } from "@/lib/principal";
import { getGuideImage } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getPrincipal();
  if (!me) return new Response("unauthorized", { status: 401 });
  const { id } = await params;
  const img = await getGuideImage(Number(id));
  if (!img) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(img.data), {
    headers: { "Content-Type": img.mime || "image/png", "Cache-Control": "private, max-age=86400" },
  });
}
