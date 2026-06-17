/**
 * Смена статуса задачи Claude разработчика по токену проекта.
 * POST /api/dev/status  { taskId, status: "in_progress" | "review", summary?: string }
 *  - in_progress: взял задачу в работу
 *  - review: закончил, отдал постановщику на проверку. summary — что сделано ПРОСТЫМИ
 *    словами на языке задачи (без терминов) → публикуется клиенту комментарием от Lambertain.
 * (Done/Rework ставит постановщик в портале; Blocked — портал при эскалации.)
 * Авторизация: Authorization: Bearer <project_token>
 */
import { NextResponse } from "next/server";
import { getProjectKeyByToken, getProjectFull } from "@/lib/db";
import { getBackend } from "@/lib/tasks";
import { notifyAdmin, notifyLogins, notifyProjectClients, taskTag } from "@/lib/notify";
import { readJsonSmart } from "@/lib/req-body";
import { submitForModeration } from "@/lib/moderation";
import { PORTAL_BASE } from "@/lib/dev-protocol";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

const MAP: Record<string, string> = { in_progress: "In Progress", review: "Review" };

export async function POST(req: Request) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "no token" }, { status: 401 });
  const projectKey = await getProjectKeyByToken(token);
  if (!projectKey) return NextResponse.json({ error: "invalid token" }, { status: 403 });

  let body: { taskId?: string; status?: string; summary?: string };
  try { body = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const taskId = String(body.taskId || "").trim();
  const status = MAP[String(body.status || "")];
  const summary = String(body.summary || "").trim();
  if (!taskId || !status) return NextResponse.json({ error: "taskId and status (in_progress|review) required" }, { status: 400 });
  if (!taskId.startsWith(projectKey + "-")) return NextResponse.json({ error: "task not in project" }, { status: 403 });

  const be = getBackend();
  try {
    if (status === "Review") {
      const task = await be.getTask(taskId);
      const proj = await getProjectFull(projectKey).catch(() => null);
      // autoDone (спека супер-админа) ИЛИ autoApprove (доверенный разраб) — на готовности сразу Done, без ручной приёмки.
      if (task.autoDone || proj?.meta.autoApprove) {
        await be.updateStatus(taskId, "Done");
        if (summary) await be.addComment(taskId, `✅ <b>Виконано:</b>\n\n${summary}`, "client", undefined, true, true);
        if (summary) await notifyProjectClients(task.projectKey, `✅ <b>${await taskTag(taskId)}</b>: ${task.summary}\n\n${summary.slice(0, 400)}`).catch(() => {});
        await notifyAdmin(`✅ <b>Авто-готово</b> · ${await taskTag(taskId)}: ${task.summary}`, { text: "Открыть задачу", url: `${PORTAL_BASE}/admin/tasks/${taskId}` }).catch(() => {});
        return NextResponse.json({ ok: true, status: "Done" });
      }
      // Иначе — Ревью + информируем постановщика/клиента, что нужно принять или вернуть.
      await be.updateStatus(taskId, "Review");
      // Итог клиенту — на МОДЕРАЦИЮ супер-админу (клиент увидит и получит пуш после апрува).
      if (summary) {
        await submitForModeration(taskId, `✅ <b>Готово до перевірки:</b>\n\n${summary}\n\n— — —\nℹ️ Перевірте результат і прийміть («Готово») або поверніть на доопрацювання у задачі на порталі.`, { taskSummary: task.summary, devAuthored: true });
      }
      // Постановщик задачи (он же её принимает) — адресное уведомление. Для задач обычного админа (Настя)
      // это единственный способ узнать, что её задача готова: модерация-итог уходит супер-админу, а ей — вот это.
      // У супер-админа member-логина нет (reporter null) → notifyLogins его пропустит, дубля не будет.
      if (task.reporter?.login) {
        await notifyLogins([task.reporter.login], `🔍 <b>На перевірку</b> · ${await taskTag(taskId)}: ${task.summary}${summary ? `\n\n${summary.slice(0, 400)}` : ""}`, [], { text: "Открыть задачу", url: `${PORTAL_BASE}/admin/tasks/${taskId}` }).catch(() => {});
      }
      return NextResponse.json({ ok: true, status: "Review" });
    }
    await be.updateStatus(taskId, status);
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
