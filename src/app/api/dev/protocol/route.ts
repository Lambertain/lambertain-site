/**
 * Живой протокол работы Claude разработчика. Возвращает АКТУАЛЬНЫЙ текст протокола —
 * правки применяются мгновенно у всех (без git pull в дев-репо).
 * GET /api/dev/protocol
 * Авторизация: Authorization: Bearer <project_token>
 */
import { getProjectKeyByToken, getProjectFull } from "@/lib/db";
import { protocolBody, PORTAL_BASE } from "@/lib/dev-protocol";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : null;
  if (!token) return new Response("no token", { status: 401 });
  const projectKey = await getProjectKeyByToken(token);
  if (!projectKey) return new Response("invalid token", { status: 403 });

  // Совместная разработка через PR (meta.clientDeliverPR) → добавляем секцию про подтягивание client main каждой сессией.
  const proj = await getProjectFull(projectKey).catch(() => null);
  return new Response(protocolBody(token, projectKey, PORTAL_BASE, { collaborative: !!proj?.meta.clientDeliverPR, gitflow: !!proj?.meta.gitflowDelivery }), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
