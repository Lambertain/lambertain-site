/**
 * Вебхук Trello → портал. Два направления синхронизации с клиентской доски:
 *  1. commentCard — комментарий на карточке → комментом в связанной портальной задаче.
 *  2. updateCard (перенос между списками) → статус связанной портальной задачи (колонка → корзина).
 * Связь карточка↔задача — по ссылке `trello.com/c/<shortLink>` в описании задачи.
 * Работает для всех задач (в т.ч. на тестировании). Обратное направление (портал → Trello) — mirrorCommentToTrello / syncTaskToTrello.
 *
 * Защита от петли: пропускаем действия, автор которых = наш Trello-аккаунт (это наши же зеркалированные
 * комменты и портал-инициированные перемещения карточек). Дедуп комментов: пропускаем, если идентичный текст
 * уже есть в задаче (Trello доставляет вебхуки at-least-once).
 * Верификации подписи нет (нет app-secret, только key/token); риск низкий — реагируем лишь на карточки,
 * реально связанные с задачами известных проектов.
 *
 * Регистрация вебхука: POST https://api.trello.com/1/webhooks { idModel:<board id>, callbackURL:<этот роут> }.
 * HEAD → 200 (Trello проверяет доступность callbackURL при создании).
 */
import { NextResponse } from "next/server";
import { q, getProjectFull, projectReporterLogin, reopenDeployStage } from "@/lib/db";
import { getBackend } from "@/lib/tasks";
import { statusBucket, BUCKET_STATUS } from "@/lib/statuses";
import { trelloCfg, trelloMemberId, bucketFromListName } from "@/lib/trello";
import { notifyLogins, notifyAdmin, taskTag } from "@/lib/notify";
import { PORTAL_BASE } from "@/lib/dev-protocol";

export async function HEAD() {
  return new Response(null, { status: 200 });
}

export async function GET() {
  return new Response(null, { status: 200 });
}

interface TrelloAction {
  type?: string;
  memberCreator?: { id?: string; fullName?: string; username?: string };
  data?: {
    text?: string;
    card?: { id?: string; shortLink?: string; name?: string };
    listBefore?: { id?: string; name?: string };
    listAfter?: { id?: string; name?: string };
  };
}

interface LinkedTask {
  readable_id: string;
  project_key: string;
  assignee_login: string | null;
}

// Портальная задача по shortLink карточки в её описании.
async function findLinkedTask(shortLink: string): Promise<LinkedTask | undefined> {
  const rows = await q<LinkedTask>(
    `SELECT t.readable_id, p.key AS project_key,
            (SELECT m.login FROM members m WHERE m.id = t.assignee_id) AS assignee_login
       FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE t.description LIKE $1
      ORDER BY t.updated_at DESC LIMIT 1`,
    [`%trello.com/c/${shortLink}%`],
  ).catch(() => [] as LinkedTask[]);
  return rows[0];
}

export async function POST(req: Request) {
  let payload: { action?: TrelloAction };
  try { payload = await req.json(); } catch { return NextResponse.json({ ok: true }); }
  const action = payload.action;
  const type = action?.type;
  if (!action || (type !== "commentCard" && type !== "updateCard")) {
    return NextResponse.json({ ok: true, ignored: "not a comment/move" });
  }

  const shortLink = action.data?.card?.shortLink;
  if (!shortLink) return NextResponse.json({ ok: true, ignored: "no card" });

  const task = await findLinkedTask(shortLink);
  if (!task) return NextResponse.json({ ok: true, ignored: "no linked task" });

  // Наше ли это действие (мы сами зеркалировали коммент / двигали карточку из портала)? Тогда не втягиваем обратно.
  const proj = await getProjectFull(task.project_key).catch(() => null);
  const cfg = proj ? trelloCfg(proj.meta) : null;
  if (cfg) {
    const ourId = await trelloMemberId(cfg).catch(() => null);
    if (ourId && action.memberCreator?.id === ourId) return NextResponse.json({ ok: true, ignored: "own action" });
  }

  const link = { text: "Відкрити задачу", url: `${PORTAL_BASE}/admin/tasks/${task.readable_id}` };
  const who = action.memberCreator?.fullName || action.memberCreator?.username || "клієнт";
  const be = getBackend();

  // ── Перенос карточки между колонками → статус портальной задачи ──────────────────────────────
  if (type === "updateCard") {
    const listAfter = action.data?.listAfter?.name;
    // updateCard прилетает на любое изменение карточки (имя, описание, позиция, срок); нас интересует лишь смена списка.
    if (!action.data?.listBefore || !listAfter) return NextResponse.json({ ok: true, ignored: "not a list move" });

    const bucket = bucketFromListName(listAfter);
    // Синкаем только рабочие состояния: назад-в-роботу / тестування / блокер. «Виконано» из Trello НЕ авто-закрываем
    // (приймання йде через модерацію порталу й кнопку «Готово»); планові колонки (Беклог/Тиждень/Архів) не чіпаємо.
    if (!bucket || bucket === "done" || bucket === "notStarted") {
      return NextResponse.json({ ok: true, ignored: "column not synced", list: listAfter });
    }

    let full;
    try { full = await be.getTask(task.readable_id); } catch { return NextResponse.json({ ok: true, ignored: "task gone" }); }
    // Уже в целевой корзине — ничего не делаем (в т.ч. гасит эхо от портал→Trello перемещений).
    if (statusBucket(full.state) === bucket) return NextResponse.json({ ok: true, ignored: "already in bucket" });

    const status = BUCKET_STATUS[bucket];
    await be.updateStatus(task.readable_id, status, { actorRole: "client", trigger: `клієнт переніс картку в «${listAfter}» (Trello)` }).catch(() => {});
    // Назад-в-роботу по вже опублікованій задачі — знову відкриваємо стадію доставки.
    if (bucket === "inProgress") {
      await reopenDeployStage(task.readable_id, { actorRole: "system", trigger: "клієнт повернув задачу в роботу (Trello)" }).catch(() => {});
    }

    // Повідомляємо відповідального розробника (не адміна, якщо розроб є) — саме йому діяти.
    const tag = await taskTag(task.readable_id).catch(() => task.readable_id);
    const dev = task.assignee_login || proj?.meta.defaultAssignee || null;
    const msg = `↩️ <b>Клієнт (Trello)</b> · ${tag}\nКартку перенесено в «${listAfter}» → статус: ${status}`;
    if (dev) await notifyLogins([dev], msg, [], link).catch(() => {});
    else await notifyAdmin(`${msg}\n(${who})`, link).catch(() => {});

    return NextResponse.json({ ok: true, taskId: task.readable_id, status });
  }

  // ── Комментарий на карточке → комментом в задачу ─────────────────────────────────────────────
  const text = String(action.data?.text || "").trim();
  if (!text) return NextResponse.json({ ok: true, ignored: "no text" });

  // Автор коммента на портале = клиент проекта (на Trello отвечает клиент). Fallback — Lambertain.
  const clientLogin = await projectReporterLogin(task.project_key).catch(() => null);

  // Дедуп: идентичный текст уже в задаче?
  const dup = await q<{ n: number }>(
    `SELECT count(*)::int AS n FROM comments c JOIN tasks t ON t.id = c.task_id
      WHERE t.readable_id = $1 AND c.body = $2`,
    [task.readable_id, text],
  ).catch(() => [{ n: 0 }]);
  if ((dup[0]?.n ?? 0) > 0) return NextResponse.json({ ok: true, ignored: "duplicate" });

  await be.addComment(task.readable_id, text, "client", clientLogin || undefined, true, false).catch(() => {});

  // DEV-44: симетрія з порталом. Коментар клієнта по задачі в Review/Blocked повертає її в роботу
  // (у Review коментар = потрібні правки; приймання «все ок» — кнопкою «Готово»). Done не чіпаємо —
  // прийнята задача закрита остаточно (коментар-подяка/питання її не воскрешає).
  try {
    const full = await be.getTask(task.readable_id);
    const bucket = statusBucket(full.state);
    if (bucket === "review" || bucket === "blocked") {
      await be.updateStatus(task.readable_id, "In Progress", { actorRole: "client", trigger: "клієнт написав коментар у Trello — повернуто в роботу" });
      await reopenDeployStage(task.readable_id, { actorRole: "system", trigger: "клієнт написав нові правки (Trello) по опублікованій задачі" }).catch(() => {});
    }
  } catch { /* best-effort — коментар уже додано */ }

  // Клиент написал (в Trello) → ответственному разработчику проекта. Админа (Никиту) НЕ шумим, если разработчик
  // есть — коммент клиента ведёт разраб. Админу пушим ТОЛЬКО когда разработчика в проекте нет.
  const tag = await taskTag(task.readable_id).catch(() => task.readable_id);
  const dev = task.assignee_login || proj?.meta.defaultAssignee || null;
  if (dev) await notifyLogins([dev], `💬 <b>Клієнт (Trello)</b> · ${tag}\n${text.slice(0, 400)}`, [], link).catch(() => {});
  else await notifyAdmin(`💬 <b>Коммент клієнта в Trello</b> · ${tag} (${who})\n${text.slice(0, 400)}`, link).catch(() => {});

  return NextResponse.json({ ok: true, taskId: task.readable_id });
}
