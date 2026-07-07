/**
 * Вебхук Trello → портал: комментарий на карточке клиентской доски → комментом в связанной портальной задаче.
 * Связь карточка↔задача — по ссылке `trello.com/c/<shortLink>` в описании задачи.
 * Работает для всех задач (в т.ч. на тестировании). Обратное направление (портал → Trello) — mirrorCommentToTrello.
 *
 * Защита от петли: пропускаем commentCard, автор которого = наш Trello-аккаунт (это наши же зеркалированные комменты).
 * Дедуп: пропускаем, если идентичный текст уже есть в задаче (Trello доставляет вебхуки at-least-once).
 * Верификации подписи нет (нет app-secret, только key/token); риск низкий — импортируем лишь commentCard
 * по карточкам, реально связанным с задачами известных проектов.
 *
 * Регистрация вебхука: POST https://api.trello.com/1/webhooks { idModel:<board id>, callbackURL:<этот роут> }.
 * HEAD → 200 (Trello проверяет доступность callbackURL при создании).
 */
import { NextResponse } from "next/server";
import { q, getProjectFull, projectReporterLogin, reopenDeployStage } from "@/lib/db";
import { getBackend } from "@/lib/tasks";
import { statusBucket } from "@/lib/statuses";
import { trelloCfg, trelloMemberId } from "@/lib/trello";
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
  data?: { text?: string; card?: { id?: string; shortLink?: string; name?: string } };
}

export async function POST(req: Request) {
  let payload: { action?: TrelloAction };
  try { payload = await req.json(); } catch { return NextResponse.json({ ok: true }); }
  const action = payload.action;
  if (!action || action.type !== "commentCard") return NextResponse.json({ ok: true, ignored: "not a comment" });

  const shortLink = action.data?.card?.shortLink;
  const text = String(action.data?.text || "").trim();
  if (!shortLink || !text) return NextResponse.json({ ok: true, ignored: "no card/text" });

  // Ищем портальную задачу по ссылке на карточку в описании.
  const rows = await q<{ readable_id: string; project_key: string; assignee_login: string | null }>(
    `SELECT t.readable_id, p.key AS project_key,
            (SELECT m.login FROM members m WHERE m.id = t.assignee_id) AS assignee_login
       FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE t.description LIKE $1
      ORDER BY t.updated_at DESC LIMIT 1`,
    [`%trello.com/c/${shortLink}%`],
  ).catch(() => []);
  const task = rows[0];
  if (!task) return NextResponse.json({ ok: true, ignored: "no linked task" });

  // Наш ли это коммент (мы сами зеркалировали портал → Trello)? Тогда не втягиваем обратно.
  const proj = await getProjectFull(task.project_key).catch(() => null);
  const cfg = proj ? trelloCfg(proj.meta) : null;
  if (cfg) {
    const ourId = await trelloMemberId(cfg).catch(() => null);
    if (ourId && action.memberCreator?.id === ourId) return NextResponse.json({ ok: true, ignored: "own mirror" });
  }

  // Автор коммента на портале = клиент проекта (на Trello отвечает клиент). Fallback — Lambertain.
  const clientLogin = await projectReporterLogin(task.project_key).catch(() => null);

  // Дедуп: идентичный текст уже в задаче?
  const dup = await q<{ n: number }>(
    `SELECT count(*)::int AS n FROM comments c JOIN tasks t ON t.id = c.task_id
      WHERE t.readable_id = $1 AND c.body = $2`,
    [task.readable_id, text],
  ).catch(() => [{ n: 0 }]);
  if ((dup[0]?.n ?? 0) > 0) return NextResponse.json({ ok: true, ignored: "duplicate" });

  const be = getBackend();
  await be.addComment(task.readable_id, text, "client", clientLogin || undefined, true, false).catch(() => {});

  // DEV-44: симетрія з порталом. Коментар клієнта по задачі в Review/Blocked повертає її в роботу
  // (у Review коментар = потрібні правки; приймання «все ок» — кнопкою «Готово»). Done не чіпаємо —
  // прийнята задача закрита остаточно (коментар-подяка/питання її не воскрешає). Раніше цей поворот
  // працював лише через портал/TMA, а той самий коментар у Trello статус не міняв — усунено.
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
  const link = { text: "Відкрити задачу", url: `${PORTAL_BASE}/admin/tasks/${task.readable_id}` };
  const who = action.memberCreator?.fullName || action.memberCreator?.username || "клієнт";
  const tag = await taskTag(task.readable_id).catch(() => task.readable_id);
  const dev = task.assignee_login || proj?.meta.defaultAssignee || null;
  if (dev) await notifyLogins([dev], `💬 <b>Клієнт (Trello)</b> · ${tag}\n${text.slice(0, 400)}`, [], link).catch(() => {});
  else await notifyAdmin(`💬 <b>Коммент клієнта в Trello</b> · ${tag} (${who})\n${text.slice(0, 400)}`, link).catch(() => {});

  return NextResponse.json({ ok: true, taskId: task.readable_id });
}
