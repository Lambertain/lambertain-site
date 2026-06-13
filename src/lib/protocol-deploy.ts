/**
 * Раскладка протокола Lambertain в CLAUDE.md наших дев-репо (Lambertain/*) через GitHub API.
 * Единый источник текста — protocolBlock из dev-protocol.ts. Server-side only (нужен GITHUB_TOKEN).
 *
 * Токен/протокол НЕ утекает клиенту: deliver.ts вырезает LAMBERTAIN-PROTOCOL-блок при push dev→client.
 * Раскладываем только в НАШИ репо (Lambertain/*), не в клиентские.
 */
import { randomBytes } from "node:crypto";
import { protocolBlock } from "./dev-protocol";
import { repoFromGit } from "./github";
import { getProjectFull, listProjectsWithMeta, getProjectTokens, setProjectToken } from "./db";

const API = "https://api.github.com";
const START = "<!-- LAMBERTAIN-PROTOCOL:START -->";
const END = "<!-- LAMBERTAIN-PROTOCOL:END -->";
const SELF_REPO = "lambertain/lambertain-site"; // сам портал — протокол не раскладываем (мы тут и так в контексте)

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

function mergeClaudeMd(existing: string, block: string): string {
  if (existing && existing.includes(START) && existing.includes(END)) {
    return existing.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block);
  }
  return (existing ? existing.trimEnd() + "\n\n" : "") + block + "\n";
}

export type LayStatus = "updated" | "unchanged" | "skipped" | "error";
export interface LayResult { key: string; repo?: string; status: LayStatus; detail?: string }

/** Разложить протокол в дев-репо одного проекта (идемпотентно). */
export async function layProtocol(projectKey: string): Promise<LayResult> {
  if (!process.env.GITHUB_TOKEN) return { key: projectKey, status: "error", detail: "нет GITHUB_TOKEN" };
  const p = await getProjectFull(projectKey);
  const repo = repoFromGit(p?.meta.devGit);
  if (!repo || !/^Lambertain\//i.test(repo)) return { key: projectKey, status: "skipped", detail: "не наш dev-репо" };
  if (repo.toLowerCase() === SELF_REPO) return { key: projectKey, repo, status: "skipped", detail: "портал" };

  // токен проекта (генерируем, если нет)
  let token = (await getProjectTokens()).get(projectKey);
  if (!token) { token = `pk_${randomBytes(20).toString("hex")}`; await setProjectToken(projectKey, token); }

  let existing = "", sha: string | undefined;
  const r = await gh(`/repos/${repo}/contents/CLAUDE.md`);
  if (r.ok) { const j = (await r.json()) as { content: string; sha: string }; existing = Buffer.from(j.content, "base64").toString("utf-8"); sha = j.sha; }
  else if (r.status !== 404) return { key: projectKey, repo, status: "error", detail: `read ${r.status}` };

  const next = mergeClaudeMd(existing, protocolBlock(token, projectKey));
  if (next === existing) return { key: projectKey, repo, status: "unchanged" };

  const put = await gh(`/repos/${repo}/contents/CLAUDE.md`, {
    method: "PUT",
    body: JSON.stringify({ message: "chore: протокол задач Lambertain (Claude Code)", content: Buffer.from(next, "utf-8").toString("base64"), sha }),
  });
  if (!put.ok) return { key: projectKey, repo, status: "error", detail: `write ${put.status} ${(await put.text()).slice(0, 150)}` };
  return { key: projectKey, repo, status: "updated" };
}

/** Разложить/обновить протокол во всех наших дев-репо (для обновления текста протокола). */
export async function layProtocolAll(): Promise<LayResult[]> {
  const projects = await listProjectsWithMeta();
  const out: LayResult[] = [];
  for (const p of projects.filter((x) => !x.archived)) out.push(await layProtocol(p.key));
  return out;
}
