/**
 * Смена статуса задачи Claude разработчика по токену проекта.
 * POST /api/dev/status  { taskId, status: "in_progress" | "review", summary?: string }
 *  - in_progress: взял задачу в работу
 *  - review: закончил, отдал постановщику на проверку. summary — что сделано ПРОСТЫМИ
 *    словами на языке задачи (без терминов) → публикуется клиенту комментарием от Lambertain.
 * (Done/Rework ставит постановщик в портале; Blocked — портал при эскалации.)
 * Авторизация: Authorization: Bearer <project_token>
 */
import { NextResponse, after } from "next/server";
import { getProjectKeyByToken, getProjectFull, setDeployStage } from "@/lib/db";
import { advanceStage } from "@/lib/deploy-stage";
import { getBackend } from "@/lib/tasks";
import { notifyAdmin, notifyLogins, notifyProjectClients, taskTag } from "@/lib/notify";
import { readJsonSmart } from "@/lib/req-body";
import { submitForModeration } from "@/lib/moderation";
import { autoDeliverAndNotify, deliverGitflowAndNotify } from "@/lib/auto-deliver";
import { syncTaskToTrello } from "@/lib/trello";
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

  let body: { taskId?: string; status?: string; summary?: string; branch?: string };
  try { body = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const taskId = String(body.taskId || "").trim();
  const status = MAP[String(body.status || "")];
  const summary = String(body.summary || "").trim();
  const branch = String(body.branch || "").trim(); // feature-ветка для gitflow-доставки (PR в develop)
  if (!taskId || !status) return NextResponse.json({ error: "taskId and status (in_progress|review) required" }, { status: 400 });
  if (!taskId.startsWith(projectKey + "-")) return NextResponse.json({ error: "task not in project" }, { status: 403 });

  const be = getBackend();
  try {
    if (status === "Review") {
      const task = await be.getTask(taskId);
      const proj = await getProjectFull(projectKey).catch(() => null);
      // autoDone (спека супер-админа) ИЛИ autoApprove (доверенный разраб) — на готовности сразу Done, без ручной приёмки.
      // DEV-29: НО задачи ОТ КЛИЕНТА (reporter=client) авто-закрывать нельзя — их принимает сам клиент (идут в Review).
      if ((task.autoDone || proj?.meta.autoApprove) && task.reporter?.role !== "client") {
        await be.updateStatus(taskId, "Done", { actorRole: "system", trigger: task.autoDone ? "автоздача за спекою (autoDone)" : "gitflow: авто-приймання (autoApprove)" });
        after(() => syncTaskToTrello(taskId, "Done")); // Trello: карточку → «Виконано»
        await advanceStage(taskId, "dev", "розробник здав на ревʼю").catch(() => {}); // готово и на дев-мейн → «На тестовому» + коммент клиенту; авто-доставка ниже переведёт в «Опубліковано»
        if (summary) await be.addComment(taskId, `✅ <b>Виконано:</b>\n\n${summary}`, "client", undefined, true, true);
        if (summary) await notifyProjectClients(task.projectKey, `✅ <b>${await taskTag(taskId)}</b>: ${task.summary}\n\n${summary.slice(0, 400)}`).catch(() => {});
        await notifyAdmin(`✅ <b>Авто-готово</b> · ${await taskTag(taskId)}: ${task.summary}`, { text: "Відкрити задачу", url: `${PORTAL_BASE}/admin/tasks/${taskId}` }).catch(() => {});
        // Авто-доставка на репо клиента (squash-пуш/PR + апрув деплоя/мониторинг; миграция — через preDeploy
        // клиентского деплоя) — только если включён флаг autoDeliver. Фоном (after) — не блокируем ответ дев-Клоду.
        // gitflow-режим (meta.gitflowDelivery): доставляем feature-ветку разработчика как PR в develop клиента.
        // Иначе — legacy squash-доставка (meta.autoDeliver). Режимы взаимоисключающие.
        if (proj?.meta?.gitflowDelivery && branch) {
          const meta = proj.meta;
          after(() => deliverGitflowAndNotify(projectKey, meta, branch, taskId));
        } else if (proj?.meta?.autoDeliver) {
          const meta = proj.meta;
          after(() => autoDeliverAndNotify(projectKey, meta, taskId));
        }
        return NextResponse.json({ ok: true, status: "Done", delivery: proj?.meta?.gitflowDelivery && branch ? "gitflow" : (proj?.meta?.autoDeliver ? "squash" : "none") });
      }
      // Иначе — Ревью + информируем постановщика/клиента, что нужно принять или вернуть.
      await be.updateStatus(taskId, "Review", { actorRole: "contributor", trigger: "розробник здав на ревʼю" });
      after(() => syncTaskToTrello(taskId, "Review")); // Trello: карточку → колонка тестирования
      await advanceStage(taskId, "dev", "розробник здав на ревʼю").catch(() => {}); // сдал на ревью = на дев-мейн → «На тестовому сайті» + коммент клиенту
      // Итог клиенту — на МОДЕРАЦИЮ супер-админу (клиент увидит и получит пуш после апрува).
      if (summary) {
        await submitForModeration(taskId, `✅ <b>Готово до перевірки:</b>\n\n${summary}\n\n— — —\nℹ️ Перевірте результат і прийміть («Готово») або поверніть на доопрацювання у задачі на порталі.`, { taskSummary: task.summary, devAuthored: true });
      }
      // Постановщик-член команды (админ, напр. Настя) — адресное уведомление: для неё это единственный способ
      // узнать, что задача готова (модерация-итог уходит супер-админу). НО постановщику-КЛИЕНТУ/СОТРУДНИКУ это
      // уведомление НЕ шлём: он не должен знать о готовности, пока супер-админ не одобрил итог-коммент на модерации
      // (иначе клиент идёт «проверять» до публикации результата). Он узнает после апрува — через notifyProjectClients.
      if (task.reporter?.login && task.reporter.role !== "client" && task.reporter.role !== "employee") {
        await notifyLogins([task.reporter.login], `🔍 <b>На перевірку</b> · ${await taskTag(taskId)}: ${task.summary}${summary ? `\n\n${summary.slice(0, 400)}` : ""}`, [], { text: "Відкрити задачу", url: `${PORTAL_BASE}/admin/tasks/${taskId}` }).catch(() => {});
      }
      // gitflow-доставка и на ручной приёмке (проект без autoApprove): открываем PR в develop из ветки разработчика.
      if (proj?.meta?.gitflowDelivery && branch) {
        const meta = proj.meta;
        after(() => deliverGitflowAndNotify(projectKey, meta, branch, taskId));
      }
      return NextResponse.json({ ok: true, status: "Review", delivery: proj?.meta?.gitflowDelivery && branch ? "gitflow" : "none" });
    }
    await be.updateStatus(taskId, status, { actorRole: "contributor", trigger: status === "In Progress" ? "розробник взяв у роботу" : undefined });
    after(() => syncTaskToTrello(taskId, status)); // Trello: карточку под новый статус (напр. «В процесі»)
    if (status === "In Progress") await setDeployStage(taskId, "pr", { actorRole: "contributor", trigger: "розробник взяв у роботу" }).catch(() => {}); // взял в работу → «Готується»
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
