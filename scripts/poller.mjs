/**
 * Поллер событий YouTrack → Telegram. Запускается отдельным воркером на Railway.
 * Самодостаточный: pg + fetch, без Next-зависимостей.
 *
 * Триггеры (каждый отключается флагом env = "0"):
 *   NOTIFY_NEW_TASK        — новая задача от КЛИЕНТА
 *   NOTIFY_CLIENT_COMMENT  — новый комментарий/вопрос от КЛИЕНТА
 *   NOTIFY_DONE            — задача переведена в «готово» КОНТРИБЬЮТОРОМ
 *
 * Переменные: YOUTRACK_URL, YOUTRACK_TOKEN, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
 *             DATABASE_URL, POLL_INTERVAL_SEC (по умолч. 60), POLL_ONCE, DRY_RUN.
 */
import pg from "pg";

const URL_BASE = (process.env.YOUTRACK_URL || "").replace(/\/$/, "");
const TOKEN = process.env.YOUTRACK_TOKEN || "";
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || "";
const INTERVAL = Number(process.env.POLL_INTERVAL_SEC || 60) * 1000;
const ONCE = process.env.POLL_ONCE === "1";
const DRY = process.env.DRY_RUN === "1";
const PORTAL_BASE = (process.env.PORTAL_BASE || "https://lambertain-site-production.up.railway.app").replace(/\/$/, "");
const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN || "";
const TRIAGE_DELAY_MIN = Number(process.env.TRIAGE_DELAY_MIN || 5); // окно на редактирование до триажа

const flag = (name) => process.env[name] !== "0";
const DONE_STATES = ["done", "fixed", "verified", "resolved", "готово", "закрыто", "выполнено", "complete"];

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("sslmode=require") ? { rejectUnauthorized: false } : false,
  max: 3,
});

async function ensureSchema() {
  await pool.query(`CREATE TABLE IF NOT EXISTS poller_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS role_overrides (login TEXT PRIMARY KEY, role TEXT NOT NULL)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS token_usage (id SERIAL PRIMARY KEY, ts TIMESTAMPTZ NOT NULL DEFAULT now(), model TEXT, kind TEXT, input_tokens INT NOT NULL DEFAULT 0, output_tokens INT NOT NULL DEFAULT 0, cost_usd NUMERIC NOT NULL DEFAULT 0)`);
}
async function getState(key) {
  const r = await pool.query("SELECT value FROM poller_state WHERE key=$1", [key]);
  return r.rows[0]?.value ?? null;
}
async function setState(key, value) {
  await pool.query(
    `INSERT INTO poller_state (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
    [key, String(value)],
  );
}

async function yt(path, params = {}) {
  const u = new URL(URL_BASE + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  const r = await fetch(u, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" } });
  if (!r.ok) throw new Error(`YouTrack ${r.status} ${path}: ${await r.text()}`);
  return r.json();
}

async function sendToDev(chatId, text) {
  if (DRY) {
    console.log(`[DRY] →${chatId}`, text.replace(/\n/g, " ⏎ "));
    return;
  }
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  if (!r.ok) console.error("TG error:", await r.text());
}
async function tg(text) {
  return sendToDev(TG_CHAT, text);
}

async function tgButtons(text, buttons) {
  if (DRY) { console.log(`[DRY] →${TG_CHAT}`, text.replace(/\n/g, " ⏎ ")); return; }
  const kb = [];
  for (let i = 0; i < buttons.length; i += 2) kb.push(buttons.slice(i, i + 2));
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: { inline_keyboard: kb } }),
  });
  if (!r.ok) console.error("TG error:", await r.text());
}

const REMIND_MS = 15 * 60 * 1000;
const PUBLIC_SITE = "https://www.lambertain.site";

/** Каждые 15 мин: напомнить супер-админу про несделанное — комменты на модерации и задачи на апрув (с кнопками-диплинками). */
async function remindSuperAdmin() {
  if (!TG_TOKEN || !TG_CHAT) return;
  const last = Number((await getState("last_remind")) || 0);
  if (Date.now() - last < REMIND_MS) return; // не чаще раза в 15 мин
  // Старше 15 мин — чтобы не дублировать свежее исходное уведомление о коммента/задаче.
  const pc = (await pool.query(
    `SELECT DISTINCT t.readable_id FROM comments c JOIN tasks t ON t.id = c.task_id
     WHERE c.approved = false AND c.created_at < now() - interval '15 minutes' ORDER BY t.readable_id`,
  )).rows;
  const pt = (await pool.query(
    `SELECT readable_id FROM tasks WHERE approval_status = 'pending' AND created_at < now() - interval '15 minutes' ORDER BY readable_id`,
  )).rows;
  // Задачи «на доработку владельцу» (ops-шаг: деплой/регистрация/токен).
  const oa = (await pool.query(`SELECT readable_id FROM tasks WHERE owner_action IS NOT NULL ORDER BY readable_id`)).rows;
  if (!pc.length && !pt.length && !oa.length) return;
  const lines = ["🔔 <b>Ждут твоей реакции</b>"];
  if (oa.length) lines.push(`🛠 На доработку (твой ops-шаг): <b>${oa.length}</b>`);
  if (pc.length) lines.push(`📝 Комментов на модерации: <b>${pc.length}</b>`);
  if (pt.length) lines.push(`✅ Задач на апрув: <b>${pt.length}</b>`);
  const ids = [...new Set([...oa.map((r) => r.readable_id), ...pc.map((r) => r.readable_id), ...pt.map((r) => r.readable_id)])].slice(0, 8);
  const buttons = ids.map((id) => ({ text: `→ ${id}`, web_app: { url: `${PUBLIC_SITE}/tma?task=${encodeURIComponent(id)}` } }));
  await tgButtons(lines.join("\n"), buttons);
  await setState("last_remind", String(Date.now()));
}

// login -> role ("client" | "contributor" | "admin" | "unknown")
let rolesCache = null;
let rolesAt = 0;
async function roles() {
  if (rolesCache && Date.now() - rolesAt < 5 * 60 * 1000) return rolesCache;
  const map = new Map();
  try {
    const data = await yt("/hub/api/rest/users", { fields: "login,projectRoles(role(name))", $top: 500 });
    for (const u of data.users || []) {
      let best = "unknown";
      for (const pr of u.projectRoles || []) {
        const n = (pr.role?.name || "").toLowerCase();
        if (n.includes("клиент") || n.includes("client")) best = "client";
        else if ((n.includes("контрибьютор") || n.includes("contributor")) && best !== "client") best = "contributor";
        else if ((n.includes("админ") || n.includes("admin")) && best === "unknown") best = "admin";
      }
      map.set(u.login, best);
    }
  } catch (e) {
    console.error("roles error:", e.message);
  }
  // Оверрайды из БД приоритетнее ролей YouTrack.
  try {
    const r = await pool.query("SELECT login, role FROM role_overrides");
    for (const row of r.rows) map.set(row.login, row.role);
  } catch (e) {
    console.error("overrides error:", e.message);
  }
  rolesCache = map;
  rolesAt = Date.now();
  return map;
}

const link = (id) => `${URL_BASE}/issue/${id}`;

async function checkNewTasks(rmap) {
  const last = Number((await getState("last_created")) || 0);
  const issues = await yt("/api/issues", {
    query: "sort by: created desc",
    fields: "idReadable,summary,created,reporter(login,fullName)",
    $top: 50,
  });
  let max = last;
  const fresh = [];
  for (const i of issues) {
    if (i.created > last) {
      if (rmap.get(i.reporter?.login) === "client") fresh.push(i);
      if (i.created > max) max = i.created;
    }
  }
  for (const i of fresh.reverse()) {
    await tg(`🆕 <b>Новая задача от клиента</b>\n${i.reporter?.fullName || i.reporter?.login}: ${i.summary}\n<a href="${link(i.idReadable)}">${i.idReadable}</a>`);
  }
  if (max > last) await setState("last_created", max);
  return fresh.length;
}

async function checkClientComments(rmap) {
  const last = Number((await getState("last_comment")) || 0);
  const acts = await yt("/api/activities", {
    categories: "CommentsCategory",
    reverse: "true",
    fields: "timestamp,author(login,fullName),target(issue(idReadable)),added(text)",
    $top: 50,
  });
  let max = last;
  const fresh = [];
  for (const a of acts) {
    if (a.timestamp > last) {
      if (rmap.get(a.author?.login) === "client") fresh.push(a);
      if (a.timestamp > max) max = a.timestamp;
    }
  }
  for (const a of fresh.reverse()) {
    const id = a.target?.issue?.idReadable || "?";
    const text = (Array.isArray(a.added) ? a.added[0]?.text : "") || "";
    await tg(`💬 <b>Вопрос клиента</b> в ${id}\n${a.author?.fullName || a.author?.login}: ${text.slice(0, 300)}\n<a href="${link(id)}">${id}</a>`);
  }
  if (max > last) await setState("last_comment", max);
  return fresh.length;
}

async function checkDone(rmap) {
  const last = Number((await getState("last_done")) || 0);
  const acts = await yt("/api/activities", {
    categories: "CustomFieldCategory",
    reverse: "true",
    fields: "timestamp,author(login,fullName),target(idReadable,summary),field(name),added(name)",
    $top: 50,
  });
  let max = last;
  const fresh = [];
  for (const a of acts) {
    if (a.timestamp <= last) continue;
    if (a.timestamp > max) max = a.timestamp;
    if ((a.field?.name || "").toLowerCase() !== "state") continue;
    const added = (Array.isArray(a.added) ? a.added[0]?.name : "") || "";
    if (!DONE_STATES.some((s) => added.toLowerCase().includes(s))) continue;
    if (rmap.get(a.author?.login) === "contributor") fresh.push({ a, added });
  }
  for (const { a, added } of fresh.reverse()) {
    const id = a.target?.idReadable || "?";
    await tg(`✅ <b>Задача сдана</b> (${added})\n${a.author?.fullName || a.author?.login}: ${a.target?.summary || ""}\n<a href="${link(id)}">${id}</a>`);
  }
  if (max > last) await setState("last_done", max);
  return fresh.length;
}

async function checkTokenDigest() {
  const today = new Date().toISOString().slice(0, 10);
  const last = await getState("token_digest_day");
  if (last === today) return;
  if (last) {
    const r = await pool.query(
      "SELECT COALESCE(SUM(cost_usd),0) usd, COALESCE(SUM(input_tokens+output_tokens),0) tok FROM token_usage WHERE ts::date = $1",
      [last],
    );
    const usd = Number(r.rows[0].usd), tok = Number(r.rows[0].tok);
    if (tok > 0) await tg(`💰 <b>Расход токенов за ${last}</b>\n${tok.toLocaleString()} токенов · ~$${usd.toFixed(2)}`);
  }
  await setState("token_digest_day", today);
}

/**
 * Отложенный ИИ-триаж: задачи с ai_status='pending', созданные больше TRIAGE_DELAY_MIN минут назад,
 * отдаём порталу на триаж. Задержка — окно, чтобы автор успел отредактировать задачу/коммент
 * до того, как триаж обработает её и уведомит разработчика. Эндпоинт сам атомарно «забирает» задачу.
 */
async function runDueTriage() {
  if (!ADMIN_TOKEN) { console.warn("ADMIN_API_TOKEN не задан — отложенный триаж пропущен."); return 0; }
  const rows = (await pool.query(
    `SELECT readable_id FROM tasks WHERE ai_status = 'pending' AND created_at < now() - ($1 || ' minutes')::interval ORDER BY created_at LIMIT 25`,
    [String(TRIAGE_DELAY_MIN)],
  )).rows;
  let n = 0;
  for (const r of rows) {
    if (DRY) { console.log(`[DRY] триаж → ${r.readable_id}`); n++; continue; }
    try {
      const resp = await fetch(`${PORTAL_BASE}/api/admin/run-triage`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: r.readable_id }),
      });
      if (resp.ok) n++;
      else console.error("run-triage", r.readable_id, resp.status, (await resp.text()).slice(0, 120));
    } catch (e) { console.error("run-triage", r.readable_id, e.message); }
  }
  if (n) console.log(`отложенный триаж запущен: ${n}`);
  return n;
}

async function cycle() {
  const rmap = await roles();
  let total = 0;
  if (flag("TRIAGE")) total += await runDueTriage().catch((e) => (console.error("triage:", e.message), 0));
  if (flag("NOTIFY_NEW_TASK")) total += await checkNewTasks(rmap).catch((e) => (console.error("newTasks:", e.message), 0));
  if (flag("NOTIFY_CLIENT_COMMENT")) total += await checkClientComments(rmap).catch((e) => (console.error("comments:", e.message), 0));
  if (flag("NOTIFY_DONE")) total += await checkDone(rmap).catch((e) => (console.error("done:", e.message), 0));
  if (flag("NOTIFY_TOKENS")) await checkTokenDigest().catch((e) => console.error("tokens:", e.message));
  if (flag("REMIND_APPROVALS")) await remindSuperAdmin().catch((e) => console.error("remind:", e.message));
  console.log(new Date().toISOString(), `цикл завершён, событий: ${total}`);
}

async function main() {
  // DATABASE_URL обязателен (нужен и для ревью). YouTrack/Telegram — для отдельных шагов; их отсутствие не валит ревью.
  if (!process.env.DATABASE_URL) {
    console.error("Не хватает DATABASE_URL");
    process.exit(1);
  }
  if (!URL_BASE || !TOKEN) console.warn("YOUTRACK_* не заданы — шаги уведомлений YouTrack пропускаются.");
  if (!TG_TOKEN || !TG_CHAT) console.warn("TELEGRAM_* не заданы — уведомления отключены.");
  await ensureSchema();
  // Первый запуск: инициализируем отметки текущим временем, чтобы не слать историю.
  if ((await getState("last_created")) == null) {
    const now = Date.now();
    await setState("last_created", now);
    await setState("last_comment", now);
    await setState("last_done", now);
    console.log("Поллер инициализирован, отметки = сейчас.");
  }
  await cycle();
  if (ONCE) {
    await pool.end();
    return;
  }
  setInterval(cycle, INTERVAL);
}

main().catch((e) => {
  console.error("Фатальная ошибка:", e);
  process.exit(1);
});
