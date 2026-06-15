/**
 * Отдаёт картинку гайда (скрин из буфера). GET /api/guide-files/<id>.
 * Публично: картинки-инструкции не секретны и нужны на публичных страницах инструкций (/i/<token>).
 */
import { getGuideImage } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const img = await getGuideImage(Number(id));
  if (!img) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(img.data), {
    headers: { "Content-Type": img.mime || "image/png", "Cache-Control": "public, max-age=86400" },
  });
}
