/**
 * Плейбуки скилов по тегам задачи (для Claude разработчика).
 * GET /api/dev/skills?tags=slug1,slug2   — вернёт плейбуки указанных скилов
 * GET /api/dev/skills                     — список всех (slug + заголовок, без тел)
 * Авторизация: Authorization: Bearer <project_token>
 */
import { NextResponse } from "next/server";
import { getProjectKeyByToken, getSkillsBySlugs, listSkills } from "@/lib/db";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function GET(req: Request) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "no token" }, { status: 401 });
  if (!(await getProjectKeyByToken(token))) return NextResponse.json({ error: "invalid token" }, { status: 403 });

  const tags = (new URL(req.url).searchParams.get("tags") || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (tags.length) {
    const skills = await getSkillsBySlugs(tags);
    return NextResponse.json({ skills: skills.map((s) => ({ slug: s.slug, title: s.title, playbook: s.playbook })) });
  }
  const all = await listSkills();
  return NextResponse.json({ skills: all.map((s) => ({ slug: s.slug, title: s.title, triggers: s.triggers })) });
}
