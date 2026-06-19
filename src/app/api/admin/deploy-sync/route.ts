/**
 * Синхронизация деплой-стадии задач: задачи в стадии 'pr' с привязанным PR — проверяем по GitHub,
 * и если PR смержен → переводим в стадию 'dev' («На тестовому сайті»). Дёргается поллером.
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { listPrStageTasks, setDeployStage } from "@/lib/db";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

async function prMerged(prUrl: string): Promise<boolean | null> {
  const m = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!m) return null;
  const r = await fetch(`https://api.github.com/repos/${m[1]}/${m[2]}/pulls/${m[3]}`, {
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN || ""}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    cache: "no-store",
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { merged?: boolean; merged_at?: string | null };
  return !!(j.merged || j.merged_at);
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });
  if (!process.env.GITHUB_TOKEN) return NextResponse.json({ error: "no GITHUB_TOKEN" }, { status: 503 });

  const tasks = await listPrStageTasks();
  let promoted = 0;
  for (const t of tasks) {
    const merged = await prMerged(t.pr_url).catch(() => null);
    if (merged) { await setDeployStage(t.readable_id, "dev").catch(() => {}); promoted++; }
  }
  return NextResponse.json({ ok: true, checked: tasks.length, promotedToDev: promoted });
}
