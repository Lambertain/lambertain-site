/**
 * Переназначить ops-шаг задачи на КЛИЕНТА (admin-токен). Извлекает клиентскую часть (зарегистрировать
 * сервис/прислать токен) простым языком + гайд из каталога + поле для данных, шлёт клиенту, снимает owner-флаг.
 * POST /api/admin/task-to-client  { readableId }
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { readJsonSmart } from "@/lib/req-body";
import { getBackend } from "@/lib/tasks";
import { getProjectFull, projectHasClient, setClientAction, setOwnerAction } from "@/lib/db";
import { notifyProjectClients, taskTag } from "@/lib/notify";
import { clientStepFromAction, generateGuide } from "@/lib/handoff-classify";
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

  let b: { readableId?: string };
  try { b = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const readableId = String(b.readableId || "").trim();
  if (!readableId) return NextResponse.json({ error: "readableId обязателен" }, { status: 400 });

  const be = getBackend();
  let task;
  try { task = await be.getTask(readableId); } catch { return NextResponse.json({ error: `Задача ${readableId} не найдена` }, { status: 404 }); }
  const source = (task.ownerAction || task.clientAction || "").trim();
  if (!source) return NextResponse.json({ error: "у задачи нет ops-шага для передачи" }, { status: 400 });
  if (!(await projectHasClient(task.projectKey))) return NextResponse.json({ error: "в проекте нет клиента" }, { status: 400 });

  const proj = await getProjectFull(task.projectKey).catch(() => null);
  const { short, text, guideId } = await clientStepFromAction(source, { summary: task.summary, projectSpec: proj?.meta.spec });
  const gid = guideId ?? (await generateGuide(short).catch(() => null));
  await setClientAction(readableId, text, gid);
  await setOwnerAction(readableId, null);
  await be.addComment(readableId, `🔑 <b>Потрібно зареєструвати / надати доступ:</b> ${short}\n\nІнструкція та поле для даних — нижче в задачі. Після реєстрації впишіть дані та натисніть «Готово».`, "client", undefined, true, false).catch(() => {});
  await notifyProjectClients(task.projectKey, `🔑 <b>Потрібна ваша дія</b> · ${await taskTag(readableId)}\nПотрібно зареєструвати: ${short}\nВідкрийте задачу — там покрокова інструкція і поле для даних.`, [], { text: "Открыть задачу", url: `${PORTAL_BASE}/admin/tasks/${readableId}` }).catch(() => {});
  revalidatePath(`/admin/tasks/${readableId}`);
  return NextResponse.json({ ok: true, readableId, clientShort: short, guideId: gid });
}
