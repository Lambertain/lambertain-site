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
import { createHash } from "node:crypto";
import { repoFromGit } from "./github";
import type { ProjectMeta } from "./tasks/types";

const API = "https://api.github.com";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch к GitHub с ретраями. Доставка большого репо = сотни вызовов; один сетевой сбой
 * ("fetch failed"/ECONNRESET) или вторичный rate-limit (429/403 при remaining=0) не должен ронять всю доставку.
 * Ретраим сетевые ошибки, 429, 5xx и 403-rate-limit с экспоненциальным бэкоффом; финальную ошибку — с контекстом.
 */
export async function gh(path: string, init?: RequestInit): Promise<Response> {
  const headers = {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN || ""}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
  };
  const MAX = 4;
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX; attempt++) {
    try {
      const r = await fetch(API + path, { ...init, headers, cache: "no-store" });
      const rateLimited = r.status === 429 || (r.status === 403 && r.headers.get("x-ratelimit-remaining") === "0");
      if ((rateLimited || r.status >= 500) && attempt < MAX - 1) {
        const ra = Number(r.headers.get("retry-after"));
        await sleep(ra > 0 ? Math.min(ra * 1000, 15000) : 700 * 2 ** attempt);
        continue;
      }
      return r;
    } catch (e) {
      lastErr = e; // сетевой сбой (fetch failed / ECONNRESET / таймаут) — ретраим
      if (attempt < MAX - 1) { await sleep(700 * 2 ** attempt); continue; }
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`GitHub мережевий збій (${init?.method || "GET"} ${path}) після ${MAX} спроб: ${msg}`);
}
export async function ghJson<T = unknown>(path: string, init?: RequestInit): Promise<T> {
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
    /(^|\/)\.env(\.|$)/.test(p) ||
    // GitHub API-токен без scope `workflow` НЕ може створювати/змінювати файли в .github/workflows/ —
    // на git/trees це віддає 404 Not Found (а не 403), і вся доставка стабільно падає, якщо dev-репо має
    // CI-workflow. Dev-CI Lambertain клієнту не потрібен (у нього свій деплой) → не доставляємо ці файли.
    /(^|\/)\.github\/workflows\//.test(p)
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

  // 2. Родитель (HEAD ветки-приёмника или дефолтной) + ТЕКУЩЕЕ дерево клиента — чтобы переносить ТОЛЬКО
  //    изменённые файлы. Раньше на КАЖДЫЙ файл было 2 вызова (read dev + create client) КАЖДУЮ доставку →
  //    ~2×N вызовов на репо и упор в GitHub rate-limit. git-sha контента одинаков в dev и client, поэтому
  //    неизменённые блобы ссылаем по sha (0 вызовов); читаем/создаём только дельту. Масштабируется по числу
  //    изменённых файлов, а не по размеру репо.
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
  // Карта path → blob-sha текущего клиентского дерева (для дельты). Truncated-дерево → карта пустая (безопасный
  // фолбэк на полный перенос).
  const clientBlobByPath = new Map<string, string>();
  if (parentSha) {
    const pc = await ghJson<{ tree: { sha: string } }>(`/repos/${clientRepo}/git/commits/${parentSha}`);
    const ct = await ghJson<{ tree: TreeEntry[]; truncated?: boolean }>(`/repos/${clientRepo}/git/trees/${pc.tree.sha}?recursive=1`);
    if (!ct.truncated) for (const e of ct.tree) if (e.type === "blob" && e.sha) clientBlobByPath.set(e.path, e.sha);
  }
  // git blob sha = sha1("blob <len>\0<content>") — считаем локально для санитайз-файлов (их контент меняется).
  const gitBlobSha = (content: string): string => {
    const buf = Buffer.from(content, "utf-8");
    return createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");
  };

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
          const content = text + "\n";
          const sha = gitBlobSha(content);
          if (clientBlobByPath.get(e.path) === sha) return { path: e.path, mode: e.mode, type: "blob", sha }; // не изменился
          const created = await ghJson<{ sha: string }>(`/repos/${clientRepo}/git/blobs`, {
            method: "POST",
            body: JSON.stringify({ content: Buffer.from(content, "utf-8").toString("base64"), encoding: "base64" }),
          });
          return { path: e.path, mode: e.mode, type: "blob", sha: created.sha };
        }
        // Обычный файл: если у клиента по этому пути уже тот же sha — блоб существует, ссылаемся по sha (0 вызовов).
        if (e.sha && clientBlobByPath.get(e.path) === e.sha) return { path: e.path, mode: e.mode, type: "blob", sha: e.sha };
        const blob = await ghJson<{ content: string; encoding: string }>(`/repos/${devRepo}/git/blobs/${e.sha}`);
        const created = await ghJson<{ sha: string }>(`/repos/${clientRepo}/git/blobs`, {
          method: "POST",
          body: JSON.stringify({ content: blob.content, encoding: blob.encoding }),
        });
        return { path: e.path, mode: e.mode, type: "blob", sha: created.sha };
      }),
    );
    entries.push(...made.filter((x): x is TreeEntry => x !== null));
    if (i + batch < blobs.length) await sleep(120); // мягкая пауза между батчами — меньше риск вторичного rate-limit
  }

  // 3. Дерево + коммит в client (родитель — parentSha, выбран выше).
  const clientTree = await ghJson<{ sha: string }>(`/repos/${clientRepo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ tree: entries }),
  });
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
  status: string; // SUCCESS | BUILDING | DEPLOYING | NEEDS_APPROVAL | FAILED | PENDING | NOT_CONFIGURED | ERROR | …
  commit: string;
  approved: boolean;
  /** Совпал ли задеплоенный коммит с только что доставленным (false = задеплоен НЕ наш коммит → доставка не доехала). */
  matched?: boolean;
  /** Пояснение для UI: ошибка апрува / «авто-деплой не настроен» и т.п. */
  note?: string;
}

/**
 * Терминальный «успешно опубликовано» статус клиентского деплоя. Railway отдаёт SUCCESS, Vercel — READY.
 * Раньше проверялся только SUCCESS → успешный Vercel-деплой ложно помечался «НЕ опубліковано, перевір».
 */
export function isDeployPublished(status: string): boolean {
  return status === "SUCCESS" || status === "READY";
}

/**
 * Достижим ли коммит `ancestor` из `head` в репо (т.е. head СОДЕРЖИТ ancestor). Нужно, чтобы отличить
 * реальный «задеплоен не наш коммит» от гонки доставок: если более поздняя доставка обогнала нашу,
 * задеплоенный коммит — потомок нашего, наш контент уже в проде. compare/base...head: ahead/identical = содержит.
 */
async function commitReachable(repo: string, ancestor: string, head: string): Promise<boolean> {
  if (!repo || !ancestor || !head) return false;
  if (ancestor.startsWith(head) || head.startsWith(ancestor)) return true;
  try {
    const j = await ghJson<{ status?: string }>(`/repos/${repo}/compare/${ancestor}...${head}`);
    return j.status === "ahead" || j.status === "identical";
  } catch {
    return false;
  }
}

/**
 * Идентичен ли КОНТЕНТ двух коммитов (сравнение tree.sha). Наш контент уже в проде, даже если задеплоен
 * коммит с другим SHA — типичная гонка: несколько задач приняты разом → несколько авто-доставок одного и того
 * же dev-HEAD в один клиентский репо force-пушат по очереди, и approveClientDeploy конкретной задачи видит
 * СОСЕДНЮЮ доставку (то же дерево, другой squash-SHA). Детерминированно и не зависит от ancestry-compare
 * (который ломается на осиротевшем при force-push коммите или пустом commitHash → был ложный «НЕ той коміт»).
 */
async function sameCommitTree(repo: string, a: string, b: string): Promise<boolean> {
  if (!repo || !a || !b) return false;
  try {
    const [ca, cb] = await Promise.all([
      ghJson<{ commit?: { tree?: { sha?: string } } }>(`/repos/${repo}/commits/${a}`),
      ghJson<{ commit?: { tree?: { sha?: string } } }>(`/repos/${repo}/commits/${b}`),
    ]);
    const ta = ca.commit?.tree?.sha;
    return !!ta && ta === cb.commit?.tree?.sha;
  } catch {
    return false;
  }
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

/**
 * Апрувнуть деплой клиента ИМЕННО по доставленному коммиту и дождаться статуса.
 * Раньше брался «последний» деплой сразу — но после push новый деплой в Railway появляется не мгновенно,
 * поэтому апрувился старый (уже SUCCESS), а наш свежий висел NEEDS_APPROVAL. Теперь ждём появления нужного
 * коммита, апрувим именно его, и возвращаем matched=false, если задеплоен НЕ наш коммит (доставка не доехала).
 */
export async function approveClientDeploy(cd: ClientDeploy, expectCommit?: string, waitMs = 150000): Promise<DeployStatus> {
  if (!cdOk(cd)) throw new Error("Клиентский Railway не настроен (нужны token, projectId, environmentId, serviceId)");
  const get = async () => {
    const d = (await railwayGql(cd.railwayToken!, Q_DEPLOY, { p: cd.projectId, e: cd.environmentId, s: cd.serviceId })).data as { deployments?: { edges?: { node: { id: string; status: string; meta?: { commitHash?: string } } }[] } };
    return d?.deployments?.edges?.[0]?.node;
  };
  const want = (expectCommit || "").slice(0, 7);
  const isOurs = (n?: { meta?: { commitHash?: string } }) => !want || (n?.meta?.commitHash || "").startsWith(want);
  const deadline = Date.now() + waitMs;
  // 1) дождаться появления именно нашего деплоя (по коммиту), затем апрувнуть его.
  let dep = await get();
  while (Date.now() < deadline && want && !isOurs(dep)) {
    await new Promise((r) => setTimeout(r, 5000));
    dep = await get();
  }
  if (!dep) return { status: "PENDING", commit: want, approved: false, matched: false, note: "деплой ещё не появился" };
  const matched = isOurs(dep);
  if (dep.status === "NEEDS_APPROVAL") {
    await railwayGql(cd.railwayToken!, `mutation($id:String!){ deploymentApprove(id:$id) }`, { id: dep.id });
  }
  // 2) дождаться терминального статуса (или вернуть текущий «в процессе» — UI покажет, что идёт).
  const terminal = ["SUCCESS", "FAILED", "CRASHED", "REMOVED", "SKIPPED"];
  let last = dep;
  while (Date.now() < deadline && !terminal.includes(last.status)) {
    await new Promise((r) => setTimeout(r, 8000));
    last = (await get()) ?? last;
  }
  return { status: last.status, commit: (last.meta?.commitHash || "").slice(0, 8), approved: last.status !== "NEEDS_APPROVAL", matched: matched && isOurs(last) };
}

/**
 * Авто-доставка dev→client при «авто-готово» (autoApprove/autoDone). Доставляет по ВСЕМ парам репо
 * проекта (основная devGit/clientGit + meta.extraRepos: backend+frontend тощо).
 * - PR-режим (meta.clientDeliverPR): открывает PR в каждый client-репо (дев клиента мержит) — деплой-креды НЕ нужны.
 * - Прямой режим (squash в main): нужны Railway/Vercel-креды для апрува деплоя; миграция накатывается через preDeploy.
 * Возвращает массив результатов (по паре на репо) или null (нет пар / в прямом режиме нет деплой-кредов).
 */
export async function autoDeliverIfConfigured(meta: ProjectMeta): Promise<(DeliverResult & { deploy: DeployStatus | null })[] | null> {
  const pairs = [{ dev: meta.devGit, client: meta.clientGit }, ...(meta.extraRepos ?? [])]
    .filter((p): p is { dev: string; client: string } => !!p.dev && !!p.client);
  if (!pairs.length) return null;
  const asPR = !!meta.clientDeliverPR;
  const hasDeploy = !!(meta.clientDeploy?.railwayToken || meta.clientVercel?.token);
  if (!asPR && !hasDeploy) return null; // прямой режим без деплой-кредов — авто-доставку не запускаем
  const date = new Date().toISOString().slice(0, 10);
  const out: (DeliverResult & { deploy: DeployStatus | null })[] = [];
  for (const p of pairs) {
    const preview = await previewDelivery({ devGit: p.dev, clientGit: p.client });
    const res = await deliverDevToClient({
      devGit: p.dev,
      clientGit: p.client,
      targetBranch: meta.deliverBranch?.trim() || preview.clientDefaultBranch,
      message: `Lambertain auto-delivery — ${date}`,
      asPR,
    });
    let deploy: DeployStatus | null = null;
    // Деплой/апрув — только в прямом режиме (push в main триггерит деплой). В PR-режиме деплоить нечего (мержит дев клиента).
    if (!asPR && res.toDefault) {
      const sha = (res.commitUrl.match(/\/commit\/([0-9a-f]+)/) || [])[1] || "";
      if (meta.clientDeploy?.railwayToken) {
        // Апрувим ИМЕННО доставленный коммит (ждём его появления), ошибки не глотаем — попадут в уведомление.
        deploy = await approveClientDeploy(meta.clientDeploy, sha).catch(
          (e): DeployStatus => ({ status: "ERROR", commit: sha.slice(0, 8), approved: false, matched: false, note: e instanceof Error ? e.message : "ошибка апрува деплоя" }),
        );
      } else if (meta.clientVercel?.token) {
        await new Promise((r) => setTimeout(r, 6000));
        deploy = await vercelDeployStatus(meta.clientVercel).catch(
          (e): DeployStatus => ({ status: "ERROR", commit: sha.slice(0, 8), approved: false, note: e instanceof Error ? e.message : "ошибка статуса Vercel" }),
        );
      }
      // Гонка доставок: пока ждали/апрувили деплой, более поздняя доставка обогнала нашу. Контент уже в проде,
      // если задеплоенный коммит СОДЕРЖИТ наш (наш = предок) ЛИБО у него ТО ЖЕ дерево (идентичный контент —
      // соседняя одновременная доставка того же dev-HEAD). Иначе — ложный «НЕ той коміт» на нормальной обгонке.
      if (
        deploy && deploy.matched === false && deploy.commit && sha &&
        ((await commitReachable(p.client, sha, deploy.commit)) || (await sameCommitTree(p.client, sha, deploy.commit)))
      ) {
        deploy = { ...deploy, matched: true, note: [deploy.note, "паралельна доставка обігнала — наш контент уже в проді"].filter(Boolean).join("; ") };
      }
    }
    out.push({ ...res, deploy });
  }
  return out;
}

// ---- Готовность к автодоставке: чего не хватает в настройках (для тумблера на проекте) ----
export interface AutoDeliverIssue {
  /** error = автодоставка НЕ запустится; warn = запустится, но с оговоркой. */
  level: "error" | "warn";
  /** Код для перевода в UI: i18n-ключ deliver.chk.<code>. */
  code: "noPairs" | "gitflowConflict" | "noAutoApprove" | "directNoDeploy" | "railwayIncomplete";
  /** Доп. данные для шаблона (напр. список недостающих Railway-полей). */
  fields?: string;
}

/**
 * Проверка готовности проекта к автодоставке — зеркалит реальные условия autoDeliverIfConfigured()
 * и триггера авто-приёмки (/api/dev/status). Пустой массив = всё настроено, автодоставка сработает.
 * error — блокирует запуск; warn — доставка пойдёт, но часть пути (деплой/часть задач) не автоматизируется.
 */
export function autoDeliverReadiness(meta: ProjectMeta): AutoDeliverIssue[] {
  const issues: AutoDeliverIssue[] = [];

  // 1. Хотя бы одна полная пара репо dev→client (основная + extraRepos) — иначе доставлять нечего.
  const pairs = [{ dev: meta.devGit, client: meta.clientGit }, ...(meta.extraRepos ?? [])]
    .filter((p) => !!p.dev && !!p.client);
  if (!pairs.length) issues.push({ level: "error", code: "noPairs" });

  // 2. Режимы доставки взаимоисключающие: в /api/dev/status gitflow проверяется первым и перехватывает.
  if (meta.gitflowDelivery) issues.push({ level: "warn", code: "gitflowConflict" });

  // 3. Триггер: автодоставка идёт на авто-приёмке (meta.autoApprove или task.autoDone). Без autoApprove
  //    обычные задачи уходят на ручную приёмку и сами не доставляются.
  if (!meta.autoApprove) issues.push({ level: "warn", code: "noAutoApprove" });

  // 4. Деплой-креды: в прямом режиме (squash в main) без Railway/Vercel autoDeliverIfConfigured вернёт null.
  if (!meta.clientDeliverPR) {
    const cd = meta.clientDeploy;
    const hasRailway = !!cd?.railwayToken;
    const hasVercel = !!meta.clientVercel?.token;
    if (!hasRailway && !hasVercel) {
      issues.push({ level: "error", code: "directNoDeploy" });
    } else if (hasRailway) {
      // Авто-апрув Railway-деплоя требует полного набора (см. approveClientDeploy/cdOk).
      const miss = (["projectId", "environmentId", "serviceId"] as const).filter((k) => !cd?.[k]);
      if (miss.length) issues.push({ level: "warn", code: "railwayIncomplete", fields: miss.join(", ") });
    }
  }

  return issues;
}
