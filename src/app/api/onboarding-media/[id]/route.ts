/**
 * Отдаёт картинку шага онбординг-инструкции. GET /api/onboarding-media/<id>.
 * ПУБЛИЧНО (без авторизации) — инструкция доступна клиенту по ссылке до регистрации.
 */
import { getOnboardingMedia } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await getOnboardingMedia(Number(id));
  if (!m) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(m.data), {
    headers: {
      "Content-Type": m.mime || "application/octet-stream",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
