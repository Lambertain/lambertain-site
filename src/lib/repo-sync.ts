/**
 * Статус синхронизации dev-репо ↔ client-репо проекта (для карточки на экране «Проєкти»).
 *
 * Доставка dev→client идёт ОДНИМ squash-коммитом (deliver.ts), client-репо клиентам НЕ форк дев —
 * общей git-истории нет, поэтому GitHub `compare`/`ahead_by` между репо не работает (404).
 * Надёжная метрика без общей истории и без курсора: сколько коммитов дефолтной ветки dev-репо
 * НОВЕЕ последнего коммита дефолтной ветки client-репо (дата последнего client-коммита ≈ момент
 * последней доставки). Ноль → синхронизировано; N>0 → dev опережает на N недоставленных коммитов.
 *
 * Мультирепо (extraRepos: backend+frontend) → суммируем по всем парам. Кэш в памяти (TTL), чтобы не
 * дёргать GitHub на каждый рендер. Server-side only. Токен: GITHUB_TOKEN.
 */
import { ghFetchRetry, repoFromGit, GitHubError } from "./github";
import { collectPairs } from "./sync-client";
import type { ProjectMeta } from "./tasks/types";

const API = "https://api.github.com";
const GH = { Authorization: `Bearer ${process.env.GITHUB_TOKEN || ""}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
const PER_PAGE = 100; // потолок подсчёта коммитов за один запрос

export interface RepoSyncStatus {
  /** У проекта есть хотя бы одна полная пара dev→client — иначе бейдж не показываем. */
  configured: boolean;
  /** dev не опережает client (ahead === 0). */
  synced: boolean;
  /** На сколько коммитов dev-репо опережает client-репо (сумма по парам). */
  ahead: number;
  /** ahead упёрся в PER_PAGE — реально может быть больше (показать «N+»). */
  capped: boolean;
  /** Не удалось получить статус (сеть/GitHub/нет токена). */
  error: boolean;
}

async function ghJson<T>(path: string): Promise<T> {
  const r = await ghFetchRetry(API + path, { headers: GH, cache: "no-store" }, 2);
  if (!r.ok) throw new GitHubError(r.status, `GitHub ${r.status} GET ${path}`);
  return r.json() as Promise<T>;
}

/** Дата последнего коммита ветки (undefined, если ветки/коммитов нет). */
async function branchHeadDate(repo: string, branch: string): Promise<string | undefined> {
  const commits = await ghJson<Array<{ commit: { committer?: { date?: string } } }>>(
    `/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=1`,
  );
  return commits[0]?.commit?.committer?.date;
}

/**
 * Сколько коммитов dev-ветки новее последнего коммита ветки-приёмника клиента.
 * clientBranchPref — предпочтительная ветка клиента (для gitflow это `develop` — туда идёт доставка);
 * если её нет — берём дефолтную ветку клиента.
 */
async function pairAhead(devGit: string, clientGit: string, clientBranchPref?: string): Promise<{ ahead: number; capped: boolean }> {
  const dev = repoFromGit(devGit);
  const cli = repoFromGit(clientGit);
  if (!dev || !cli) return { ahead: 0, capped: false };

  const [devInfo, cliInfo] = await Promise.all([
    ghJson<{ default_branch: string }>(`/repos/${dev}`),
    ghJson<{ default_branch: string }>(`/repos/${cli}`),
  ]);

  // Ветка клиента, куда реально доставляем (gitflow → develop), иначе дефолтная. Её HEAD-дата = точка последней доставки.
  let since: string | undefined;
  if (clientBranchPref) since = await branchHeadDate(cli, clientBranchPref).catch(() => undefined);
  if (since === undefined) since = await branchHeadDate(cli, cliInfo.default_branch).catch(() => undefined);

  // dev-коммиты новее последнего client-коммита (ещё не доставлены). Пустое client-репо → берём все (капнутся).
  const qs = `sha=${encodeURIComponent(devInfo.default_branch)}${since ? `&since=${encodeURIComponent(since)}` : ""}&per_page=${PER_PAGE}`;
  const devNew = await ghJson<unknown[]>(`/repos/${dev}/commits?${qs}`);
  return { ahead: Math.min(devNew.length, PER_PAGE), capped: devNew.length >= PER_PAGE };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

const cache = new Map<string, { at: number; val: RepoSyncStatus }>();
const TTL = 5 * 60 * 1000; // успешный статус живёт 5 мин
const ERR_TTL = 30 * 1000; // ошибку перепроверяем через 30 c

/** Статус синка проекта (кэш в памяти). Никогда не бросает — при сбое возвращает error:true. */
export async function getProjectRepoSync(projectKey: string, meta: ProjectMeta): Promise<RepoSyncStatus> {
  const pairs = collectPairs(meta);
  if (!pairs.length) return { configured: false, synced: false, ahead: 0, capped: false, error: false };

  const hit = cache.get(projectKey);
  if (hit && Date.now() - hit.at < (hit.val.error ? ERR_TTL : TTL)) return hit.val;

  const clientBranchPref = meta.gitflowDelivery ? "develop" : undefined; // gitflow доставляет в client/develop
  let val: RepoSyncStatus;
  try {
    const res = await withTimeout(Promise.all(pairs.map((p) => pairAhead(p.dev, p.client, clientBranchPref))), 8000);
    const ahead = res.reduce((s, r) => s + r.ahead, 0);
    const capped = res.some((r) => r.capped);
    val = { configured: true, synced: ahead === 0, ahead, capped, error: false };
  } catch {
    val = { configured: true, synced: false, ahead: 0, capped: false, error: true };
  }
  cache.set(projectKey, { at: Date.now(), val });
  return val;
}
