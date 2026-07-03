/**
 * Синхронизация деплой-стадии задач (дёргается поллером каждые 5 мин):
 *  1. 'pr'  + привязанный PR смержен в base (develop) → стадия 'dev' («На тестовому сайті»).
 *  2. 'dev' + merge-коммит PR доехал до main клиента (develop слит в main) → стадия 'prod' («Опубліковано»).
 *  3. живой PR (pr/dev) → зеркалим новое код-ревью из GitHub (inline/вердикт/комменты) в задачу (internal).
 * Так весь путь pr→dev→prod и фидбек ревьюера ведутся автоматически, без ручных шагов разработчика.
 * Ошибки по конкретной задаче не глотаются — видны на портале (internal-коммент) + уведомление админа.
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { listPrStageTasksMulti, listDevStageTasksMulti, listPrsForReviewSync } from "@/lib/db";
import { advanceStage } from "@/lib/deploy-stage";
import { reportPollError, clearPollError } from "@/lib/task-error";
import { syncPrReview } from "@/lib/pr-review-sync";
import { ghFetchRetry, GitHubError } from "@/lib/github";

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
  const r = await ghFetchRetry(`https://api.github.com/repos/${p.owner}/${p.repo}/pulls/${p.num}`, { headers: GH, cache: "no-store" });
  if (!r.ok) throw new GitHubError(r.status, `GitHub ${r.status} GET pull #${p.num}: ${(await r.text()).slice(0, 200)}`);
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
  const pr = await ghFetchRetry(`https://api.github.com/repos/${p.owner}/${p.repo}/pulls/${p.num}`, { headers: GH, cache: "no-store" });
  if (!pr.ok) throw new GitHubError(pr.status, `GitHub ${pr.status} GET pull #${p.num}: ${(await pr.text()).slice(0, 200)}`);
  const j = (await pr.json()) as { merged?: boolean; merge_commit_sha?: string | null; base?: { repo?: { default_branch?: string } } };
  if (!j.merged || !j.merge_commit_sha) return false; // ещё не смержен в develop — рано
  const main = j.base?.repo?.default_branch;
  if (!main) throw new Error(`не визначено main-гілку репо ${p.owner}/${p.repo}`);
  const cmp = await ghFetchRetry(`https://api.github.com/repos/${p.owner}/${p.repo}/compare/${encodeURIComponent(main)}...${j.merge_commit_sha}`, { headers: GH, cache: "no-store" });
  if (!cmp.ok) throw new GitHubError(cmp.status, `GitHub ${cmp.status} compare ${main}...${j.merge_commit_sha.slice(0, 7)}: ${(await cmp.text()).slice(0, 200)}`);
  const status = ((await cmp.json()) as { status?: string }).status;
  return status === "behind" || status === "identical"; // merge-коммит уже в main → опубликовано
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });
  if (!process.env.GITHUB_TOKEN) return NextResponse.json({ error: "no GITHUB_TOKEN" }, { status: 503 });

  // 1. pr → dev: ВСЕ PR задачи смержены в develop (мультирепо: backend И app).
  const prTasks = await listPrStageTasksMulti();
  let promotedToDev = 0;
  for (const t of prTasks) {
    const key = `ghfail:merge:${t.readable_id}`;
    try {
      const merged = await Promise.all(t.prs.map(prMerged));
      if (merged.every(Boolean)) { await advanceStage(t.readable_id, "dev", t.prs.length > 1 ? "усі PR змержені в develop" : "PR змержено в develop"); promotedToDev++; }
      await clearPollError(key);
    } catch (e) {
      await reportPollError(key, t.readable_id, "перевірка мержу PR (pr→dev)", e);
    }
  }

  // 2. dev → prod: ВСЕ PR задачи доехали до main клиента (develop слит в main по всем репо) → публикация.
  const devTasks = await listDevStageTasksMulti();
  let promotedToProd = 0;
  for (const t of devTasks) {
    const key = `ghfail:prod:${t.readable_id}`;
    try {
      const reached = await Promise.all(t.prs.map(prReachedClientMain));
      if (reached.every(Boolean)) { await advanceStage(t.readable_id, "prod", "develop злито в main клієнта → опубліковано"); promotedToProd++; }
      await clearPollError(key);
    } catch (e) {
      await reportPollError(key, t.readable_id, "перевірка публікації (dev→prod)", e);
    }
  }

  // 3. Зеркалирование код-ревью из GitHub в задачу — по КАЖДОМУ живому PR (стадия pr/dev), курсор per-PR.
  const reviewPrs = await listPrsForReviewSync();
  let mirroredReviews = 0;
  for (const r of reviewPrs) {
    const key = `ghfail:review:${r.readable_id}:${r.pr_url}`;
    try {
      mirroredReviews += await syncPrReview(r.readable_id, r.pr_url, r.review_synced_at);
      await clearPollError(key);
    } catch (e) {
      await reportPollError(key, r.readable_id, "зеркалювання код-рев'ю з PR", e);
    }
  }

  return NextResponse.json({ ok: true, checkedPrTasks: prTasks.length, promotedToDev, checkedDevTasks: devTasks.length, promotedToProd, checkedReviewPrs: reviewPrs.length, mirroredReviews });
}
