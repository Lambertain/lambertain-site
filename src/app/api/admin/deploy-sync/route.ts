/**
 * Синхронизация деплой-стадии задач (дёргается поллером каждые 5 мин):
 *  1. 'pr'  + привязанный PR смержен в base (develop) → стадия 'dev' («На тестовому сайті»).
 *  2. 'dev' + merge-коммит PR доехал до main клиента (develop слит в main) → стадия 'prod' («Опубліковано»).
 * Так весь путь pr→dev→prod ведётся автоматически по факту git, без ручных шагов разработчика.
 * Ошибки по конкретной задаче не глотаются — видны на портале (internal-коммент) + уведомление админа.
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { listPrStageTasks, listDevStageTasksWithPr } from "@/lib/db";
import { advanceStage } from "@/lib/deploy-stage";
import { reportTaskError } from "@/lib/task-error";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

const GH = { Authorization: `Bearer ${process.env.GITHUB_TOKEN || ""}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };

function parsePr(prUrl: string): { owner: string; repo: string; num: string } | null {
  const m = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  return m ? { owner: m[1], repo: m[2], num: m[3] } : null;
}

/** Смержен ли PR. Бросает при ошибке сети/доступа (чтобы её было видно, а не молча проглотить). */
async function prMerged(prUrl: string): Promise<boolean> {
  const p = parsePr(prUrl);
  if (!p) throw new Error(`не GitHub PR URL: ${prUrl}`);
  const r = await fetch(`https://api.github.com/repos/${p.owner}/${p.repo}/pulls/${p.num}`, { headers: GH, cache: "no-store" });
  if (!r.ok) throw new Error(`GitHub ${r.status} GET pull #${p.num}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { merged?: boolean; merged_at?: string | null };
  return !!(j.merged || j.merged_at);
}

/**
 * Доехал ли merge-коммит PR (в develop) до дефолтной ветки клиента (main) — т.е. клиент слил develop→main
 * и опубликовал. Сравниваем main…merge_commit_sha: коммит достижим из main, если он «behind»/«identical».
 * Бросает при ошибке — её увидим на портале.
 */
async function prReachedClientMain(prUrl: string): Promise<boolean> {
  const p = parsePr(prUrl);
  if (!p) throw new Error(`не GitHub PR URL: ${prUrl}`);
  const pr = await fetch(`https://api.github.com/repos/${p.owner}/${p.repo}/pulls/${p.num}`, { headers: GH, cache: "no-store" });
  if (!pr.ok) throw new Error(`GitHub ${pr.status} GET pull #${p.num}: ${(await pr.text()).slice(0, 200)}`);
  const j = (await pr.json()) as { merged?: boolean; merge_commit_sha?: string | null; base?: { repo?: { default_branch?: string } } };
  if (!j.merged || !j.merge_commit_sha) return false; // ещё не смержен в develop — рано
  const main = j.base?.repo?.default_branch;
  if (!main) throw new Error(`не визначено main-гілку репо ${p.owner}/${p.repo}`);
  const cmp = await fetch(`https://api.github.com/repos/${p.owner}/${p.repo}/compare/${encodeURIComponent(main)}...${j.merge_commit_sha}`, { headers: GH, cache: "no-store" });
  if (!cmp.ok) throw new Error(`GitHub ${cmp.status} compare ${main}...${j.merge_commit_sha.slice(0, 7)}: ${(await cmp.text()).slice(0, 200)}`);
  const status = ((await cmp.json()) as { status?: string }).status;
  return status === "behind" || status === "identical"; // merge-коммит уже в main → опубликовано
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });
  if (!process.env.GITHUB_TOKEN) return NextResponse.json({ error: "no GITHUB_TOKEN" }, { status: 503 });

  // 1. pr → dev: PR смержен в develop.
  const prTasks = await listPrStageTasks();
  let promotedToDev = 0;
  for (const t of prTasks) {
    try {
      if (await prMerged(t.pr_url)) { await advanceStage(t.readable_id, "dev"); promotedToDev++; }
    } catch (e) {
      await reportTaskError(t.readable_id, "перевірка мержу PR (pr→dev)", e);
    }
  }

  // 2. dev → prod: develop слит в main клиента (merge-коммит доехал до main) → публикация.
  const devTasks = await listDevStageTasksWithPr();
  let promotedToProd = 0;
  for (const t of devTasks) {
    try {
      if (await prReachedClientMain(t.pr_url)) { await advanceStage(t.readable_id, "prod"); promotedToProd++; }
    } catch (e) {
      await reportTaskError(t.readable_id, "перевірка публікації (dev→prod)", e);
    }
  }

  return NextResponse.json({ ok: true, checkedPr: prTasks.length, promotedToDev, checkedDev: devTasks.length, promotedToProd });
}
