/**
 * Бриф проекта для Claude разработчика/дизайнера (привязанный к проекту бриф лида).
 * GET /api/dev/brief — ответы брифа (тип проекта + payload).
 * Авторизация: Authorization: Bearer <project_token>
 */
import { NextResponse } from "next/server";
import { getProjectKeyByToken, getBriefByProject } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: "no token" }, { status: 401 });
  const projectKey = await getProjectKeyByToken(token);
  if (!projectKey) return NextResponse.json({ error: "invalid token" }, { status: 403 });

  const brief = await getBriefByProject(projectKey);
  if (!brief) return NextResponse.json({ brief: null });
  return NextResponse.json({
    brief: { label: brief.label, type: brief.project_type, status: brief.status, payload: brief.payload },
  });
}
