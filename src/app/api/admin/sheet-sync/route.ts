/**
 * Авто-оновлення Google-таблиці обліку задач (для клієнта). Дёргается поллером (throttle ~15 хв).
 * Для КОЖНОГО проєкту з `meta.customFields.sheet.id` збирає таблицю:
 *   Задача | Назва | Trello № | Бекенд PR | Застосунок PR | Передано на тест | Статус приймання
 * Джерела: задачі+статуси (портал БД), PR-стан (GitHub), номер картки Trello (з опису задачі → дошка).
 * Пише ЛИШЕ значення — форматування таблиці виставлене раніше вручну й переживає оновлення.
 * Авторизація: Authorization: Bearer <ADMIN_API_TOKEN>. Помилки — в лог/відповідь, не в тред задач.
 */
import { NextResponse } from "next/server";
import { listProjectsWithMeta, listTaskPrs, getState, setState } from "@/lib/db";
import { getBackend } from "@/lib/tasks";
import { trelloCfg } from "@/lib/trello";
import { ghFetchRetry } from "@/lib/github";
import { writeSheetValues } from "@/lib/sheet";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

const GH = { Authorization: `Bearer ${process.env.GITHUB_TOKEN || ""}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
const THROTTLE_MS = 15 * 60 * 1000;

// Задачі-«двійники» (бекенд-половина/батьківська) без посилання на картку в описі → номер картки Trello вручну.
const TRELLO_OVERRIDE: Record<string, Record<string, number>> = {
  SAD: { "SAD-1": 25, "SAD-4": 36, "SAD-5": 24, "SAD-6": 15, "SAD-7": 40, "SAD-13": 52 },
};

type PrState = { merged: boolean; mergeableState: string | null; createdAt: string | null; number: number; isBackend: boolean };

async function prState(prUrl: string): Promise<PrState | null> {
  const m = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!m) return null;
  const [, owner, repo, num] = m;
  try {
    const r = await ghFetchRetry(`https://api.github.com/repos/${owner}/${repo}/pulls/${num}`, { headers: GH, cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { merged?: boolean; mergeable_state?: string; created_at?: string };
    return { merged: !!j.merged, mergeableState: j.mergeable_state ?? null, createdAt: j.created_at ?? null, number: Number(num), isBackend: /backend/i.test(repo) };
  } catch {
    return null;
  }
}

function prCell(p: PrState | undefined, url: string | undefined): string {
  if (!p || !url) return "";
  let tag: string;
  if (p.merged) tag = `#${p.number} злито`;
  else if (p.mergeableState === "dirty") tag = `#${p.number} конфлікт`;
  else tag = `#${p.number} готово`;
  return `=HYPERLINK("${url}";"${tag}")`;
}

function statusText(state: string | undefined, back?: PrState, app?: PrState): string {
  const base: Record<string, string> = { Done: "Прийнято ✓", Blocked: "Блокер — потрібне ваше рішення", Open: "У черзі", "In Progress": "Доробка в роботі" };
  if (state && base[state]) return base[state];
  const opens = [back, app].filter((p): p is PrState => !!p && !p.merged);
  if (opens.some((p) => p.mergeableState === "dirty")) return "На тестуванні (оновлюю гілку)";
  if (opens.length) return "На тестуванні (готово до злиття)";
  const known = [back, app].filter((p): p is PrState => !!p);
  if (known.length && known.every((p) => p.merged)) return "Злито, очікує приймання";
  return "На тестуванні";
}

async function syncProject(key: string, meta: import("@/lib/tasks/types").ProjectMeta, sheetId: string): Promise<{ key: string; rows: number; trelloFilled: number }> {
  const be = getBackend();
  const tasks = await be.listTasks({ projectKey: key });

  // PR-и по задачах
  const prRows = await listTaskPrs(key);
  const urlsByTask = new Map<string, string[]>();
  for (const r of prRows) {
    const a = urlsByTask.get(r.readable_id) ?? [];
    a.push(r.pr_url);
    urlsByTask.set(r.readable_id, a);
  }
  const uniqueUrls = [...new Set(prRows.map((r) => r.pr_url))];
  const stateByUrl = new Map<string, PrState>();
  await Promise.all(uniqueUrls.map(async (u) => {
    const s = await prState(u);
    if (s) stateByUrl.set(u, s);
  }));

  // Trello: картки дошки + номер картки з опису задачі
  const cfg = trelloCfg(meta);
  const numByTask = new Map<string, number>();
  const urlByNum = new Map<number, string>();
  if (cfg) {
    try {
      const r = await fetch(`https://api.trello.com/1/boards/${cfg.board}/cards?fields=idShort,shortLink,shortUrl&key=${cfg.key}&token=${cfg.token}`, { cache: "no-store" });
      if (r.ok) {
        const cards = (await r.json()) as { idShort: number; shortLink: string; shortUrl: string }[];
        const bySlug = new Map(cards.map((c) => [c.shortLink, c]));
        for (const c of cards) urlByNum.set(c.idShort, c.shortUrl);
        for (const t of tasks) {
          const mm = (t.description || "").match(/trello\.com\/c\/([A-Za-z0-9]+)/);
          const card = mm ? bySlug.get(mm[1]) : undefined;
          const n = card ? card.idShort : TRELLO_OVERRIDE[key]?.[t.id];
          if (n) numByTask.set(t.id, n);
        }
      }
    } catch { /* best-effort */ }
  }

  const header = ["Задача", "Назва", "Trello №", "Бекенд PR", "Застосунок PR", "Передано на тест", "Статус приймання"];
  const sorted = [...tasks].sort((a, b) => (Number(a.id.split("-")[1]) || 0) - (Number(b.id.split("-")[1]) || 0));
  const rows: (string | number)[][] = [header];
  for (const t of sorted) {
    const urls = urlsByTask.get(t.id) ?? [];
    const states = urls.map((u) => ({ u, s: stateByUrl.get(u) })).filter((x) => x.s) as { u: string; s: PrState }[];
    const backPr = states.filter((x) => x.s.isBackend).sort((a, b) => b.s.number - a.s.number)[0];
    const appPr = states.filter((x) => !x.s.isBackend).sort((a, b) => b.s.number - a.s.number)[0];
    const dates = states.map((x) => x.s.createdAt).filter(Boolean).map((d) => d!.slice(0, 10));
    const num = numByTask.get(t.id);
    const trelloCell = num ? (urlByNum.get(num) ? `=HYPERLINK("${urlByNum.get(num)}";"#${num}")` : `#${num}`) : "";
    rows.push([
      t.id, t.summary || "", trelloCell,
      prCell(backPr?.s, backPr?.u), prCell(appPr?.s, appPr?.u),
      dates.length ? dates.sort()[0] : "",
      statusText(t.state, backPr?.s, appPr?.s),
    ]);
  }

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
  await writeSheetValues(sheetId, rows, stamp);
  return { key, rows: rows.length - 1, trelloFilled: numByTask.size };
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  const force = new URL(req.url).searchParams.get("force") === "1";
  const projects = (await listProjectsWithMeta()).filter((p) => !p.archived && typeof p.meta.customFields?.sheet?.id === "string");
  const out: unknown[] = [];
  for (const p of projects) {
    const sheetId = p.meta.customFields!.sheet!.id;
    const stateKey = `sheet_sync:${p.key}`;
    if (!force) {
      const last = await getState(stateKey);
      if (last && Date.now() - Number(last) < THROTTLE_MS) { out.push({ key: p.key, skipped: "throttled" }); continue; }
    }
    try {
      const res = await syncProject(p.key, p.meta, sheetId);
      await setState(stateKey, String(Date.now()));
      out.push(res);
    } catch (e) {
      out.push({ key: p.key, error: String((e as Error).message || e) });
    }
  }
  return NextResponse.json({ ok: true, projects: out });
}
