/**
 * Бэкофилл вложений импортированных задач: скачивает картинки из YouTrack в нашу БД
 * и переписывает в описании markdown-ссылки `![](имя.png)` → `![](/api/files/<id>)`.
 *
 * Зачем: импорт сохранил только текст описания YouTrack, где картинка — это имя вложения,
 * а файл лежит по подписанному (истекающему) URL YouTrack. Самохостим, чтобы не зависеть от YT.
 *
 * Запуск: node --env-file=.env.local scripts/import-attachments.mjs
 * Переменные: DATABASE_URL, YOUTRACK_URL, YOUTRACK_TOKEN. Идемпотентно (повторный запуск безопасен).
 */
import pg from "pg";

const BASE = (process.env.YOUTRACK_URL || "").replace(/\/$/, "");
const TOKEN = process.env.YOUTRACK_TOKEN || "";

if (!process.env.DATABASE_URL || !BASE || !TOKEN) {
  console.error("Нужны DATABASE_URL, YOUTRACK_URL, YOUTRACK_TOKEN");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("sslmode=require") ? { rejectUnauthorized: false } : false,
  max: 3,
});

async function yt(path, params = {}) {
  const u = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  const r = await fetch(u, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" } });
  if (!r.ok) throw new Error(`YouTrack ${r.status} ${path}`);
  return r.json();
}

async function download(url) {
  const full = url.startsWith("http") ? url : BASE + url;
  const r = await fetch(full, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) throw new Error(`download ${r.status} ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

async function main() {
  const dry = process.env.DRY_RUN === "1";
  // Задачи с markdown-картинкой в описании, ещё не переписанные на /api/files.
  const { rows } = await pool.query(
    `SELECT id, yt_id, readable_id, description FROM tasks
      WHERE yt_id IS NOT NULL AND description LIKE '%![%' AND description NOT LIKE '%/api/files/%'`,
  );
  console.log(`Кандидатов на бэкофилл: ${rows.length}${dry ? " (DRY_RUN)" : ""}`);

  let tasksDone = 0, imgs = 0;
  for (const task of rows) {
    let issue;
    try {
      issue = await yt(`/api/issues/${task.yt_id}`, { fields: "attachments(name,url,mimeType)" });
    } catch (e) {
      console.error(`${task.readable_id}: ${e.message}`);
      continue;
    }
    const atts = (issue.attachments || []).filter((a) => /^image\//.test(a.mimeType || ""));
    if (!atts.length) continue;

    let descr = task.description;
    let changed = false;
    for (const a of atts) {
      // Картинка реально упомянута в описании?
      if (!descr.includes(`](${a.name})`)) continue;
      let attId;
      if (dry) {
        attId = "DRY";
      } else {
        const data = await download(a.url);
        const ins = await pool.query(
          `INSERT INTO attachments (task_id, name, mime, data) VALUES ($1,$2,$3,$4)
           ON CONFLICT (task_id, name) DO UPDATE SET mime=EXCLUDED.mime, data=EXCLUDED.data
           RETURNING id`,
          [task.id, a.name, a.mimeType, data],
        );
        attId = ins.rows[0].id;
      }
      descr = descr.split(`](${a.name})`).join(`](/api/files/${attId})`);
      changed = true;
      imgs++;
    }
    if (changed && !dry) {
      await pool.query("UPDATE tasks SET description = $2 WHERE id = $1", [task.id, descr]);
    }
    if (changed) { tasksDone++; console.log(`${task.readable_id}: ${atts.length} img`); }
  }
  console.log(`Задачи: ${tasksDone}, картинок ${imgs}.`);

  // --- Картинки в комментариях ---
  const { rows: crows } = await pool.query(
    `SELECT c.id, c.task_id, c.body, t.readable_id, t.yt_id FROM comments c
       JOIN tasks t ON t.id = c.task_id
      WHERE t.yt_id IS NOT NULL AND c.body LIKE '%![%' AND c.body NOT LIKE '%/api/files/%'`,
  );
  // Группируем по задаче (одна выборка вложений на issue).
  const byTask = new Map();
  for (const r of crows) {
    if (!byTask.has(r.yt_id)) byTask.set(r.yt_id, []);
    byTask.get(r.yt_id).push(r);
  }
  let commentImgs = 0, commentsDone = 0;
  for (const [ytId, list] of byTask) {
    let issue;
    try {
      issue = await yt(`/api/issues/${ytId}`, { fields: "attachments(name,url,mimeType)" });
    } catch (e) {
      console.error(`comments ${ytId}: ${e.message}`);
      continue;
    }
    const atts = (issue.attachments || []).filter((a) => /^image\//.test(a.mimeType || ""));
    for (const cr of list) {
      let body = cr.body, changed = false;
      for (const a of atts) {
        if (!body.includes(`](${a.name})`)) continue;
        let attId;
        if (dry) attId = "DRY";
        else {
          const data = await download(a.url);
          const ins = await pool.query(
            `INSERT INTO attachments (task_id, name, mime, data) VALUES ($1,$2,$3,$4)
             ON CONFLICT (task_id, name) DO UPDATE SET mime=EXCLUDED.mime, data=EXCLUDED.data RETURNING id`,
            [cr.task_id, a.name, a.mimeType, data],
          );
          attId = ins.rows[0].id;
        }
        body = body.split(`](${a.name})`).join(`](/api/files/${attId})`);
        changed = true;
        commentImgs++;
      }
      if (changed && !dry) await pool.query("UPDATE comments SET body = $2 WHERE id = $1", [cr.id, body]);
      if (changed) commentsDone++;
    }
  }
  console.log(`Комментарии: ${commentsDone}, картинок ${commentImgs}.`);
  await pool.end();
}

main().catch((e) => { console.error("Ошибка:", e); process.exit(1); });
