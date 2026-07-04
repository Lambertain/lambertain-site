/**
 * Добавить коммент к задаче от агентства (Lambertain) по admin-токену. Для скриптов/Claude без сессии.
 * POST /api/admin/comment  { readableId, body, visibleToClient?, review? }
 *   visibleToClient:true — клиент-видимый коммент (публикуется сразу, клиент получает пуш); иначе внутренний.
 *   review:true — заодно перевести задачу в «Ревью».
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { readJsonSmart } from "@/lib/req-body";
import { getBackend } from "@/lib/tasks";
import { notifyProjectClients, notifyLogins, taskTag, attachmentIdsIn } from "@/lib/notify";
import { mirrorCommentToTrello } from "@/lib/trello";
import { PORTAL_BASE } from "@/lib/dev-protocol";
import { revalidatePath } from "next/cache";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let b: { readableId?: string; body?: string; visibleToClient?: boolean; hideFromDev?: boolean; review?: boolean };
  try { b = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const readableId = String(b.readableId || "").trim();
  const body = String(b.body || "").trim();
  if (!readableId || !body) return NextResponse.json({ error: "readableId и body обязательны" }, { status: 400 });

  const be = getBackend();
  let task;
  try { task = await be.getTask(readableId); } catch { return NextResponse.json({ error: `Задача ${readableId} не найдена` }, { status: 404 }); }

  // hideFromDev — коммент КЛИЕНТУ, но СКРЫТЫЙ от разработчика (фин-вопросы мимо дева): client_nodev.
  const hideFromDev = b.hideFromDev === true;
  const vis: "client" | "internal" | "client_nodev" = hideFromDev ? "client_nodev" : b.visibleToClient === true ? "client" : "internal";
  const visible = vis === "client" || vis === "client_nodev"; // клиент видит (client_nodev тоже клиент-видимый, но не разработчик)
  // Коммент от супер-админа (агентства): без member-логина, approved сразу (модерация супер-админа не нужна).
  await be.addComment(readableId, body, vis, undefined, true, false);
  const link = { text: "Відкрити задачу", url: `${PORTAL_BASE}/admin/tasks/${readableId}` };
  if (visible) {
    await mirrorCommentToTrello(readableId, body).catch(() => {}); // портал → Trello (если подключена доска)
    await notifyProjectClients(task.projectKey, `💬 <b>${await taskTag(readableId)}</b>: ${task.summary}\n${body.slice(0, 400)}`, attachmentIdsIn(body), link).catch(() => {});
  }
  // Уведомить постановщика (если он не клиент — клиентов уже покрыл notifyProjectClients): новый коммент по его задаче.
  if (task.reporter?.login && task.reporter.role !== "client") {
    await notifyLogins([task.reporter.login], `💬 <b>Відповідь по задачі</b> · ${await taskTag(readableId)}: ${task.summary}\n${body.slice(0, 400)}`, attachmentIdsIn(body), link).catch(() => {});
  }
  if (b.review === true) {
    await be.updateStatus(readableId, "Review");
    if (task.reporter?.login) await notifyLogins([task.reporter.login], `🔍 <b>На перевірку</b> · ${await taskTag(readableId)}: ${task.summary}`, [], link).catch(() => {});
  }
  revalidatePath(`/admin/tasks/${readableId}`);
  revalidatePath("/admin");
  return NextResponse.json({ ok: true, readableId, visibleToClient: visible, review: b.review === true });
}
