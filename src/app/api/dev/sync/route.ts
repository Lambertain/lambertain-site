/**
 * Синхронизация клиентского кода → наш дев-репо (для Claude разработчика).
 * POST /api/dev/sync — портал тянет свежие клиентские ветки и публикует их в дев-репо как
 *                      client-sync/<branch>. Дальше разработчик локально: git fetch origin &&
 *                      git merge/rebase origin/client-sync/<branch>.
 * Авторизация: Authorization: Bearer <project_token>.
 *
 * Зачем: у разработчика нет доступа к клиентскому репо, а у портала (GITHUB_TOKEN) есть.
 */
import { NextResponse } from "next/server";
import { getProjectKeyByToken, getProjectFull } from "@/lib/db";
import { syncClientToDev, hasRepoPairs, SYNC_PREFIX } from "@/lib/sync-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "no token" }, { status: 401 });
  const projectKey = await getProjectKeyByToken(token);
  if (!projectKey) return NextResponse.json({ error: "invalid token" }, { status: 403 });

  const proj = await getProjectFull(projectKey);
  if (!proj) return NextResponse.json({ error: "project not found" }, { status: 404 });
  if (!hasRepoPairs(proj.meta)) {
    return NextResponse.json({ error: "у проекта не настроены пары dev↔client репо" }, { status: 400 });
  }

  try {
    const synced = await syncClientToDev(proj.meta);
    const ok = synced.some((r) => r.branches.length > 0);
    // Подсказка разработчику: какие ветки появились и что сделать локально.
    const branches = [...new Set(synced.flatMap((r) => r.branches.map((b) => b.branch)))];
    return NextResponse.json({
      ok,
      synced,
      hint:
        `Свежий клиентский код в наших дев-репо: ветки ${branches.map((b) => `${SYNC_PREFIX}${b}`).join(", ") || "—"}. ` +
        `Локально: git fetch origin → git merge (или rebase) origin/${SYNC_PREFIX}<branch> в свою рабочую ветку. ` +
        `Конфликты разрешаешь сам.`,
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message || e) }, { status: 500 });
  }
}
