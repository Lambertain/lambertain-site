/**
 * Привязка проекта к дев-репо + получение токена проекта (для Claude Code, без доступа к БД).
 * POST /api/admin/project/link
 *   { projectKey, devGit?, clientGit?, defaultAssignee? }
 * Проставляет meta (devGit и пр.), гарантирует токен проекта и раскладывает bootstrap CLAUDE.md в дев-репо (layProtocol).
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse, after } from "next/server";
import { randomBytes } from "node:crypto";
import { getProjectFull, setProjectMeta, getProjectTokens, setProjectToken } from "@/lib/db";
import { layProtocol } from "@/lib/protocol-deploy";
import { readJsonSmart } from "@/lib/req-body";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let body: { projectKey?: string; devGit?: string; clientGit?: string; defaultAssignee?: string };
  try { body = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const projectKey = String(body.projectKey || "").trim();
  if (!projectKey) return NextResponse.json({ error: "projectKey required" }, { status: 400 });

  const proj = await getProjectFull(projectKey);
  if (!proj) return NextResponse.json({ error: `project ${projectKey} not found` }, { status: 404 });

  const meta = { ...proj.meta };
  if (body.devGit) meta.devGit = String(body.devGit).trim();
  if (body.clientGit) meta.clientGit = String(body.clientGit).trim();
  if (body.defaultAssignee) meta.defaultAssignee = String(body.defaultAssignee).trim();
  await setProjectMeta(projectKey, proj.name, meta);

  // Гарантируем токен проекта (создаём, если нет).
  let token = (await getProjectTokens()).get(projectKey);
  if (!token) { token = `pk_${randomBytes(20).toString("hex")}`; await setProjectToken(projectKey, token); }

  // Раскладываем bootstrap CLAUDE.md в наш дев-репо (Lambertain/*) — фоном.
  let protocol: string | null = null;
  if (meta.devGit && /github\.com\/Lambertain\//i.test(meta.devGit)) {
    protocol = "scheduled";
    after(() => layProtocol(projectKey).catch(() => {}));
  }
  return NextResponse.json({ projectKey, token, devGit: meta.devGit ?? null, protocol });
}
