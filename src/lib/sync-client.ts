/**
 * Зеркалирование клиентских репо → наши дев-репо (client → dev).
 *
 * Решает проблему ДОСТУПА: у разработчика нет доступа к клиентскому GitHub-репо, а у портала
 * (GITHUB_TOKEN — мы коллабораторы клиентских репо) есть. Портал затягивает свежие клиентские
 * интеграционные ветки и публикует их в НАШ дев-репо отдельными ветками `client-sync/<branch>`
 * (реальная git-история, те же SHA). Разработчик локально делает `git fetch origin` +
 * `git merge/rebase origin/client-sync/<branch>` — конфликты разрешает у себя (портал их НЕ трогает).
 *
 * Почему git-бинарь, а не GitHub API (как deliver.ts dev→client): наши дев-репо — НЕ форки
 * клиентских (нет общего object-store), поэтому перенести историю одним API-вызовом
 * (merge-upstream/merges по SHA) нельзя, а воспроизводить коммиты через Git Data API вручную —
 * хрупко. `git push` переносит ровно недостающие объекты и сохраняет SHA. Наличие git в рантайме
 * гарантируется `nixpacks.toml` (aptPkgs += git). Server-side only.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoFromGit } from "./github";
import type { ProjectMeta } from "./tasks/types";

/** Ветка-приёмник в дев-репо, куда кладём зеркало клиентской ветки. */
const SYNC_PREFIX = "client-sync/";

interface GitResult { code: number; stdout: string; stderr: string }

function git(args: string[], cwd: string): Promise<GitResult> {
  return new Promise((resolve) => {
    const p = spawn("git", args, {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "echo" },
    });
    let stdout = "", stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    p.on("error", (e) => resolve({ code: 127, stdout, stderr: String((e as Error).message || e) }));
  });
}

export interface SyncBranchResult { branch: string; sha: string }
export interface SyncRepoResult {
  devRepo: string;
  clientRepo: string;
  /** Какие клиентские ветки зеркалированы в client-sync/<branch> (с итоговым SHA). */
  branches: SyncBranchResult[];
  error?: string;
}

const httpsUrl = (repo: string) => `https://github.com/${repo}.git`;

/** Какие клиентские ветки зеркалить: дефолтная + develop (если существует). Без ручных флагов. */
async function pickBranches(dir: string, clientUrl: string, hdr: string[]): Promise<string[]> {
  const sym = await git([...hdr, "ls-remote", "--symref", clientUrl, "HEAD"], dir);
  const def = sym.stdout.match(/ref:\s+refs\/heads\/(\S+)\s+HEAD/)?.[1] || "main";
  const heads = await git([...hdr, "ls-remote", "--heads", clientUrl], dir);
  const existing = new Set(
    heads.stdout.split("\n").map((l) => l.split(/\s+/)[1]).filter(Boolean).map((r) => r.replace("refs/heads/", "")),
  );
  return [...new Set([def, "develop"])].filter((b) => existing.has(b));
}

/** Зеркалировать одну пару репо client → dev. */
async function syncPair(devGit: string | undefined, clientGit: string | undefined, token: string): Promise<SyncRepoResult> {
  const devRepo = repoFromGit(devGit);
  const clientRepo = repoFromGit(clientGit);
  if (!devRepo || !clientRepo) {
    return { devRepo: devRepo || "?", clientRepo: clientRepo || "?", branches: [], error: "не распознан dev/client репозиторий" };
  }
  // Токен — через http.extraHeader (не в URL и не в .git/config), один на оба репо (оба github.com).
  const hdr = ["-c", `http.extraHeader=Authorization: Bearer ${token}`];
  const devUrl = httpsUrl(devRepo);
  const clientUrl = httpsUrl(clientRepo);
  const dir = await mkdtemp(join(tmpdir(), "lmb-sync-"));
  try {
    const init = await git(["init", "-q", "--initial-branch=main"], dir);
    if (init.code === 127) return { devRepo, clientRepo, branches: [], error: "git не найден в рантайме" };

    const wanted = await pickBranches(dir, clientUrl, hdr);
    if (!wanted.length) return { devRepo, clientRepo, branches: [], error: "у клиента нет веток main/develop" };

    // Тянем нужные клиентские ветки полной историей (нужна для merge-base у разработчика).
    const fetchRes = await git(
      [...hdr, "fetch", "--no-tags", clientUrl, ...wanted.map((b) => `+refs/heads/${b}:refs/remotes/client/${b}`)],
      dir,
    );
    if (fetchRes.code !== 0) return { devRepo, clientRepo, branches: [], error: `fetch client: ${fetchRes.stderr.slice(0, 200)}` };

    // Публикуем их в наш дев-репо как client-sync/<branch> (force — ветки служебные, портал ими владеет).
    const pushRes = await git(
      [...hdr, "push", "--force", devUrl, ...wanted.map((b) => `refs/remotes/client/${b}:refs/heads/${SYNC_PREFIX}${b}`)],
      dir,
    );
    if (pushRes.code !== 0) return { devRepo, clientRepo, branches: [], error: `push dev: ${pushRes.stderr.slice(0, 200)}` };

    const branches: SyncBranchResult[] = [];
    for (const b of wanted) {
      const sha = (await git(["rev-parse", `refs/remotes/client/${b}`], dir)).stdout.trim();
      branches.push({ branch: b, sha: sha.slice(0, 8) });
    }
    return { devRepo, clientRepo, branches };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Зеркалировать клиентский код во ВСЕ дев-репо проекта (основная пара devGit/clientGit + extraRepos).
 * Возвращает отчёт по каждой паре. Бросает только при отсутствии GITHUB_TOKEN.
 */
export async function syncClientToDev(meta: ProjectMeta): Promise<SyncRepoResult[]> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("нет GITHUB_TOKEN");
  const pairs = [{ dev: meta.devGit, client: meta.clientGit }, ...(meta.extraRepos ?? [])]
    .filter((p): p is { dev: string; client: string } => !!p.dev && !!p.client);
  const out: SyncRepoResult[] = [];
  for (const p of pairs) out.push(await syncPair(p.dev, p.client, token));
  return out;
}

/** Есть ли у проекта хоть одна пара dev↔client репо (для гейта эндпоинта/кнопки). */
export function hasRepoPairs(meta: ProjectMeta): boolean {
  return [{ dev: meta.devGit, client: meta.clientGit }, ...(meta.extraRepos ?? [])].some((p) => p.dev && p.client);
}

export { SYNC_PREFIX };
