/**
 * Чтение репозитория через GitHub API (для сверки задачи с кодом).
 * Только чтение. Server-side only. Токен: GITHUB_TOKEN.
 */
const API = "https://api.github.com";

/** Lambertain/allumma из https://github.com/Lambertain/allumma.git */
export function repoFromGit(url: string | undefined): string | null {
  if (!url) return null;
  const m = url.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?(?:$|[/?#])/i);
  return m ? m[1] : null;
}

/**
 * fetch к GitHub с ретраем на ВРЕМЕННЫЕ сбои, чтобы разовый блип не давал ложную тревогу
 * (поллеры синка стадий/код-ревью отчитываются об ошибке в задачу — нельзя дёргать на транзиент).
 * Ретраим: сетевой сбой (throw), 5xx, 429 (rate limit), а также 401/403 — GitHub их иногда отдаёт
 * на secondary-rate-limit/распространении токена, и они самолечатся. 404/422 — НЕ временные, не ретраим.
 * Настоящий устойчивый сбой (бэд-токен и т.п.) переживёт ретрай и всё равно всплывёт.
 */
const TRANSIENT = (s: number) => s === 401 || s === 403 || s === 429 || s >= 500;
export async function ghFetchRetry(url: string, init?: RequestInit, retries = 1, delayMs = 1200): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url, init);
      if (!TRANSIENT(r.status) || attempt >= retries) return r;
    } catch (e) {
      if (attempt >= retries) throw e;
    }
    await new Promise((res) => setTimeout(res, delayMs));
  }
}

async function gh(path: string): Promise<Response> {
  return fetch(API + path, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN || ""}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });
}

/** Список содержимого директории репо. */
export async function listDir(repo: string, path = ""): Promise<string> {
  const r = await gh(`/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`);
  if (!r.ok) return `Ошибка ${r.status} для ${repo}/${path}`;
  const data = (await r.json()) as Array<{ name: string; type: string }> | { message: string };
  if (!Array.isArray(data)) return data.message || "не директория";
  return data.map((x) => `${x.type === "dir" ? "📁" : "📄"} ${x.name}`).join("\n");
}

/** Чтение файла (с обрезкой больших). */
export async function readFile(repo: string, path: string): Promise<string> {
  const r = await gh(`/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`);
  if (!r.ok) return `Ошибка ${r.status} для ${repo}/${path}`;
  const data = (await r.json()) as { content?: string; encoding?: string; message?: string };
  if (!data.content) return data.message || "не файл";
  const text = Buffer.from(data.content, (data.encoding as BufferEncoding) || "base64").toString("utf-8");
  return text.length > 12000 ? text.slice(0, 12000) + "\n…(обрезано)" : text;
}

async function defaultBranch(repo: string): Promise<string> {
  const r = await gh(`/repos/${repo}`);
  if (!r.ok) return "main";
  return ((await r.json()) as { default_branch?: string }).default_branch || "main";
}

/**
 * Всё дерево файлов репо ОДНИМ вызовом (рекурсивно). Даёт модели мгновенную ориентацию —
 * особенно когда приложение во вложенной папке. sub — фильтр по префиксу пути (опц.).
 */
export async function listTree(repo: string, sub = ""): Promise<string> {
  const branch = await defaultBranch(repo);
  const r = await gh(`/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  if (!r.ok) return `Ошибка ${r.status} (дерево ${repo})`;
  const data = (await r.json()) as { tree?: Array<{ path: string; type: string }>; truncated?: boolean; message?: string };
  if (!data.tree) return data.message || "не удалось получить дерево";
  let paths = data.tree.filter((t) => t.type === "blob").map((t) => t.path);
  if (sub) paths = paths.filter((p) => p.toLowerCase().startsWith(sub.toLowerCase()));
  const cap = 500;
  const head = paths.slice(0, cap).join("\n");
  const more = paths.length > cap ? `\n…(+${paths.length - cap} файлов, уточни sub)` : data.truncated ? "\n…(дерево GitHub обрезано)" : "";
  return paths.length ? head + more : "пусто";
}

/** Поиск по коду репо. Для приватных репо GitHub code-search часто пуст — тогда ищем по ПУТЯМ файлов. */
export async function searchCode(repo: string, query: string): Promise<string> {
  const r = await gh(`/search/code?q=${encodeURIComponent(`${query} repo:${repo}`)}&per_page=10`);
  if (r.ok) {
    const data = (await r.json()) as { items?: Array<{ path: string }> };
    if (data.items && data.items.length) return data.items.map((x) => x.path).join("\n");
  }
  // Фолбэк: поиск по именам/путям файлов в дереве (содержимое для private не индексируется).
  const tree = await listTree(repo);
  if (tree.startsWith("Ошибка")) return tree;
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = tree.split("\n").filter((p) => terms.some((t) => p.toLowerCase().includes(t)));
  if (!hits.length) return "По содержимому не найдено (для private GitHub не индексирует код). Используй list_tree и читай файлы по структуре.";
  return "Совпадения по путям файлов:\n" + hits.slice(0, 30).join("\n");
}
