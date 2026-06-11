/**
 * Раскладка протокола работы с порталом в CLAUDE.md дев-репозиториев (Lambertain/*).
 * Идемпотентно: секция между <!-- LAMBERTAIN-PROTOCOL:START/END --> заменяется, иначе добавляется.
 * Только в наши dev-репо (devGit = github.com/Lambertain/...), не в клиентские (там утёк бы токен).
 *
 * Запуск: node --env-file=.env.local scripts/distribute-protocol.mjs   (DATABASE_URL — прод через TCP-прокси)
 * Нужны: DATABASE_URL, GITHUB_TOKEN.
 */
import pg from "pg";
import { randomBytes } from "node:crypto";

const GH = process.env.GITHUB_TOKEN;
const BASE = "https://lambertain-site-production.up.railway.app";
const START = "<!-- LAMBERTAIN-PROTOCOL:START -->";
const END = "<!-- LAMBERTAIN-PROTOCOL:END -->";

function repoFromGit(url) {
  if (!url) return null;
  const m = String(url).match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?(?:$|[/?#])/i);
  return m ? m[1] : null;
}

function protocolBlock(token, projectKey) {
  return `${START}
## Протокол задач Lambertain (для Claude Code)

Проект ведётся в PM-портале Lambertain. Работай по протоколу, не дожидаясь, пока разработчик что-то настроит.

1. **Возьми задачу.** В начале сессии:
   - список: \`curl -s -H "Authorization: Bearer ${token}" "${BASE}/api/dev/tasks"\`
   - конкретная (спека + тред комментов): \`.../api/dev/tasks?id=${projectKey}-<N>\`
2. **Следуй спеке.** Технические развилки решай САМ разумным дефолтом по конвенциям этого репо — НЕ заставляй разработчика выбирать вариант.
3. **Вопрос клиенту — эскалируй сам** (а не спрашивай разработчика):
   \`curl -s -X POST -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d '{"taskId":"${projectKey}-<N>","question":"<твой вопрос>"}' "${BASE}/api/dev/escalate"\`
   Портал оформит вопрос клиенту от лица агентства и уведомит его в Telegram. Продолжай незаблокированные части.
4. **Перед продолжением перечитывай задачу** (\`?id=\`): \`awaitingClient: true\` — ещё ждём ответа; \`lastClientAnswer\` и тред комментариев — ответ клиента. Продолжай по нему.
5. **Продуктовое/бизнес-решение**, которое не вправе принять сам — эскалируй с \`{"kind":"admin", ...}\` (придёт Никите).

Токен проекта — ниже; в публичный код не коммитить.
Project: \`${projectKey}\` · Token: \`${token}\`
${END}`;
}

async function gh(path, init) {
  return fetch("https://api.github.com" + path, {
    ...init,
    headers: { Authorization: `Bearer ${GH}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(init?.body ? { "Content-Type": "application/json" } : {}) },
  });
}

function mergeClaudeMd(existing, block) {
  if (existing && existing.includes(START) && existing.includes(END)) {
    return existing.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block);
  }
  return (existing ? existing.trimEnd() + "\n\n" : "") + block + "\n";
}

async function main() {
  if (!process.env.DATABASE_URL || !GH) {
    console.error("Нужны DATABASE_URL и GITHUB_TOKEN");
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes("sslmode=require") ? { rejectUnauthorized: false } : false, max: 2 });
  const projects = (await pool.query("SELECT key, meta FROM projects WHERE archived = false")).rows;
  const tokens = new Map((await pool.query("SELECT project_key, token FROM project_api_tokens")).rows.map((r) => [r.project_key, r.token]));

  let done = 0;
  for (const p of projects) {
    const devGit = p.meta?.devGit;
    const repo = repoFromGit(devGit);
    if (!repo || !/^Lambertain\//i.test(repo)) continue; // только наши репо

    // токен (генерируем, если нет)
    let token = tokens.get(p.key);
    if (!token) {
      token = `pk_${randomBytes(20).toString("hex")}`;
      await pool.query("INSERT INTO project_api_tokens (project_key, token) VALUES ($1,$2) ON CONFLICT (project_key) DO UPDATE SET token=EXCLUDED.token", [p.key, token]);
    }

    // читаем CLAUDE.md
    let existing = "", sha;
    const r = await gh(`/repos/${repo}/contents/CLAUDE.md`);
    if (r.ok) { const j = await r.json(); existing = Buffer.from(j.content, "base64").toString("utf-8"); sha = j.sha; }
    else if (r.status !== 404) { console.error(`${p.key} (${repo}): read ${r.status}`); continue; }

    const next = mergeClaudeMd(existing, protocolBlock(token, p.key));
    if (next === existing) { console.log(`${p.key}: без изменений`); continue; }

    const put = await gh(`/repos/${repo}/contents/CLAUDE.md`, {
      method: "PUT",
      body: JSON.stringify({ message: "chore: протокол задач Lambertain (Claude Code)", content: Buffer.from(next, "utf-8").toString("base64"), sha }),
    });
    if (put.ok) { console.log(`${p.key} → ${repo}: CLAUDE.md обновлён`); done++; }
    else console.error(`${p.key} (${repo}): write ${put.status} ${(await put.text()).slice(0, 200)}`);
  }
  console.log(`\nГотово: обновлено репо ${done}`);
  await pool.end();
}

main().catch((e) => { console.error("Ошибка:", e); process.exit(1); });
