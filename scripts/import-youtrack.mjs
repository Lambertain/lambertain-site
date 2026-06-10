/**
 * Импорт данных из YouTrack в собственную БД портала (Фаза 0 ухода с YouTrack).
 * Создаёт схему задач и заливает проекты, людей, задачи, комментарии. Идемпотентно (upsert).
 *
 * Запуск: node --env-file=.env.local scripts/import-youtrack.mjs
 * Нужны env: YOUTRACK_URL, YOUTRACK_TOKEN, DATABASE_URL.
 *
 * Модель под «скрытую команду»:
 *  - tasks.assignee_id — реальный исполнитель (скрыт от клиента)
 *  - comments.visibility = internal|client; client-поток подписывается «Lambertain»
 */
import pg from "pg";

const YT = (process.env.YOUTRACK_URL || "").replace(/\/$/, "");
const TOKEN = process.env.YOUTRACK_TOKEN || "";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("sslmode=require") ? { rejectUnauthorized: false } : false,
  max: 4,
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  archived BOOLEAN DEFAULT FALSE,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS members (
  id SERIAL PRIMARY KEY,
  login TEXT UNIQUE NOT NULL,
  full_name TEXT,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'unknown',
  tg_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  yt_id TEXT UNIQUE,
  project_id INT REFERENCES projects(id),
  num INT,
  readable_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'open',
  priority TEXT,
  assignee_id INT REFERENCES members(id),
  reporter_id INT REFERENCES members(id),
  due_date DATE,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  source TEXT DEFAULT 'youtrack'
);
CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  yt_id TEXT UNIQUE,
  task_id INT REFERENCES tasks(id),
  author_id INT REFERENCES members(id),
  body TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'client',
  approved BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id);
`;

async function yt(path, params = {}) {
  const u = new URL(YT + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  const r = await fetch(u, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" } });
  if (!r.ok) throw new Error(`YouTrack ${r.status} ${path}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

function roleFromName(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("клиент") || n.includes("client")) return "client";
  if (n.includes("контрибьютор") || n.includes("contributor")) return "contributor";
  if (n.includes("админ") || n.includes("admin")) return "admin";
  return "unknown";
}

async function main() {
  if (!YT || !TOKEN || !process.env.DATABASE_URL) {
    console.error("Нужны YOUTRACK_URL, YOUTRACK_TOKEN, DATABASE_URL");
    process.exit(1);
  }
  await pool.query(SCHEMA);

  // --- Роли: Hub + оверрайды из БД ---
  const roleMap = new Map();
  try {
    const hub = await yt("/hub/api/rest/users", { fields: "login,projectRoles(role(name))", $top: 500 });
    for (const u of hub.users || []) {
      let best = "unknown";
      for (const pr of u.projectRoles || []) {
        const r = roleFromName(pr.role?.name);
        if (r === "client") best = "client";
        else if (r === "contributor" && best !== "client") best = "contributor";
        else if (r === "admin" && best === "unknown") best = "admin";
      }
      roleMap.set(u.login, best);
    }
  } catch (e) {
    console.error("hub roles:", e.message);
  }
  try {
    const ov = await pool.query("SELECT login, role FROM role_overrides");
    for (const r of ov.rows) roleMap.set(r.login, r.role);
  } catch {}

  // --- Люди ---
  const users = await yt("/api/users", { fields: "login,fullName,email,banned", $top: 500 });
  const memberId = new Map(); // login -> id
  for (const u of users) {
    if (u.login === "guest") continue;
    const res = await pool.query(
      `INSERT INTO members (login, full_name, email, role) VALUES ($1,$2,$3,$4)
       ON CONFLICT (login) DO UPDATE SET full_name=EXCLUDED.full_name, email=EXCLUDED.email, role=EXCLUDED.role
       RETURNING id`,
      [u.login, u.fullName || u.login, u.email || null, roleMap.get(u.login) || "unknown"],
    );
    memberId.set(u.login, res.rows[0].id);
  }
  console.log(`Люди: ${memberId.size}`);

  // --- Проекты ---
  const projects = await yt("/api/admin/projects", { fields: "shortName,name,description,archived", $top: 500 });
  const projectId = new Map();
  for (const p of projects) {
    const res = await pool.query(
      `INSERT INTO projects (key, name, archived) VALUES ($1,$2,$3)
       ON CONFLICT (key) DO UPDATE SET name=EXCLUDED.name, archived=EXCLUDED.archived RETURNING id`,
      [p.shortName, p.name, !!p.archived],
    );
    projectId.set(p.shortName, res.rows[0].id);
  }
  console.log(`Проекты: ${projectId.size}`);

  // --- Задачи (пагинация) ---
  const F = "idReadable,summary,description,created,updated,resolved,numberInProject,project(shortName),reporter(login),customFields(name,value(name,login))";
  let skip = 0, taskCount = 0;
  const taskDbId = new Map(); // idReadable -> db id
  for (;;) {
    const issues = await yt("/api/issues", { query: "", fields: F, $top: 200, $skip: skip });
    if (!issues.length) break;
    for (const i of issues) {
      const cf = (name) => i.customFields?.find((c) => c.name === name)?.value ?? null;
      const assignee = cf("Assignee");
      const state = cf("State");
      const priority = cf("Priority");
      const res = await pool.query(
        `INSERT INTO tasks (yt_id, project_id, num, readable_id, title, description, status, priority, assignee_id, reporter_id, created_at, updated_at, resolved_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,to_timestamp($11/1000.0),to_timestamp($12/1000.0),$13)
         ON CONFLICT (yt_id) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description,
           status=EXCLUDED.status, priority=EXCLUDED.priority, assignee_id=EXCLUDED.assignee_id,
           updated_at=EXCLUDED.updated_at, resolved_at=EXCLUDED.resolved_at
         RETURNING id`,
        [
          i.idReadable, projectId.get(i.project?.shortName) || null, i.numberInProject || null, i.idReadable,
          i.summary || "(без названия)", i.description || null, state?.name || "open", priority?.name || null,
          assignee?.login ? memberId.get(assignee.login) || null : null,
          i.reporter?.login ? memberId.get(i.reporter.login) || null : null,
          i.created || 0, i.updated || 0, i.resolved ? new Date(i.resolved) : null,
        ],
      );
      taskDbId.set(i.idReadable, res.rows[0].id);
      taskCount++;
    }
    skip += issues.length;
    if (issues.length < 200) break;
  }
  console.log(`Задачи: ${taskCount}`);

  // --- Комментарии (по каждой задаче) ---
  let commentCount = 0;
  for (const [readable, tid] of taskDbId) {
    let comments;
    try {
      comments = await yt(`/api/issues/${readable}/comments`, { fields: "id,text,created,author(login)", $top: 300 });
    } catch {
      continue;
    }
    for (const c of comments) {
      if (!c.text) continue;
      await pool.query(
        `INSERT INTO comments (yt_id, task_id, author_id, body, visibility, approved, created_at)
         VALUES ($1,$2,$3,$4,'client',true,to_timestamp($5/1000.0))
         ON CONFLICT (yt_id) DO NOTHING`,
        [`${readable}#${c.id}`, tid, c.author?.login ? memberId.get(c.author.login) || null : null, c.text, c.created || 0],
      );
      commentCount++;
    }
  }
  console.log(`Комментарии: ${commentCount}`);

  console.log("Импорт завершён.");
  await pool.end();
}

main().catch((e) => {
  console.error("Ошибка импорта:", e.message);
  process.exit(1);
});
