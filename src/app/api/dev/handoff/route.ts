/**
 * Эскалация ручного ops-шага. Портал-Клод классифицирует, КТО должен сделать:
 *  - self   — разработчик может сам (в коде/конфиге) → возвращаем note, флаги не ставим;
 *  - client — действие клиента (зарегистрировать сервис / дать доступ) → клиенту коммент+гайд+пуш, поле для данных;
 *  - owner  — инфра агентства (наш деплой/биллинг/токены) → владельцу (как раньше).
 * POST /api/dev/handoff  { taskId, action }
 * Авторизация: Authorization: Bearer <project_token>
 */
import { NextResponse } from "next/server";
import { getProjectKeyByToken, setOwnerAction, setClientAction, getProjectFull, projectHasClient, enableProjectField } from "@/lib/db";
import { getBackend } from "@/lib/tasks";
import { notifyAdmin, notifyProjectClients, taskTag, warnClientUnreachable } from "@/lib/notify";
import { readJsonSmart } from "@/lib/req-body";
import { classifyHandoff, generateGuide } from "@/lib/handoff-classify";
import { submitForModeration } from "@/lib/moderation";
import { PORTAL_BASE } from "@/lib/dev-protocol";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "no token" }, { status: 401 });
  const projectKey = await getProjectKeyByToken(token);
  if (!projectKey) return NextResponse.json({ error: "invalid token" }, { status: 403 });

  let body: { taskId?: string; action?: string };
  try { body = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const taskId = String(body.taskId || "").trim();
  const action = String(body.action || "").trim();
  if (!taskId || !action) return NextResponse.json({ error: "taskId and action required" }, { status: 400 });
  if (!taskId.startsWith(projectKey + "-")) return NextResponse.json({ error: "task not in project" }, { status: 403 });

  const be = getBackend();
  try {
    const task = await be.getTask(taskId);
    const proj = await getProjectFull(projectKey);
    const hasClient = await projectHasClient(projectKey).catch(() => false);
    const cls = await classifyHandoff(action, { summary: task.summary, projectSpec: proj?.meta.spec, hasClient });
    const taskBtn = { text: "Відкрити задачу", url: `${PORTAL_BASE}/admin/tasks/${taskId}` };

    if (cls.kind === "self") {
      // Разработчик может сам — флаги не ставим, возвращаем note (и оставляем внутренний след).
      await be.addComment(taskId, `🧩 <i>Этот шаг можно сделать самому: ${action}</i>`, "internal", undefined, true, true).catch(() => {});
      return NextResponse.json({ ok: true, handedOff: "self", note: "Это можешь сделать сам (код/конфиг). Не эскалируй — выполни в рамках задачи." });
    }

    if (cls.kind === "client") {
      const short = cls.clientShort || action.slice(0, 120);
      const full = cls.clientText || action;
      // Гайда нет — генерим его сразу (подробно, для клиента, в 3 локалях) и привязываем.
      let guideId = cls.guideId ?? null;
      if (guideId == null) guideId = await generateGuide(short).catch(() => null);
      // Поле для значения: если креды совпали с полем каталога — включаем его проекту и связываем с задачей,
      // чтобы введённое клиентом значение легло в structured customFields (видно деву в /api/dev/secrets).
      const fieldKey = cls.fieldKey ?? null;
      if (fieldKey) await enableProjectField(projectKey, fieldKey.split(".")[0]).catch(() => {});
      await setClientAction(taskId, full, guideId, fieldKey);
      if (task.state && /open|новая/i.test(task.state)) await be.updateStatus(taskId, "In Progress").catch(() => {});
      if (cls.recurringCost) {
        // Платный/подписочный сервис — клиентское сообщение НЕ шлём напрямую, а на модерацию супер-админу
        // (одобрение расходов). После апрува клиент увидит коммент и уведомление; поле/инструкция уже готовы.
        await submitForModeration(taskId, `🔑 <b>Потрібно оплатити платний доступ:</b> ${short}\n\nІнструкція та поле для даних — під заголовком задачі. Після оплати/реєстрації впишіть дані та натисніть «Готово».`, { taskSummary: task.summary, devAuthored: true }).catch(() => {});
        await be.updateStatus(taskId, "Blocked").catch(() => {});
        return NextResponse.json({ ok: true, handedOff: "client", paidApproval: true, fieldKey, needGuide: cls.guideId == null, note: "Платный сервис: запрос с полем+инструкцией готов, клиентское сообщение ушло владельцу на модерацию (одобрение стоимости). Бери следующую незаблокированную задачу." });
      }
      await be.addComment(taskId, `🔑 <b>Потрібно зареєструвати / надати доступ:</b> ${short}\n\nІнструкція та поле для даних — під заголовком задачі. Після реєстрації впишіть дані та натисніть «Готово».`, "client", undefined, true, true).catch(() => {});
      const reached = await notifyProjectClients(projectKey, `🔑 <b>Потрібна ваша дія</b> · ${await taskTag(taskId)}\nПотрібно зареєструвати: ${short}\nВідкрийте задачу — там покрокова інструкція і поле для даних.`, [], taskBtn).catch(() => 0);
      // Клиент не подключён к боту → уведомление не доставлено: предупреждаем команду, иначе ждём «молчания».
      if (!reached) await warnClientUnreachable(projectKey, taskId, task.summary, proj?.meta.defaultAssignee).catch(() => {});
      return NextResponse.json({ ok: true, handedOff: "client", clientNotified: reached > 0, fieldKey, needGuide: cls.guideId == null, note: reached > 0 ? "Запрос ушёл клиенту с инструкцией и полем. Бери следующую незаблокированную задачу." : "ВНИМАНИЕ: клиент не подключён к боту — уведомление не доставлено. Запрос/поле созданы, но свяжись с клиентом другим каналом или сообщи владельцу. Бери следующую незаблокированную задачу." });
    }

    // owner
    const ownerText = cls.ownerText || action;
    await setOwnerAction(taskId, ownerText);
    if (task.state && /open|новая/i.test(task.state)) await be.updateStatus(taskId, "In Progress").catch(() => {});
    await notifyAdmin(`🛠 <b>Ручной шаг агентства</b> (от Claude разработчика) · ${await taskTag(taskId)}: ${task.summary}\n${ownerText.slice(0, 600)}`, taskBtn).catch(() => {});
    return NextResponse.json({ ok: true, handedOff: "owner", note: "Клиент видит «в работе». Бери следующую незаблокированную задачу." });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
