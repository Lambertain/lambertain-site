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

Проект ведётся в PM-портале Lambertain. Портал делает только лёгкий триаж (требование + теги) — спеку и
реализацию делаешь ТЫ здесь, с полным доступом к репозиторию. Работай по протоколу, не дожидаясь настройки.

1. **Возьми задачу.**
   - список: \`curl -s -H "Authorization: Bearer ${token}" "${BASE}/api/dev/tasks"\`
   - конкретная: \`.../api/dev/tasks?id=${projectKey}-<N>\` → поля: \`tags\` = \`{type, complexity, skills:[slug...]}\`, \`projectSpec\` = ПОЛНАЯ спека проекта.
   - **СНАЧАЛА прочитай \`projectSpec\` — это общий контекст всего проекта.** Почти все ответы (архитектура, стек, модель данных, требования) уже там. НЕ эскалируй то, что есть в спеке — решай по ней сам.
2. **Подключи скилы по тегам.** Плейбуки под задачу: \`curl -s -H "Authorization: Bearer ${token}" "${BASE}/api/dev/skills?tags=<tags.skills через запятую>"\` → следуй им.
   **Статусы ставишь ТЫ (Claude), а не разработчик** — автоматически по ходу работы (тело — через UTF-8 файл, как в п.5):
   - взял в работу → \`POST ${BASE}/api/dev/status\` \`{"taskId":"${projectKey}-<N>","status":"in_progress"}\`;
   - закончил → \`{"taskId":"${projectKey}-<N>","status":"review","summary":"<что сделано ПРОСТЫМИ словами на языке задачи, без тех-терминов — для клиента>"}\` (портал опубликует итог клиенту). Дальше задачу примет/вернёт постановщик.
   - Статусы Blocked (эскалация), Done/Доработка (постановщик) ставятся автоматически — их НЕ трогай.
3. **Действуй по сложности (\`tags.complexity\`):**
   - \`small\` (баг/правка/мелочь) — реализуй СРАЗУ по скилам и конвенциям этого репо, без церемоний.
   - \`feature\` (крупное/многофайловое/неоднозначное) — применяй spec-driven подход (github/spec-kit): сначала **spec** (что и критерии приёмки, опираясь на \`projectSpec\`) → **plan** (архитектура, затронутые файлы, риски) → **tasks** (шаги по порядку) → **implement**. План держи в СВОЁМ контексте — НЕ пуш его постановщику/Никите (не дёргай людей планами), просто реализуй.
   Конвенции проекта — твоя «конституция» (CLAUDE.md/AGENTS.md репо); читай их один раз в начале.
4. **Технические развилки решай САМ** разумным дефолтом по конвенциям — НЕ заставляй разработчика выбирать вариант.
5. **Нужно уточнение — эскалируй САМ (НЕ спрашивай человека-разработчика).** Любой вопрос по задаче решается через портал:
   - \`"kind":"client"\` (по умолчанию) — вопрос конечному КЛИЕНТУ (портал оформит от лица агентства, задача → Blocked);
   - \`"kind":"admin"\` — вопрос/решение ПОСТАНОВЩИКУ задачи (кто её создал — может быть Никита или админ-коллега; уйдёт именно ему).
   ВАЖНО ПРО КОДИРОВКУ: тело с кириллицей передавай ТОЛЬКО через файл в UTF-8 — инлайн \`-d '...'\` ломает кодировку в консоли Windows.
   - запиши тело в файл \`esc.json\` (UTF-8): \`{"taskId":"${projectKey}-<N>","question":"<вопрос>","kind":"client|admin"}\`
   - отправь: \`curl -s -X POST -H "Authorization: Bearer ${token}" -H "Content-Type: application/json; charset=utf-8" --data-binary @esc.json "${BASE}/api/dev/escalate"\`
6. **Перед продолжением перечитывай задачу** (\`?id=\`): \`awaitingClient: true\` — ещё ждём ответа; \`lastClientAnswer\` — ответ клиента. Продолжай по нему.

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
    if (repo.toLowerCase() === "lambertain/lambertain-site") continue; // сам портал — не раскладываем

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
