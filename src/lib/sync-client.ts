/**
 * Клиент к сервису git-sync (зеркалирование client → dev).
 *
 * Сами git-операции живут в ОТДЕЛЬНОМ Railway-сервисе `services/git-sync` (нужен системный git
 * в рантайме, которого нет у web-портала на Railpack; плюс изоляция/переиспользование). Здесь —
 * только сбор пар репо из meta и проксирующий вызов сервиса по internal-сети.
 *
 * env (на web-сервисе): GIT_SYNC_URL=http://git-sync.railway.internal:8080, GIT_SYNC_SECRET=<общий секрет>.
 */
import type { ProjectMeta } from "./tasks/types";

/** Ветка-приёмник в дев-репо, куда сервис кладёт зеркало клиентской ветки. */
export const SYNC_PREFIX = "client-sync/";

export interface SyncBranchResult { branch: string; sha: string }
export interface SyncRepoResult {
  devRepo: string;
  clientRepo: string;
  branches: SyncBranchResult[];
  error?: string;
}

/** Пары dev↔client репо проекта: основная (devGit/clientGit) + extraRepos. */
export function collectPairs(meta: ProjectMeta): { dev: string; client: string }[] {
  return [{ dev: meta.devGit, client: meta.clientGit }, ...(meta.extraRepos ?? [])]
    .filter((p): p is { dev: string; client: string } => !!p.dev && !!p.client);
}

/** Есть ли у проекта хоть одна пара dev↔client репо (для гейта эндпоинта/кнопки). */
export function hasRepoPairs(meta: ProjectMeta): boolean {
  return collectPairs(meta).length > 0;
}

/**
 * Зеркалировать клиентский код во все дев-репо проекта через сервис git-sync.
 * Бросает при отсутствии конфигурации или недоступности сервиса.
 */
export async function syncClientToDev(meta: ProjectMeta): Promise<SyncRepoResult[]> {
  const base = process.env.GIT_SYNC_URL;
  const secret = process.env.GIT_SYNC_SECRET;
  if (!base || !secret) throw new Error("сервис git-sync не настроен (GIT_SYNC_URL / GIT_SYNC_SECRET)");
  const pairs = collectPairs(meta);
  if (!pairs.length) throw new Error("у проекта нет пар dev↔client репо");

  const r = await fetch(`${base.replace(/\/$/, "")}/sync`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ pairs }),
    cache: "no-store",
  });
  const data = (await r.json().catch(() => ({}))) as { results?: SyncRepoResult[]; error?: string };
  if (!r.ok) throw new Error(`git-sync ${r.status}: ${data.error || "ошибка сервиса"}`);
  return data.results ?? [];
}
