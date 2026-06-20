/**
 * Фоновый воркер портала (Railway). Самодостаточный: pg + fetch, без Next-зависимостей.
 * Уведомления о событиях задач шлёт само приложение (src/lib/notify.ts). Здесь — фоновые шаги по БД:
 *   REMIND_APPROVALS  — напоминание супер-админу про модерацию/апрув/ops-шаги (каждые 15 мин)
 *   REMIND_ASSIGNEES  — напоминание исполнителю по задачам в работе РАЗ В 24 Ч (от создания задачи)
 *   REMIND_COMMENTS   — каждые 15 мин долбить исполнителя, если на задаче висит неотвеченный коммент клиента
 *   NOTIFY_TOKENS     — суточный дайджест расхода токенов
 * Любой шаг отключается флагом env = "0".
 *
 * Переменные: DATABASE_URL, PORTAL_BASE, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
 *             POLL_INTERVAL_SEC (по умолч. 60), POLL_ONCE, DRY_RUN.
 */
import pg from "pg";

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || "";
const INTERVAL = Number(process.env.POLL_INTERVAL_SEC || 60) * 1000;
const ONCE = process.env.POLL_ONCE === "1";
const DRY = process.env.DRY_RUN === "1";
const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN || "";
const PORTAL_BASE = (process.env.PORTAL_BASE || "https://lambertain-site-production.up.railway.app").replace(/\/$/, "");

const flag = (name) => process.env[name] !== "0";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("sslmode=require") ? { rejectUnauthorized: false } : false,
  max: 3,
});

async function ensureSchema() {
  await pool.query(`CREATE TABLE IF NOT EXISTS poller_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS token_usage (id SERIAL PRIMARY KEY, ts TIMESTAMPTZ NOT NULL DEFAULT now(), model TEXT, kind TEXT, input_tokens INT NOT NULL DEFAULT 0, output_tokens INT NOT NULL DEFAULT 0, cost_usd NUMERIC NOT NULL DEFAULT 0)`);
  // Счётчик суточных окон напоминаний (дублирует migrate.mjs — на случай, если поллер крутится раньше web-деплоя).
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS remind_count INT NOT NULL DEFAULT 0`);
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

/** Кнопки конкретному chat_id (а не только супер-админу). */
async function sendButtonsTo(chatId, text, buttons) {
  if (DRY) { console.log(`[DRY] →${chatId}`, text.replace(/\n/g, " ⏎ ")); return; }
  const kb = [];
  for (let i = 0; i < buttons.length; i += 2) kb.push(buttons.slice(i, i + 2));
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: { inline_keyboard: kb } }),
  });
  if (!r.ok) console.error("TG error:", await r.text());
}

/**
 * Напоминание ИСПОЛНИТЕЛЮ по задачам в работе — максимум РАЗ В 24 ЧАСА на задачу, отсчёт от времени
 * СОЗДАНИЯ (скользящие сутки, не календарные): первое — в возрасте 24 ч, затем 48 ч, 72 ч и т.д.
 * Дедлайнов в системе нет, поэтому ориентир — возраст задачи (DEV-9: правка Никиты).
 * Не трогаем: сданные на ревью (Review), заблокированные (Blocked) и ждущие внешнего действия
 * (ops-шаг владельца / действие клиента) — это не вина исполнителя. Done (resolved) исключены.
 * Дедуп по суткам — через tasks.remind_count: шлём, когда floor(возраст/24ч) > remind_count.
 */
async function remindAssignees() {
  if (!TG_TOKEN) return;
  const ageDays = `floor(EXTRACT(EPOCH FROM (now() - t.created_at)) / 86400)::int`;
  const rows = (await pool.query(
    `SELECT t.id, t.readable_id, t.title, l.tg_id
       FROM tasks t
       JOIN members m ON m.id = t.assignee_id
       JOIN tg_links l ON l.youtrack_login = m.login
      WHERE t.resolved_at IS NULL
        AND t.status NOT IN ('Review', 'Blocked', 'Done')
        AND t.owner_action IS NULL AND t.client_action IS NULL
        AND m.role NOT IN ('client', 'employee')   -- повторные напоминания только разработчику/админу, не клиенту/сотруднику
        AND ${ageDays} > t.remind_count   -- наступило новое суточное окно от создания, ещё не напоминали
        -- не долбим за задачи, заблокированные невыполненной зависимостью (исполнитель не может их начать)
        AND NOT EXISTS (
          SELECT 1 FROM task_deps d JOIN tasks bt ON bt.id = d.depends_on_id
           WHERE d.task_id = t.id AND bt.resolved_at IS NULL AND bt.status <> 'Done'
        )
      ORDER BY l.tg_id, t.created_at`,
  )).rows;
  if (!rows.length) return; // без «пустых» напоминаний
  // Группируем по исполнителю — один пуш со списком его задач.
  const byTg = new Map();
  for (const r of rows) { if (!byTg.has(r.tg_id)) byTg.set(r.tg_id, []); byTg.get(r.tg_id).push(r); }
  for (const [tgId, tasks] of byTg) {
    const lines = [`⏰ <b>Нагадування</b>: ${tasks.length} задач(і) у роботі — час завершити:`];
    for (const tk of tasks.slice(0, 10)) lines.push(`• <b>${tk.readable_id}</b>: ${String(tk.title || "").slice(0, 60)}`);
    const buttons = tasks.slice(0, 8).map((tk) => ({ text: `→ ${tk.readable_id}`, web_app: { url: `${PUBLIC_SITE}/tma?task=${encodeURIComponent(tk.readable_id)}` } }));
    await sendButtonsTo(tgId, lines.join("\n"), buttons);
  }
  // Отметить текущее суточное окно обработанным (idempotent: пропущенные окна схлопываются в одно напоминание).
  if (!DRY) {
    await pool.query(
      `UPDATE tasks t SET remind_count = ${ageDays} WHERE t.id = ANY($1)`,
      [rows.map((r) => r.id)],
    );
  }
}

/**
 * Каждые 15 мин: долбить ИСПОЛНИТЕЛЯ, если ПОСЛЕДНИЙ коммент на его незакрытой задаче — от КЛИЕНТА
 * (значит, разработчик ещё не ответил). Комменты клиента идут без модерации сразу разработчику, поэтому
 * ответ на нём. Как только кто-то из команды ответит в треде (последний коммент уже не клиента) — стихает.
 * Берём последний коммент ЛЮБОГО статуса (даже ответ на модерации = разработчик уже отреагировал).
 */
async function remindCommentReplies() {
  if (!TG_TOKEN) return;
  const last = Number((await getState("last_remind_comments")) || 0);
  if (Date.now() - last < REMIND_MS) return; // не чаще раза в 15 мин
  const rows = (await pool.query(
    `SELECT t.readable_id, t.title, l.tg_id
       FROM tasks t
       JOIN members am ON am.id = t.assignee_id
       JOIN tg_links l ON l.youtrack_login = am.login
       JOIN LATERAL (
         SELECT c.author_id, c.created_at FROM comments c
          WHERE c.task_id = t.id ORDER BY c.created_at DESC LIMIT 1
       ) lc ON true
       JOIN members cm ON cm.id = lc.author_id AND cm.role = 'client'
      WHERE t.resolved_at IS NULL
        AND am.role NOT IN ('client', 'employee')   -- ответ на коммент клиента долбим только разработчику/админу, не сотруднику
        AND lc.created_at < now() - interval '15 minutes'  -- не дублируем мгновенное уведомление
      ORDER BY l.tg_id, lc.created_at`,
  )).rows;
  if (!rows.length) { await setState("last_remind_comments", String(Date.now())); return; }
  const byTg = new Map();
  for (const r of rows) { if (!byTg.has(r.tg_id)) byTg.set(r.tg_id, []); byTg.get(r.tg_id).push(r); }
  for (const [tgId, tasks] of byTg) {
    const lines = [`💬 <b>Нагадування</b>: ${tasks.length} коментар(і) клієнта чекають на вашу відповідь:`];
    for (const tk of tasks.slice(0, 10)) lines.push(`• <b>${tk.readable_id}</b>: ${String(tk.title || "").slice(0, 60)}`);
    const buttons = tasks.slice(0, 8).map((tk) => ({ text: `→ ${tk.readable_id}`, web_app: { url: `${PUBLIC_SITE}/tma?task=${encodeURIComponent(tk.readable_id)}` } }));
    await sendButtonsTo(tgId, lines.join("\n"), buttons);
  }
  await setState("last_remind_comments", String(Date.now()));
}

const NOT_ON_MODERATION = `NOT EXISTS (SELECT 1 FROM comments c WHERE c.task_id = t.id AND c.visibility = 'client' AND c.approved = false)`;

/**
 * Каждые 15 мин: напоминание про приёмку, висящее больше СУТОК — ТОЛЬКО постановщику-агентству
 * (админ/разработчик). Клиентам и сотрудникам повторно НЕ напоминаем — им достаточно одного уведомления
 * (раньше долбили клиента-постановщика, делегата-сотрудника и клиента на апруве — убрано).
 */
async function remindReviewApprovals() {
  if (!TG_TOKEN) return;
  const last = Number((await getState("last_remind_review")) || 0);
  if (Date.now() - last < REMIND_MS) return;

  // Review → постановщику, но повторно долбим только админа/разработчика (НЕ клиента/сотрудника).
  const reporterRows = (await pool.query(
    `SELECT t.readable_id, t.title, lr.tg_id
       FROM tasks t
       JOIN members mr ON mr.id = t.reporter_id
       JOIN tg_links lr ON lr.youtrack_login = mr.login
      WHERE t.status = 'Review' AND t.resolved_at IS NULL
        AND mr.role NOT IN ('client', 'employee')
        AND t.updated_at < now() - interval '24 hours' AND ${NOT_ON_MODERATION}`,
  )).rows;

  const byTg = new Map();
  const seen = new Set();
  for (const r of reporterRows) {
    const k = `${r.tg_id}:${r.readable_id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (!byTg.has(r.tg_id)) byTg.set(r.tg_id, []);
    byTg.get(r.tg_id).push(r);
  }
  if (!byTg.size) { await setState("last_remind_review", String(Date.now())); return; }
  for (const [tgId, tasks] of byTg) {
    const lines = [`⏰ <b>Нагадування</b>: ${tasks.length} задач(і) очікують на ваше підтвердження понад добу:`];
    for (const tk of tasks.slice(0, 10)) lines.push(`• <b>${tk.readable_id}</b>: ${String(tk.title || "").slice(0, 60)}`);
    const buttons = tasks.slice(0, 8).map((tk) => ({ text: `→ ${tk.readable_id}`, web_app: { url: `${PUBLIC_SITE}/tma?task=${encodeURIComponent(tk.readable_id)}` } }));
    await sendButtonsTo(tgId, lines.join("\n"), buttons);
  }
  await setState("last_remind_review", String(Date.now()));
}

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
  const oa = (await pool.query(`SELECT readable_id FROM tasks WHERE owner_action IS NOT NULL AND resolved_at IS NULL AND status <> 'Done' ORDER BY readable_id`)).rows;
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

/** Синк деплой-стадии: задачи в 'pr' с смерженным PR → 'dev'. Логика (GitHub) на портале. */
async function runDeploySync() {
  if (!ADMIN_TOKEN || DRY) return;
  try {
    const r = await fetch(`${PORTAL_BASE}/api/admin/deploy-sync`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, "Content-Type": "application/json" },
    });
    if (!r.ok) console.error("deploy-sync", r.status, (await r.text()).slice(0, 120));
  } catch (e) { console.error("deploy-sync", e.message); }
}

async function cycle() {
  if (flag("DEPLOY_SYNC")) await runDeploySync().catch((e) => console.error("deploy-sync:", e.message));
  if (flag("NOTIFY_TOKENS")) await checkTokenDigest().catch((e) => console.error("tokens:", e.message));
  if (flag("REMIND_APPROVALS")) await remindSuperAdmin().catch((e) => console.error("remind:", e.message));
  if (flag("REMIND_ASSIGNEES")) await remindAssignees().catch((e) => console.error("remind-assignees:", e.message));
  if (flag("REMIND_COMMENTS")) await remindCommentReplies().catch((e) => console.error("remind-comments:", e.message));
  if (flag("REMIND_REVIEW")) await remindReviewApprovals().catch((e) => console.error("remind-review:", e.message));
  console.log(new Date().toISOString(), "цикл завершён");
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("Не хватает DATABASE_URL");
    process.exit(1);
  }
  if (!TG_TOKEN || !TG_CHAT) console.warn("TELEGRAM_* не заданы — напоминания/дайджест отключены.");
  await ensureSchema();
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
