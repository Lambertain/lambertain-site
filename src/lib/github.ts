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

/** Поиск по коду репо. */
export async function searchCode(repo: string, query: string): Promise<string> {
  const r = await gh(`/search/code?q=${encodeURIComponent(`${query} repo:${repo}`)}&per_page=10`);
  if (!r.ok) return `Ошибка поиска ${r.status}`;
  const data = (await r.json()) as { items?: Array<{ path: string }>; message?: string };
  if (!data.items) return data.message || "нет результатов";
  if (!data.items.length) return "ничего не найдено";
  return data.items.map((x) => x.path).join("\n");
}
