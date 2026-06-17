/**
 * Прикрепить файл к задаче (через сервер, мимо лимита Server Actions) + добавить комментарий со ссылкой.
 * Для отправки клиенту больших файлов (сборки/APK), когда браузерная загрузка не проходит.
 * POST /api/admin/task-attachment  { readableId, name, mime, dataBase64, text?, toClient? }
 *   toClient=true → клиент-видимый коммент НА МОДЕРАЦИЮ супер-админу (как обычный итог команды);
 *   иначе → внутренний коммент (клиент не видит).
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { saveAttachment } from "@/lib/db";
import { getBackend } from "@/lib/tasks";
import { submitForModeration } from "@/lib/moderation";
import { readJsonSmart } from "@/lib/req-body";
import { revalidatePath } from "next/cache";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let body: { readableId?: string; name?: string; mime?: string; dataBase64?: string; text?: string; toClient?: boolean };
  try { body = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const readableId = String(body.readableId || "").trim();
  const name = String(body.name || "file").trim();
  const mime = String(body.mime || "application/octet-stream").trim();
  const dataBase64 = String(body.dataBase64 || "");
  const text = String(body.text || "").trim();
  const toClient = body.toClient === true;
  if (!readableId || !dataBase64) return NextResponse.json({ error: "readableId и dataBase64 обязательны" }, { status: 400 });

  const aid = await saveAttachment(readableId, mime, dataBase64, name);
  if (aid == null) return NextResponse.json({ error: `задача ${readableId} не найдена` }, { status: 404 });

  const link = `[${name}](/api/files/${aid})`;
  const commentBody = text ? `${text}\n\n${link}` : link;
  if (toClient) {
    await submitForModeration(readableId, commentBody);
  } else {
    await getBackend().addComment(readableId, commentBody, "internal");
  }
  revalidatePath(`/admin/tasks/${readableId}`);
  return NextResponse.json({ ok: true, readableId, attachmentId: aid, toClient, moderated: toClient });
}
