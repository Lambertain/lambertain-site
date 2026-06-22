/**
 * Доставка кода dev → client одним (squash) коммитом через GitHub API.
 * Портал serverless-friendly: только fetch, без git-бинарника. Server-side only.
 *
 * Берём текущее состояние дефолтной ветки dev-репо и кладём его одним коммитом
 * в client-репо: либо в его дефолтную ветку (main), либо в отдельную ветку (клиент сам смержит).
 * Промежуточная история dev в client не попадает — это сознательно (squash).
 *
 * Требует: GITHUB_TOKEN с доступом (push) к обоим репо (мы коллабораторы клиентских репо).
 */
import { repoFromGit } from "./github";
import type { ProjectMeta } from "./tasks/types";

const API = "https://api.github.com";

async function gh(path: string, init?: RequestInit): Promise<Response> {
  return fetch(API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN || ""}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
  });
}
async function ghJson<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const r = await gh(path, init);
  if (!r.ok) throw new Error(`GitHub ${r.status} ${init?.method || "GET"} ${path}: ${(await r.text()).slice(0, 300)}`);
  return r.json() as Promise<T>;
}

interface TreeEntry { path: string; mode: string; type: string; sha?: string }

// ---- Защита от утечки в клиентский репо (токен/протокол Lambertain не должны туда попасть) ----
const PROTOCOL_BLOCK_RE = /\n?<!-- LAMBERTAIN-PROTOCOL:START -->[\s\S]*?<!-- LAMBERTAIN-PROTOCOL:END -->\n?/g;

/** Файл вообще не отдаём клиенту (внутреннее портала/секреты). */
function clientSkip(path: string): boolean {
  const p = path.toLowerCase();
  return (
    p === "esc.json" ||
    /(^|\/)\.lambertain(\/|$)/.test(p) ||
    /(^|\/)claude\.local\.md$/.test(p) ||
    /(^|\/)\.env(\.|$)/.test(p)
  );
}
/** Файл санируем (вырезаем протокол-блок Lambertain), прежде чем отдать клиенту. */
function clientSanitize(path: string): boolean {
  return /(^|\/)claude\.md$/i.test(path) || /(^|\/)agents\.md$/i.test(path);
}

/** Файл относится к схеме/миграциям БД? (эвристика по пути) */
function isSchemaFile(path: string): boolean {
  const p = path.toLowerCase();
  return (
    /(^|\/)prisma\/schema\.prisma$/.test(p) ||
    /(^|\/)(schema\.sql|structure\.sql)$/.test(p) ||
    /(^|\/)db\/schema\.rb$/.test(p) ||
    /(^|\/)migrations?\//.test(p) ||
    /(^|\/)scripts\/migrate\./.test(p) ||
    /(^|\/)drizzle\//.test(p) ||
    /\.sql$/.test(p)
  );
}

async function repoDefaultTree(repo: string): Promise<{ defaultBranch: string; entries: TreeEntry[] }> {
  const info = await ghJson<{ default_branch: string }>(`/repos/${repo}`);
  const ref = await ghJson<{ object: { sha: string } }>(`/repos/${repo}/git/ref/heads/${info.default_branch}`);
  const commit = await ghJson<{ tree: { sha: string } }>(`/repos/${repo}/git/commits/${ref.object.sha}`);
  const tree = await ghJson<{ tree: TreeEntry[]; truncated: boolean }>(`/repos/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
  if (tree.truncated) throw new Error(`Дерево ${repo} слишком большое (truncated).`);
  return { defaultBranch: info.default_branch, entries: tree.tree };
}

export interface DeliveryPreview {
  devRepo: string;
  clientRepo: string;
  clientDefaultBranch: string;
  fileCount: number;
  /** Schema/миграционные файлы, отличающиеся между dev и client (по содержимому). */
  schemaChanges: string[];
  /** true, если клиентский деплой САМ накатывает миграции (start/build/release-команда или preDeploy в конфиге репо). */
  migratesOnDeploy: boolean;
  /** Где именно обнаружен авто-накат (для подсказки в UI), напр. "start: prisma migrate deploy". */
  migrateMechanism?: string;
}

// Признак того, что деплой САМ накатывает миграции (а не мы вручную перед доставкой).
const MIGRATE_ON_DEPLOY_RE = /(prisma\s+migrate\s+deploy|drizzle-kit\s+(migrate|push)|migrate\.(mjs|cjs|js|ts)\b|migrate:deploy|db:(migrate|deploy)|knex\s+migrate\s+latest|sequelize\s+db:migrate|atlas\s+migrate\s+apply|alembic\s+upgrade|php\s+artisan\s+migrate|rails\s+db:migrate|node\s+ace\s+migration:run)/i;

/** Прочитать содержимое blob по path из дерева репо (или null, если файла нет). */
async function readRepoBlob(repo: string, entries: TreeEntry[], path: string): Promise<string | null> {
  const e = entries.find((x) => x.path === path && x.type === "blob" && x.sha);
  if (!e?.sha) return null;
  const blob = await ghJson<{ content: string; encoding: string }>(`/repos/${repo}/git/blobs/${e.sha}`);
  return Buffer.from(blob.content, (blob.encoding as BufferEncoding) || "base64").toString("utf-8");
}

/**
 * Автодетект: накатывает ли клиентский деплой миграции САМ. Доставляем код dev-репо как есть —
 * значит и команды деплоя берём из него. Смотрим package.json (start/build/release/postinstall и т.п.)
 * и railway/nixpacks/Procfile-конфиг репо. Если миграция — часть деплоя, ручное подтверждение не нужно.
 */
async function detectMigrateOnDeploy(repo: string, entries: TreeEntry[]): Promise<{ on: boolean; mechanism?: string }> {
  const pkgRaw = await readRepoBlob(repo, entries, "package.json").catch(() => null);
  if (pkgRaw) {
    try {
      const scripts = (JSON.parse(pkgRaw) as { scripts?: Record<string, string> }).scripts || {};
      for (const [name, cmd] of Object.entries(scripts)) {
        if (!/^(start|build|release|deploy|postinstall|prestart|prod)/i.test(name)) continue;
        const m = String(cmd).match(MIGRATE_ON_DEPLOY_RE);
        if (m) return { on: true, mechanism: `${name}: ${m[0]}` };
      }
    } catch { /* битый package.json — пропускаем */ }
  }
  for (const cfg of ["railway.json", "railway.toml", "nixpacks.toml", "Procfile"]) {
    const raw = await readRepoBlob(repo, entries, cfg).catch(() => null);
    const m = raw?.match(MIGRATE_ON_DEPLOY_RE);
    if (m) return { on: true, mechanism: `${cfg}: ${m[0]}` };
  }
  return { on: false };
}

/** Превью доставки: количество файлов и изменения схемы БД (для подтверждения перед пушем). */
export async function previewDelivery(input: { devGit?: string; clientGit?: string }): Promise<DeliveryPreview> {
  const devRepo = repoFromGit(input.devGit);
  const clientRepo = repoFromGit(input.clientGit);
  if (!devRepo) throw new Error("Не задан dev-репозиторий проекта");
  if (!clientRepo) throw new Error("Не задан client-репозиторий проекта");

  const [dev, client] = await Promise.all([repoDefaultTree(devRepo), repoDefaultTree(clientRepo)]);
  const devBlobs = dev.entries.filter((e) => e.type === "blob" && e.sha);
  const clientShas = new Map(client.entries.filter((e) => e.type === "blob").map((e) => [e.path, e.sha]));

  // Схема изменилась, если schema-файл новый или его содержимое (sha) отличается; либо удалён.
  const changed = new Set<string>();
  for (const e of devBlobs) {
    if (!isSchemaFile(e.path)) continue;
    if (clientShas.get(e.path) !== e.sha) changed.add(e.path);
  }
  for (const [path, sha] of clientShas) {
    if (isSchemaFile(path) && !devBlobs.some((e) => e.path === path && e.sha === sha)) changed.add(path);
  }

  const schemaChanges = [...changed].sort();
  // Авто-накат проверяем только когда схема реально менялась (иначе лишние запросы к GitHub).
  const det = schemaChanges.length > 0 ? await detectMigrateOnDeploy(devRepo, dev.entries).catch(() => ({ on: false as const, mechanism: undefined })) : { on: false as const, mechanism: undefined };

  return {
    devRepo,
    clientRepo,
    clientDefaultBranch: client.defaultBranch,
    fileCount: devBlobs.length,
    schemaChanges,
    migratesOnDeploy: det.on,
    migrateMechanism: det.mechanism,
  };
}

export interface DeliverInput {
  devGit?: string;
  clientGit?: string;
  /** Ветка-приёмник в client-репо. Если совпадает с дефолтной — это «в main». */
  targetBranch: string;
  /** Текст коммита. */
  message: string;
  /** PR-режим: пушить не в дефолтную ветку, а в служебную ветку и открывать Pull Request (клиент мержит сам). */
  asPR?: boolean;
}
export interface DeliverResult {
  clientRepo: string;
  branch: string;
  files: number;
  commitUrl: string;
  /** true, если пушили в дефолтную ветку клиента (там сработает авто-деплой). */
  toDefault: boolean;
  /** Ссылка на открытый/обновлённый Pull Request (в PR-режиме). */
  prUrl?: string;
}

const PR_BRANCH = "lambertain-delivery"; // служебная ветка доставки для PR-режима

/** Доставить состояние dev-репо одним коммитом в client-репо в выбранную ветку. */
export async function deliverDevToClient(input: DeliverInput): Promise<DeliverResult> {
  const devRepo = repoFromGit(input.devGit);
  const clientRepo = repoFromGit(input.clientGit);
  if (!devRepo) throw new Error("Не задан dev-репозиторий проекта");
  if (!clientRepo) throw new Error("Не задан client-репозиторий проекта");

  // 1. Дефолтные ветки и HEAD dev.
  const devInfo = await ghJson<{ default_branch: string }>(`/repos/${devRepo}`);
  const clientInfo = await ghJson<{ default_branch: string }>(`/repos/${clientRepo}`);
  const devBranch = devInfo.default_branch;
  // PR-режим: всегда в служебную ветку (не в дефолтную) → потом открываем PR. Иначе — выбранная ветка.
  const targetBranch = input.asPR ? PR_BRANCH : (input.targetBranch.trim() || clientInfo.default_branch);
  const toDefault = !input.asPR && targetBranch === clientInfo.default_branch;

  const devRef = await ghJson<{ object: { sha: string } }>(`/repos/${devRepo}/git/ref/heads/${devBranch}`);
  const devCommit = await ghJson<{ tree: { sha: string } }>(`/repos/${devRepo}/git/commits/${devRef.object.sha}`);
  const devTree = await ghJson<{ tree: TreeEntry[]; truncated: boolean }>(
    `/repos/${devRepo}/git/trees/${devCommit.tree.sha}?recursive=1`,
  );
  if (devTree.truncated) throw new Error("Дерево dev-репо слишком большое (truncated) — нужен git-mirror, не API.");

  const blobs = devTree.tree.filter((e) => e.type === "blob" && e.sha);

  // 2. Переносим блобы в client-репо (контент одинаковый → sha совпадёт; создаём, чтобы существовали).
  const batch = 8;
  const entries: TreeEntry[] = [];
  for (let i = 0; i < blobs.length; i += batch) {
    const slice = blobs.slice(i, i + batch);
    const made = await Promise.all(
      slice.map(async (e): Promise<TreeEntry | null> => {
        // Внутренние файлы Lambertain (токен/протокол/секреты) не отдаём клиенту.
        if (clientSkip(e.path)) return null;
        if (clientSanitize(e.path)) {
          const blob = await ghJson<{ content: string; encoding: string }>(`/repos/${devRepo}/git/blobs/${e.sha}`);
          let text = Buffer.from(blob.content, (blob.encoding as BufferEncoding) || "base64").toString("utf-8");
          text = text.replace(PROTOCOL_BLOCK_RE, "\n").replace(/\n{3,}/g, "\n\n").trimEnd();
          if (!text.trim()) return null; // после очистки пусто — файл не кладём
          const created = await ghJson<{ sha: string }>(`/repos/${clientRepo}/git/blobs`, {
            method: "POST",
            body: JSON.stringify({ content: Buffer.from(text + "\n", "utf-8").toString("base64"), encoding: "base64" }),
          });
          return { path: e.path, mode: e.mode, type: "blob", sha: created.sha };
        }
        const blob = await ghJson<{ content: string; encoding: string }>(`/repos/${devRepo}/git/blobs/${e.sha}`);
        const created = await ghJson<{ sha: string }>(`/repos/${clientRepo}/git/blobs`, {
          method: "POST",
          body: JSON.stringify({ content: blob.content, encoding: blob.encoding }),
        });
        return { path: e.path, mode: e.mode, type: "blob", sha: created.sha };
      }),
    );
    entries.push(...made.filter((x): x is TreeEntry => x !== null));
  }

  // 3. Дерево + коммит в client. Родитель — текущий HEAD ветки-приёмника (или дефолтной, если ветки нет).
  const clientTree = await ghJson<{ sha: string }>(`/repos/${clientRepo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ tree: entries }),
  });

  let parentSha: string | null = null;
  let branchExists = false;
  const refResp = await gh(`/repos/${clientRepo}/git/ref/heads/${targetBranch}`);
  if (refResp.ok) {
    parentSha = ((await refResp.json()) as { object: { sha: string } }).object.sha;
    branchExists = true;
  } else {
    const def = await ghJson<{ object: { sha: string } }>(`/repos/${clientRepo}/git/ref/heads/${clientInfo.default_branch}`);
    parentSha = def.object.sha;
  }

  const commit = await ghJson<{ sha: string; html_url: string }>(`/repos/${clientRepo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message: input.message, tree: clientTree.sha, parents: parentSha ? [parentSha] : [] }),
  });

  // 4. Двигаем/создаём ветку-приёмник на новый коммит.
  if (branchExists) {
    await ghJson(`/repos/${clientRepo}/git/refs/heads/${targetBranch}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: true }),
    });
  } else {
    await ghJson(`/repos/${clientRepo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${targetBranch}`, sha: commit.sha }),
    });
  }

  // 5. PR-режим: открыть Pull Request из служебной ветки в дефолтную (или вернуть уже открытый).
  let prUrl: string | undefined;
  if (input.asPR && targetBranch !== clientInfo.default_branch) {
    const create = await gh(`/repos/${clientRepo}/pulls`, {
      method: "POST",
      body: JSON.stringify({
        title: input.message,
        head: targetBranch,
        base: clientInfo.default_branch,
        body: "Автоматическая доставка Lambertain. Проверьте изменения и смержите в основную ветку.",
      }),
    });
    if (create.ok) {
      prUrl = ((await create.json()) as { html_url: string }).html_url;
    } else {
      // PR с этой ветки уже открыт (422) — найдём существующий.
      const owner = clientRepo.split("/")[0];
      const list = await gh(`/repos/${clientRepo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${targetBranch}`)}`);
      if (list.ok) { const arr = (await list.json()) as { html_url: string }[]; if (arr[0]) prUrl = arr[0].html_url; }
    }
  }

  return { clientRepo, branch: targetBranch, files: entries.length, commitUrl: commit.html_url, toDefault, prUrl };
}

// ---- Апрув/мониторинг клиентского Railway-деплоя ----
export interface ClientDeploy {
  railwayToken?: string;
  projectId?: string;
  environmentId?: string;
  serviceId?: string;
  pgServiceId?: string;
}
export interface DeployStatus {
  status: string;
  commit: string;
  approved: boolean;
}

async function railwayGql(token: string, query: string, variables: Record<string, unknown>): Promise<{ data?: Record<string, unknown>; errors?: unknown }> {
  const r = await fetch("https://backboard.railway.app/graphql/v2", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  return r.json();
}

const Q_DEPLOY = `query($p:String!,$e:String!,$s:String!){ deployments(first:1, input:{projectId:$p,environmentId:$e,serviceId:$s}){ edges{ node{ id status meta } } } }`;

function cdOk(cd: ClientDeploy | undefined): cd is Required<Pick<ClientDeploy, "railwayToken" | "projectId" | "environmentId" | "serviceId">> & ClientDeploy {
  return !!(cd?.railwayToken && cd.projectId && cd.environmentId && cd.serviceId);
}

// ───── Vercel (клиентский деплой на Vercel: апрув не нужен, мониторим статус) ─────
export interface ClientVercel {
  token?: string;
  projectId?: string;
  teamId?: string;
}
function cvOk(cv: ClientVercel | undefined): cv is Required<Pick<ClientVercel, "token" | "projectId">> & ClientVercel {
  return !!(cv?.token && cv.projectId);
}
async function vercelLatest(cv: ClientVercel): Promise<{ state: string; meta?: { githubCommitSha?: string }; url?: string } | null> {
  const u = new URL("https://api.vercel.com/v6/deployments");
  u.searchParams.set("projectId", cv.projectId!);
  u.searchParams.set("limit", "1");
  if (cv.teamId) u.searchParams.set("teamId", cv.teamId);
  const r = await fetch(u, { headers: { Authorization: `Bearer ${cv.token}` }, cache: "no-store" });
  const j = (await r.json()) as { deployments?: { state: string; readyState?: string; meta?: { githubCommitSha?: string }; url?: string }[] };
  const d = j.deployments?.[0];
  return d ? { state: d.state || d.readyState || "?", meta: d.meta, url: d.url } : null;
}
/** Текущий статус последнего деплоя клиента на Vercel (с мониторингом до терминального состояния). */
export async function vercelDeployStatus(cv: ClientVercel, waitMs = 120000): Promise<DeployStatus | null> {
  if (!cvOk(cv)) return null;
  let dep = await vercelLatest(cv);
  if (!dep) return null;
  const terminal = ["READY", "ERROR", "CANCELED"];
  const deadline = Date.now() + waitMs;
  while (!terminal.includes(dep.state) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 8000));
    dep = (await vercelLatest(cv)) ?? dep;
  }
  return { status: dep.state, commit: (dep.meta?.githubCommitSha || "").slice(0, 8), approved: true };
}

/** Текущий деплой клиентского сервиса (без изменений). */
export async function clientDeployStatus(cd: ClientDeploy): Promise<DeployStatus | null> {
  if (!cdOk(cd)) return null;
  const d = await railwayGql(cd.railwayToken, Q_DEPLOY, { p: cd.projectId, e: cd.environmentId, s: cd.serviceId });
  const node = (d.data as { deployments?: { edges?: { node: { status: string; meta?: { commitHash?: string } } }[] } })?.deployments?.edges?.[0]?.node;
  if (!node) return null;
  return { status: node.status, commit: (node.meta?.commitHash || "").slice(0, 8), approved: node.status !== "NEEDS_APPROVAL" };
}

/** Апрувнуть ожидающий деплой клиента и опросить статус (ограниченно по времени). */
export async function approveClientDeploy(cd: ClientDeploy, waitMs = 90000): Promise<DeployStatus> {
  if (!cdOk(cd)) throw new Error("Клиентский Railway не настроен (нужны token, projectId, environmentId, serviceId)");
  const get = () => railwayGql(cd.railwayToken!, Q_DEPLOY, { p: cd.projectId, e: cd.environmentId, s: cd.serviceId });
  const node0 = (await get()).data as { deployments?: { edges?: { node: { id: string; status: string; meta?: { commitHash?: string } } }[] } };
  const dep = node0?.deployments?.edges?.[0]?.node;
  if (!dep) throw new Error("Деплой клиента не найден");
  if (dep.status === "NEEDS_APPROVAL") {
    await railwayGql(cd.railwayToken!, `mutation($id:String!){ deploymentApprove(id:$id) }`, { id: dep.id });
  }
  const terminal = ["SUCCESS", "FAILED", "CRASHED", "REMOVED", "SKIPPED"];
  const deadline = Date.now() + waitMs;
  let last = dep;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 8000));
    const d = (await get()).data as { deployments?: { edges?: { node: { id: string; status: string; meta?: { commitHash?: string } } }[] } };
    last = d?.deployments?.edges?.[0]?.node ?? last;
    if (terminal.includes(last.status)) break;
  }
  return { status: last.status, commit: (last.meta?.commitHash || "").slice(0, 8), approved: true };
}

/**
 * Авто-доставка dev→client при «авто-готово» (autoApprove/autoDone): если настроены ВСЕ креды
 * (devGit + clientGit + Railway-токен ИЛИ Vercel-токен) — squash-пуш в дефолтную ветку клиента и
 * апрув деплоя (Railway) / мониторинг (Vercel). Миграция на клиентскую БД накатывается сама через
 * preDeploy клиентского деплоя (apply при апруве). Возвращает результат или null (креды не настроены).
 */
export async function autoDeliverIfConfigured(meta: ProjectMeta): Promise<(DeliverResult & { deploy: DeployStatus | null }) | null> {
  const hasRepos = !!(meta.devGit && meta.clientGit);
  const hasDeploy = !!(meta.clientDeploy?.railwayToken || meta.clientVercel?.token);
  if (!hasRepos || !hasDeploy) return null; // нужны все креды — иначе авто-доставку не запускаем
  const preview = await previewDelivery({ devGit: meta.devGit, clientGit: meta.clientGit });
  const res = await deliverDevToClient({
    devGit: meta.devGit,
    clientGit: meta.clientGit,
    targetBranch: preview.clientDefaultBranch,
    message: `Lambertain auto-delivery — ${new Date().toISOString().slice(0, 10)}`,
    asPR: meta.clientDeliverPR,
  });
  let deploy: DeployStatus | null = null;
  if (res.toDefault) {
    if (meta.clientDeploy?.railwayToken) {
      await new Promise((r) => setTimeout(r, 4000)); // дать Railway создать деплой из пуша
      deploy = await approveClientDeploy(meta.clientDeploy).catch(() => null);
    } else if (meta.clientVercel?.token) {
      await new Promise((r) => setTimeout(r, 6000)); // Vercel катит сам — мониторим статус
      deploy = await vercelDeployStatus(meta.clientVercel).catch(() => null);
    }
  }
  return { ...res, deploy };
}
