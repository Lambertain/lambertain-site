/**
 * Эскалация вопроса от Claude разработчика по токену проекта.
 * POST /api/dev/escalate  { taskId, question, kind?: "client" | "admin" }
 *  - kind "client" (по умолч.): ИИ оформляет вопрос клиенту от лица агентства → клиент-видимый коммент + уведомление клиенту.
 *  - kind "admin": внутренний коммент + уведомление Никите (продуктовые/бизнес-развилки).
 * Авторизация: Authorization: Bearer <project_token>
 */
import { NextResponse } from "next/server";
import { getProjectKeyByToken, logTaskEvent, setReporterAction } from "@/lib/db";
import { getBackend } from "@/lib/tasks";
import { notifyAdmin, notifyLogins, taskTag } from "@/lib/notify";
import { readJsonSmart } from "@/lib/req-body";
import { submitForModeration } from "@/lib/moderation";
import { escalationMark, PORTAL_BASE } from "@/lib/dev-protocol";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "no token" }, { status: 401 });
  const projectKey = await getProjectKeyByToken(token);
  if (!projectKey) return NextResponse.json({ error: "invalid token" }, { status: 403 });

  let body: { taskId?: string; question?: string; kind?: string };
  try {
    body = await readJsonSmart(req);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const taskId = String(body.taskId || "").trim();
  const question = String(body.question || "").trim();
  const kind = body.kind === "admin" ? "admin" : "client";
  if (!taskId || !question) return NextResponse.json({ error: "taskId and question required" }, { status: 400 });
  if (!taskId.startsWith(projectKey + "-")) return NextResponse.json({ error: "task not in project" }, { status: 403 });

  const be = getBackend();
  // Кнопка «Відкрити задачу» → страница задачи в браузере (где коммент с эскалацией).
  const openBtn = { text: "Відкрити задачу", url: `${PORTAL_BASE}/admin/tasks/${taskId}` };
  try {
    const task = await be.getTask(taskId);

    if (kind === "admin") {
      // Вопрос/решение — ПОСТАНОВЩИКУ задачи (кто её создал), а не глобально супер-админу.
      // Постановщик-член (напр. админ Настя) получает уведомление; иначе — супер-админ (Никита).
      const body = `🔧 Вопрос разработчика (нужно решение):\n\n${question}`;
      await be.addComment(taskId, body, "internal", undefined, true, true);
      // DEV-48: маркер «ждёт ответа постановщика» — НЕ меняем статус (иначе уходит в Blocked, куда постановщик
      // не заглянет). Задача остаётся на первом табе; на доске — плашка + мини-секция постановщику. Снимется
      // ответом постановщика (коммент). Снимаем плашку через 80 симв., полный вопрос — в комменте выше.
      await setReporterAction(taskId, question).catch(() => {});
      await logTaskEvent(taskId, { type: "escalation", actorRole: "contributor", trigger: "escalate(admin)", details: { kind: "admin", question: question.slice(0, 300) } });
      const msg = `🔧 <b>Вопрос разработчика</b> · ${await taskTag(taskId)}: ${task.summary}\n${question.slice(0, 400)}`;
      if (task.reporter?.login) await notifyLogins([task.reporter.login], msg, [], openBtn);
      else await notifyAdmin(msg, openBtn);
      return NextResponse.json({ ok: true, escalatedTo: task.reporter?.login || "admin" });
    }

    // client: вопрос уходит на МОДЕРАЦИЮ супер-админу (клиент увидит после апрува). Задача блокируется до ответа.
    // DEV-35/DEV-37: НЕ переписываем текст через LLM — он уже согласован разработчиком и идёт через модерацию;
    // повторная переформулировка расходилась с утверждённым и обрезалась лимитом токенов (вопрос приходил усечённым).
    // Заголовок — в языке самого вопроса (укр. по умолчанию), а не хардкод «Вопрос».
    const mark = escalationMark(question);
    await submitForModeration(taskId, `${mark}\n\n${question}`, { taskSummary: task.summary, devAuthored: true });
    await logTaskEvent(taskId, { type: "escalation", actorRole: "contributor", trigger: "escalate(client) → Blocked", details: { kind: "client", question: question.slice(0, 300) } });
    await be.updateStatus(taskId, "Blocked", { actorRole: "contributor", trigger: "escalate(client): питання клієнту" }).catch(() => {});
    return NextResponse.json({ ok: true, escalatedTo: "client (на модерации)", posted: question });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
