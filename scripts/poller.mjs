/**
 * Фоновый воркер портала (Railway). Самодостаточный: pg + fetch, без Next-зависимостей.
 * Уведомления о событиях задач шлёт само приложение (src/lib/notify.ts). Здесь — фоновые шаги по БД:
 *   TRIAGE            — отложенный ИИ-триаж задач (через ~TRIAGE_DELAY_MIN минут после создания)
 *   REMIND_APPROVALS  — напоминание супер-админу про модерацию/апрув/ops-шаги
 *   REMIND_ASSIGNEES  — каждые 15 мин долбить исполнителя по задачам старше суток (пока не выполнит)
 *   NOTIFY_TOKENS     — суточный дайджест расхода токенов
 * Любой шаг отключается флагом env = "0".
 *
 * Переменные: DATABASE_URL, ADMIN_API_TOKEN, PORTAL_BASE, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
 *             TRIAGE_DELAY_MIN (по умолч. 5), POLL_INTERVAL_SEC (по умолч. 60), POLL_ONCE, DRY_RUN.
 */
import pg from "pg";

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || "";
const INTERVAL = Number(process.env.POLL_INTERVAL_SEC || 60) * 1000;
const ONCE = process.env.POLL_ONCE === "1";
const DRY = process.env.DRY_RUN === "1";
const PORTAL_BASE = (process.env.PORTAL_BASE || "https://lambertain-site-production.up.railway.app").replace(/\/$/, "");
const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN || "";
const TRIAGE_DELAY_MIN = Number(process.env.TRIAGE_DELAY_MIN || 5); // окно на редактирование до триажа

const flag = (name) => process.env[name] !== "0";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("sslmode=require") ? { rejectUnauthorized: false } : false,
  max: 3,
});

async function ensureSchema() {
  await pool.query(`CREATE TABLE IF NOT EXISTS poller_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
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
 * Каждые 15 мин: долбить ИСПОЛНИТЕЛЯ по задачам, которые висят больше СУТОК и ещё не выполнены.
 * Не трогаем: сданные на ревью (Review), заблокированные (Blocked) и ждущие внешнего действия
 * (ops-шаг владельца / действие клиента) — это не вина исполнителя. Done (resolved) исключены.
 */
async function remindAssignees() {
  if (!TG_TOKEN) return;
  const last = Number((await getState("last_remind_assignee")) || 0);
  if (Date.now() - last < REMIND_MS) return; // не чаще раза в 15 мин
  const rows = (await pool.query(
    `SELECT t.readable_id, t.title, l.tg_id
       FROM tasks t
       JOIN members m ON m.id = t.assignee_id
       JOIN tg_links l ON l.youtrack_login = m.login
      WHERE t.resolved_at IS NULL
        AND t.status NOT IN ('Review', 'Blocked', 'Done')
        AND t.owner_action IS NULL AND t.client_action IS NULL
        AND t.created_at < now() - interval '24 hours'
        -- не долбим за задачи, заблокированные невыполненной зависимостью (исполнитель не может их начать)
        AND NOT EXISTS (
          SELECT 1 FROM task_deps d JOIN tasks bt ON bt.id = d.depends_on_id
           WHERE d.task_id = t.id AND bt.resolved_at IS NULL AND bt.status <> 'Done'
        )
      ORDER BY l.tg_id, t.created_at`,
  )).rows;
  if (!rows.length) { await setState("last_remind_assignee", String(Date.now())); return; }
  // Группируем по исполнителю — один пуш со списком его просроченных задач.
  const byTg = new Map();
  for (const r of rows) { if (!byTg.has(r.tg_id)) byTg.set(r.tg_id, []); byTg.get(r.tg_id).push(r); }
  for (const [tgId, tasks] of byTg) {
    const lines = [`⏰ <b>Нагадування</b>: ${tasks.length} задач(і) висять понад добу — час завершити:`];
    for (const tk of tasks.slice(0, 10)) lines.push(`• <b>${tk.readable_id}</b>: ${String(tk.title || "").slice(0, 60)}`);
    const buttons = tasks.slice(0, 8).map((tk) => ({ text: `→ ${tk.readable_id}`, web_app: { url: `${PUBLIC_SITE}/tma?task=${encodeURIComponent(tk.readable_id)}` } }));
    await sendButtonsTo(tgId, lines.join("\n"), buttons);
  }
  await setState("last_remind_assignee", String(Date.now()));
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
  let total = 0;
  if (flag("TRIAGE")) total += await runDueTriage().catch((e) => (console.error("triage:", e.message), 0));
  if (flag("NOTIFY_TOKENS")) await checkTokenDigest().catch((e) => console.error("tokens:", e.message));
  if (flag("REMIND_APPROVALS")) await remindSuperAdmin().catch((e) => console.error("remind:", e.message));
  if (flag("REMIND_ASSIGNEES")) await remindAssignees().catch((e) => console.error("remind-assignees:", e.message));
  console.log(new Date().toISOString(), `цикл завершён, событий: ${total}`);
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
