/**
 * Передача задачи ВЛАДЕЛЬЦУ: задача требует ручного ops-шага, который может сделать только владелец
 * (деплой на хостинг, регистрация сервиса/аккаунта, получение токена/ключей, DNS, биллинг, сторы).
 * POST /api/dev/handoff  { taskId, action }
 *  - action: что нужно сделать владельцу (понятным текстом).
 *  - Клиент НИЧЕГО не видит: статус остаётся «в работе» (In Progress). Это внутренний флаг owner_action.
 *  - Супер-админу (владельцу) уходит уведомление. Разработчик берёт СЛЕДУЮЩУЮ незаблокированную задачу.
 * Авторизация: Authorization: Bearer <project_token>
 */
import { NextResponse } from "next/server";
import { getProjectKeyByToken, setOwnerAction } from "@/lib/db";
import { getBackend } from "@/lib/tasks";
import { notifyAdmin } from "@/lib/notify";
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
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const taskId = String(body.taskId || "").trim();
  const action = String(body.action || "").trim();
  if (!taskId || !action) return NextResponse.json({ error: "taskId and action required" }, { status: 400 });
  if (!taskId.startsWith(projectKey + "-")) return NextResponse.json({ error: "task not in project" }, { status: 403 });

  const be = getBackend();
  try {
    const task = await be.getTask(taskId);
    await setOwnerAction(taskId, action);
    // Клиент видит «в работе»: если задача ещё Open — переведём в In Progress, иначе статус не трогаем.
    if (task.state && /open|новая/i.test(task.state)) await be.updateStatus(taskId, "In Progress").catch(() => {});
    await notifyAdmin(
      `🛠 <b>Нужно действие владельца</b> · ${taskId}: ${task.summary}\n${action.slice(0, 600)}`,
      { text: "Открыть задачу", url: `${PORTAL_BASE}/admin/tasks/${taskId}` },
    ).catch(() => {});
    return NextResponse.json({ ok: true, handedOff: "owner", note: "Клиент видит «в работе». Бери следующую незаблокированную задачу." });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
