/**
 * git-sync — отдельный Railway-сервис проекта lambertain (internal-only, без публичного домена).
 *
 * Зеркалит клиентские репо → наши дев-репо (client → dev): тянет свежие клиентские интеграционные
 * ветки (дефолтная + develop) и публикует их в наш дев-репо как `client-sync/<branch>` (реальная
 * git-история, те же SHA). Разработчик локально делает git fetch + merge/rebase — конфликты сам.
 *
 * Почему отдельный сервис, а не в web-портале: нужен системный git в рантайме (Railpack/Nixpacks
 * его не дают), плюс изоляция и переиспользование под будущих клиентов со «спільна розробка».
 * git гарантирован Dockerfile (apt git). Вызывается только из web-портала по internal-сети с секретом.
 *
 * Контракт: POST /sync  Authorization: Bearer $GIT_SYNC_SECRET
 *   body  { pairs: [{ dev, client }] }
 *   resp  { results: [{ devRepo, clientRepo, branches:[{branch,sha}], error? }] }
 * GET /health → "ok"
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.PORT) || 8080;
const SECRET = process.env.GIT_SYNC_SECRET || "";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const SYNC_PREFIX = "client-sync/";

/** Lambertain/allumma из https://github.com/Lambertain/allumma.git */
function repoFromGit(url) {
  if (!url) return null;
  const m = String(url).match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?(?:$|[/?#])/i);
  return m ? m[1] : null;
}

function git(args, cwd) {
  return new Promise((resolve) => {
    const p = spawn("git", args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "echo" } });
    let stdout = "", stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    p.on("error", (e) => resolve({ code: 127, stdout, stderr: String(e?.message || e) }));
  });
}

const httpsUrl = (repo) => `https://github.com/${repo}.git`;

/** Какие клиентские ветки зеркалить: дефолтная + develop (если существует). Без ручных флагов. */
async function pickBranches(dir, clientUrl, hdr) {
  const sym = await git([...hdr, "ls-remote", "--symref", clientUrl, "HEAD"], dir);
  const def = sym.stdout.match(/ref:\s+refs\/heads\/(\S+)\s+HEAD/)?.[1] || "main";
  const heads = await git([...hdr, "ls-remote", "--heads", clientUrl], dir);
  const existing = new Set(
    heads.stdout.split("\n").map((l) => l.split(/\s+/)[1]).filter(Boolean).map((r) => r.replace("refs/heads/", "")),
  );
  return [...new Set([def, "develop"])].filter((b) => existing.has(b));
}

/** Зеркалировать одну пару репо client → dev. */
async function syncPair(devGit, clientGit) {
  const devRepo = repoFromGit(devGit);
  const clientRepo = repoFromGit(clientGit);
  if (!devRepo || !clientRepo) {
    return { devRepo: devRepo || "?", clientRepo: clientRepo || "?", branches: [], error: "не распознан dev/client репозиторий" };
  }
  const hdr = ["-c", `http.extraHeader=Authorization: Bearer ${GITHUB_TOKEN}`];
  const devUrl = httpsUrl(devRepo);
  const clientUrl = httpsUrl(clientRepo);
  const dir = await mkdtemp(join(tmpdir(), "lmb-sync-"));
  try {
    const init = await git(["init", "-q", "--initial-branch=main"], dir);
    if (init.code === 127) return { devRepo, clientRepo, branches: [], error: "git не найден в рантайме" };

    const wanted = await pickBranches(dir, clientUrl, hdr);
    if (!wanted.length) return { devRepo, clientRepo, branches: [], error: "у клиента нет веток main/develop" };

    // Полная история нужна разработчику для merge-base при локальном мерже.
    const fetchRes = await git(
      [...hdr, "fetch", "--no-tags", clientUrl, ...wanted.map((b) => `+refs/heads/${b}:refs/remotes/client/${b}`)],
      dir,
    );
    if (fetchRes.code !== 0) return { devRepo, clientRepo, branches: [], error: `fetch client: ${fetchRes.stderr.slice(0, 200)}` };

    const pushRes = await git(
      [...hdr, "push", "--force", devUrl, ...wanted.map((b) => `refs/remotes/client/${b}:refs/heads/${SYNC_PREFIX}${b}`)],
      dir,
    );
    if (pushRes.code !== 0) return { devRepo, clientRepo, branches: [], error: `push dev: ${pushRes.stderr.slice(0, 200)}` };

    const branches = [];
    for (const b of wanted) {
      const sha = (await git(["rev-parse", `refs/remotes/client/${b}`], dir)).stdout.trim();
      branches.push({ branch: b, sha: sha.slice(0, 8) });
    }
    return { devRepo, clientRepo, branches };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function send(res, status, body) {
  const s = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(s);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 1_000_000) reject(new Error("body too large")); });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function handleSync(req, res) {
  const auth = req.headers.authorization || "";
  if (!SECRET || auth !== `Bearer ${SECRET}`) return send(res, 403, { error: "forbidden" });
  if (!GITHUB_TOKEN) return send(res, 500, { error: "нет GITHUB_TOKEN" });
  let pairs;
  try {
    pairs = JSON.parse(await readBody(req)).pairs;
  } catch {
    return send(res, 400, { error: "bad json" });
  }
  if (!Array.isArray(pairs) || !pairs.length) return send(res, 400, { error: "no pairs" });
  const results = [];
  for (const p of pairs) {
    if (!p?.dev || !p?.client) continue;
    results.push(await syncPair(p.dev, p.client));
  }
  return send(res, 200, { results });
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true });
  if (req.method === "POST" && req.url === "/sync") {
    handleSync(req, res).catch((e) => send(res, 500, { error: String(e?.message || e) }));
    return;
  }
  send(res, 404, { error: "not found" });
});

// `::` — слушаем и IPv6 (Railway private networking) и IPv4-mapped.
server.listen(PORT, "::", () => console.log(`git-sync listening on :${PORT}`));
