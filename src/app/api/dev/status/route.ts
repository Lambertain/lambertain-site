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
import { getProjectKeyByToken, getProjectFull, setDeployStage, getTaskEvents } from "@/lib/db";
import { advanceStage } from "@/lib/deploy-stage";
import { getBackend } from "@/lib/tasks";
import { notifyLogins, notifyProjectClients, taskTag } from "@/lib/notify";
import { readJsonSmart } from "@/lib/req-body";
import { submitForModeration } from "@/lib/moderation";
import { autoDeliverAndNotify, deliverGitflowAndNotify } from "@/lib/auto-deliver";
import { checkGitflowConflicts, syncClientToDev } from "@/lib/sync-client";
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

      // ── Pre-delivery конфликт-гейт (gitflow) ──────────────────────────────────────────────────
      // ПЕРЕД сменой статуса и анонсом клиенту проверяем, сольётся ли feature-ветка с АКТУАЛЬНЫМ
      // клиентским develop (у разработчика к клиентскому репо доступа нет — проверяет портал своим
      // токеном-коллаборатором). Конфликт → сдачу ОТКЛОНЯЕМ: задача остаётся In Progress, клиент ничего
      // не получает, разработчику возвращаем список конфликтующих файлов — он ребейзит на свежий develop
      // и сдаёт заново. Так конфликт виден разработчику ДО пиара, а конфликтный PR не доходит до клиента.
      // Fail-open: если проверка недоступна/ошиблась (null) — сдачу НЕ блокируем (гейт в самой доставке — 2-я линия).
      if (proj?.meta.gitflowDelivery && branch) {
        const checks = await checkGitflowConflicts(proj.meta, branch).catch(() => null);
        const conflicting = checks?.filter((c) => c.mergeable === false) ?? [];
        if (conflicting.length) {
          const m = proj.meta;
          after(() => syncClientToDev(m).catch(() => {})); // освежить client-sync/develop, чтобы ребейз был против свежего кода
          return NextResponse.json({
            ok: false, conflict: true, status: "In Progress",
            error: "Гілка конфліктує з актуальним клієнтським develop — здачу відхилено. Портал уже освіжає client-sync/develop: ребейзни свою гілку на origin/client-sync/develop, виріши конфлікти, запуш і здай задачу знову.",
            conflicts: conflicting.map((c) => ({ repo: c.clientRepo, files: c.conflicts ?? [] })),
          }, { status: 409 });
        }
      }

      // Кто закрывает задачу на готовности:
      //  • autoDone (спека супер-админа) / autoApprove (доверенный разраб) + постановщик НЕ клиент → сразу Done.
      //  • НЕ верифицируема клиентом (client_verifiable=false — внутренняя/техническая: миграция, схема, бэкап,
      //    деплой, серверная интеграция без UI) → сразу Done ДАЖЕ для клиента-постановщика: клиент физически не
      //    может это «покликати», поэтому не выносим ему на приёмку (иначе он в недоумении принимает то, чего не видит).
      //  • Иначе (клиент может проверить глазами/руками) → Review с кнопками «Готово/На доработку».
      // DEV-29: обычные задачи ОТ КЛИЕНТА (reporter=client), которые клиент МОЖЕТ проверить, авто-закрывать нельзя.
      const clientCantVerify = task.clientVerifiable === false;
      const autoAccept = (task.autoDone || proj?.meta.autoApprove) && task.reporter?.role !== "client";
      if (clientCantVerify || autoAccept) {
        await be.updateStatus(taskId, "Done", { actorRole: "system", trigger: clientCantVerify ? "авто-готово: внутрішня/технічна задача (клієнт не перевіряє)" : task.autoDone ? "автоздача за спекою (autoDone)" : "gitflow: авто-приймання (autoApprove)" });
        after(() => syncTaskToTrello(taskId, "Done")); // Trello: карточку → «Виконано»
        await advanceStage(taskId, "dev", "розробник здав на ревʼю").catch(() => {}); // готово и на дев-мейн → «На тестовому»; авто-доставка ниже переведёт в «Опубліковано»
        // «Авто-готово» адміну НЕ пушимо — це шум, який ще й треба вручну закривати. Стан видно на дошці; далі йде авто-доставка.
        // Клиенту «Виконано» сообщаем ТОЛЬКО ПОСЛЕ доставки (иначе клиент идёт проверять до публикации и «не бачить змін»).
        const notifyClientDone = async () => {
          if (!summary) return;
          await be.addComment(taskId, `✅ <b>Виконано:</b>\n\n${summary}`, "client", undefined, true, true).catch(() => {});
          await notifyProjectClients(task.projectKey, `✅ <b>${await taskTag(taskId)}</b>: ${task.summary}\n\n${summary.slice(0, 400)}`).catch(() => {});
        };
        // Авто-доставка на репо клиента (squash-пуш/PR + апрув деплоя/мониторинг; миграция — через preDeploy
        // клиентского деплоя). Фоном (after) — не блокируем ответ дев-Клоду; «Виконано» клиенту — ПОСЛЕ доставки.
        // gitflow-режим (meta.gitflowDelivery): доставляем feature-ветку разработчика как PR в develop клиента.
        // Иначе — legacy squash-доставка (meta.autoDeliver). Режимы взаимоисключающие.
        // DEV-46: summary клиенту — в finally, чтобы уходил ГАРАНТИРОВАННО даже если доставка бросила/зависла
        // (иначе summary молча терялся, а клиент не получал итог). Доставка не блокирует итог необратимо.
        const autoDeliverPath = !!((proj?.meta?.gitflowDelivery && branch) || proj?.meta?.autoDeliver);
        if (proj?.meta?.gitflowDelivery && branch) {
          const meta = proj.meta;
          after(async () => { try { await deliverGitflowAndNotify(projectKey, meta, branch, taskId); } finally { await notifyClientDone(); } });
        } else if (proj?.meta?.autoDeliver) {
          const meta = proj.meta;
          after(async () => { try { await autoDeliverAndNotify(projectKey, meta, taskId); } finally { await notifyClientDone(); } });
        } else {
          // Нет авто-доставки (доставка вручную) — сообщаем клиенту сразу, как раньше.
          await notifyClientDone();
        }
        // summaryDelivery — явный сигнал разработчику (DEV-46 п.4): summary уходит клиенту ПОСЛЕ доставки
        // (async, до пары минут на апрув деплоя) либо уже отправлен синхронно; "none" — summary не передан.
        return NextResponse.json({ ok: true, status: "Done", delivery: proj?.meta?.gitflowDelivery && branch ? "gitflow" : (proj?.meta?.autoDeliver ? "squash" : "none"), summaryDelivery: !summary ? "none" : autoDeliverPath ? "after-delivery" : "sent" });
      }
      // Иначе — Ревью + информируем постановщика/клиента, что нужно принять или вернуть.
      await be.updateStatus(taskId, "Review", { actorRole: "contributor", trigger: "розробник здав на ревʼю" });
      after(() => syncTaskToTrello(taskId, "Review")); // Trello: карточку → колонка тестирования
      await advanceStage(taskId, "dev", "розробник здав на ревʼю").catch(() => {}); // сдал на ревью = на дев-мейн → «На тестовому сайті» + коммент клиенту
      const meta = proj?.meta;
      const clientReporter = task.reporter?.role === "client";
      // DEV-40: клиентская задача (reporter=client) + прямая автодоставка → доставляем и ПУБЛИКУЕМ на клиентский
      // прод СРАЗУ (не ждём приёмки), чтобы клиент увидел изменения на своём сайте и лише тоді натиснув «Готово».
      // Иначе — deadlock: клиент не может принять то, чего не видит (у него нет отдельного staging — только прод).
      // Задача остаётся в Review (её закрывает клиент), итог-коммент клиенту — ПОСЛЕ публикации.
      const clientAutoPublish = clientReporter && !!meta?.autoDeliver && !meta?.gitflowDelivery;
      // Итог клиенту (готово до перевірки). На проекте без autoApprove идёт на модерацию супер-админу.
      const postReviewSummary = async () => {
        if (!summary) return;
        await submitForModeration(taskId, `✅ <b>Готово до перевірки:</b>\n\n${summary}\n\n— — —\nℹ️ Перевірте результат і прийміть («Готово») або поверніть на доопрацювання у задачі на порталі.`, { taskSummary: task.summary, devAuthored: true });
      };
      if (clientAutoPublish && meta) {
        // DEV-46: summary — в finally, чтобы уходил ГАРАНТИРОВАННО даже если доставка бросила/зависла.
        after(async () => { try { await autoDeliverAndNotify(projectKey, meta, taskId); } finally { await postReviewSummary(); } });
      } else {
        await postReviewSummary();
        // gitflow-доставка и на ручной приёмке (проект без autoApprove): открываем PR в develop из ветки разработчика.
        if (meta?.gitflowDelivery && branch) { const m = meta; after(() => deliverGitflowAndNotify(projectKey, m, branch, taskId)); }
      }
      // Постановщик-член команды (не клиент/сотрудник, напр. Настя) — адресное уведомление о готовности к проверке.
      if (task.reporter?.login && task.reporter.role !== "client" && task.reporter.role !== "employee") {
        await notifyLogins([task.reporter.login], `🔍 <b>На перевірку</b> · ${await taskTag(taskId)}: ${task.summary}${summary ? `\n\n${summary.slice(0, 400)}` : ""}`, [], { text: "Відкрити задачу", url: `${PORTAL_BASE}/admin/tasks/${taskId}` }).catch(() => {});
      }
      // summaryDelivery (DEV-46 п.4): "after-delivery" — summary опубликуется клиенту после автопубликации
      // (async, до пары хвилин); "sent" — уже опубликован синхронно; "none" — summary не передан.
      return NextResponse.json({ ok: true, status: "Review", delivery: clientAutoPublish ? "squash" : (meta?.gitflowDelivery && branch ? "gitflow" : "none"), summaryDelivery: !summary ? "none" : clientAutoPublish ? "after-delivery" : "sent" });
    }
    await be.updateStatus(taskId, status, { actorRole: "contributor", trigger: status === "In Progress" ? "розробник взяв у роботу" : undefined });
    after(() => syncTaskToTrello(taskId, status)); // Trello: карточку под новый статус (напр. «В процесі»)
    if (status === "In Progress") {
      await setDeployStage(taskId, "pr", { actorRole: "contributor", trigger: "розробник взяв у роботу" }).catch(() => {}); // взял в работу → «Готується»
      // Часть 1 (авто-свежесть): взял задачу в работу → освежаем зеркало клиентского develop в наш dev-репо
      // (client-sync/develop), чтобы разработчик ветвился от актуального кода и заранее видел конфликты, а не
      // полагался на ручной /api/dev/sync. Только для gitflow-проектов. Фоном, best-effort.
      after(async () => {
        try { const p = await getProjectFull(projectKey); if (p?.meta.gitflowDelivery) await syncClientToDev(p.meta); } catch { /* синк вторичен */ }
      });
      // Клиенту — «взяли в роботу» по этой задаче, ОДИН раз (только при первом переходе в работу). Фоном.
      after(async () => {
        try {
          const evs = await getTaskEvents(taskId);
          if (evs.filter((e) => e.type === "status_change" && e.to === "In Progress").length === 1) {
            const t = await be.getTask(taskId);
            await notifyProjectClients(t.projectKey, `▶️ <b>${await taskTag(taskId)}</b>: ${t.summary}\n\nВзяли в роботу.`);
          }
        } catch { /* уведомления вторичны, не роняем ответ */ }
      });
    }
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
