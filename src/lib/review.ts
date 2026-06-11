/**
 * On-demand ИИ код-ревью одной задачи (по кнопке разработчика, не автоматически).
 * Читает дифф по ссылке (review_ref: PR/коммит/ветка) либо HEAD dev-репо и выносит вердикт.
 * Не меняет статус задачи — это совет разработчику, решение остаётся за ним. Server-side only.
 */
import Anthropic from "@anthropic-ai/sdk";
import { repoFromGit } from "./github";
import { getProjectFull, getReviewRef, logUsage } from "./db";
import { getBackend } from "./tasks";

const MODEL = process.env.STRUCTURER_MODEL || "claude-opus-4-8";

export interface ReviewResult {
  verdict: "approve" | "rework";
  comment: string;
}

async function gh(path: string): Promise<unknown | null> {
  const r = await fetch("https://api.github.com" + path, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN || ""}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });
  return r.ok ? r.json() : null;
}

interface GhFile { filename: string; status: string; additions: number; deletions: number; patch?: string }

function filesToDiff(files: unknown): string {
  if (!Array.isArray(files)) return "";
  let out = "";
  for (const f of files as GhFile[]) {
    if (out.length > 12000) { out += "\n…(дифф обрезан)"; break; }
    out += `\n--- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions}) ---\n`;
    if (f.patch) out += f.patch.slice(0, 4000) + "\n";
  }
  return out;
}

/** Контекст кода для ревью по ссылке или HEAD дефолтной ветки. */
async function codeContext(repo: string, ref: string | null | undefined): Promise<{ title: string; diff: string } | null> {
  const r = (ref || "").trim();
  const prNum = r.match(/\/pull\/(\d+)/)?.[1] ?? (/^#?\d+$/.test(r) ? r.replace("#", "") : null);
  if (prNum) {
    const pr = (await gh(`/repos/${repo}/pulls/${prNum}`)) as { title?: string } | null;
    const files = await gh(`/repos/${repo}/pulls/${prNum}/files?per_page=100`);
    if (pr) return { title: `PR #${prNum}: ${pr.title ?? ""}`, diff: filesToDiff(files) };
  }
  const sha = r.match(/\/commit\/([0-9a-f]{7,40})/i)?.[1] ?? (/^[0-9a-f]{7,40}$/i.test(r) ? r : null);
  if (sha) {
    const c = (await gh(`/repos/${repo}/commits/${sha}`)) as { files?: unknown; commit?: { message?: string } } | null;
    if (c) return { title: `Commit ${sha.slice(0, 8)}`, diff: filesToDiff(c.files) };
  }
  // Ветка или HEAD дефолтной ветки.
  let branch = r;
  if (!branch) {
    const info = (await gh(`/repos/${repo}`)) as { default_branch?: string } | null;
    branch = info?.default_branch || "main";
  }
  const commits = (await gh(`/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=1`)) as Array<{ sha: string }> | null;
  const head = Array.isArray(commits) ? commits[0] : null;
  if (head?.sha) {
    const c = (await gh(`/repos/${repo}/commits/${head.sha}`)) as { files?: unknown } | null;
    if (c) return { title: `HEAD ${branch} (${head.sha.slice(0, 8)})`, diff: filesToDiff(c.files) };
  }
  return null;
}

/** Контекст кода задачи (дифф по review_ref или HEAD dev-репо) одной строкой — для ревью и ответов клиенту. */
export async function taskDiff(taskId: string): Promise<string | null> {
  const be = getBackend();
  const task = await be.getTask(taskId);
  const proj = await getProjectFull(task.projectKey);
  const repo = repoFromGit(proj?.meta.devGit) || repoFromGit(proj?.meta.clientGit);
  if (!repo) return null;
  const ctx = await codeContext(repo, await getReviewRef(taskId));
  return ctx ? `${ctx.title}\n${ctx.diff}` : null;
}

const TOOL: Anthropic.Tool = {
  name: "submit_review",
  description: "Вынести вердикт код-ревью задачи.",
  input_schema: {
    type: "object",
    properties: {
      verdict: { type: "string", enum: ["approve", "rework"], description: "approve — готово; rework — есть существенные доработки." },
      comment: { type: "string", description: "Кратко по делу: что хорошо / что доделать (для rework — конкретные пункты)." },
    },
    required: ["verdict", "comment"],
  },
};

/** Запустить ревью задачи. Возвращает вердикт и комментарий. Бросает при отсутствии ключа/ошибке API. */
export async function runReview(taskId: string): Promise<ReviewResult> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY не задан");
  const be = getBackend();
  const task = await be.getTask(taskId);
  const proj = await getProjectFull(task.projectKey);
  const repo = repoFromGit(proj?.meta.devGit) || repoFromGit(proj?.meta.clientGit);
  const reviewRef = await getReviewRef(taskId); // ссылка разраба на коммит/PR/ветку (опц.)
  const ctx = repo ? await codeContext(repo, reviewRef) : null;

  const system =
    "Ты — старший инженер агентства Lambertain, проводишь код-ревью выполненной задачи по запросу разработчика. " +
    "Оцени, решает ли изменение задачу качественно (корректность, edge-cases, конвенции, отсутствие регрессий). " +
    "Если всё ок — approve. Если есть существенные недочёты — rework с конкретным списком доработок. " +
    "Будь требователен, но не придирайся к мелочам стиля. Отвечай инструментом submit_review.";
  const userText = [
    `Задача: ${task.summary}`,
    task.description ? `Описание:\n${task.description.slice(0, 4000)}` : "",
    ctx ? `\nКод на ревью — ${ctx.title}\n${ctx.diff || "(дифф пуст)"}` : "\n⚠ Код получить не удалось (нет dev-репо или доступа). Оцени по описанию; если кода не видно — rework с просьбой приложить ссылку на коммит/PR.",
  ].filter(Boolean).join("\n\n");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let inTok = 0, outTok = 0;
  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "submit_review" },
      messages: [{ role: "user", content: userText }],
    });
    inTok = resp.usage.input_tokens;
    outTok = resp.usage.output_tokens;
    const tu = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const input = (tu?.input ?? {}) as { verdict?: string; comment?: string };
    return {
      verdict: input.verdict === "approve" ? "approve" : "rework",
      comment: input.comment || "—",
    };
  } finally {
    await logUsage(MODEL, "review", inTok, outTok);
  }
}
