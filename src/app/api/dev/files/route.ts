/**
 * Загрузка вложения через токен проекта (для Claude Code разработчика). DEV-8.
 * POST /api/dev/files  — multipart/form-data: поле `file` (бинарь) + `taskId` (напр. SAD-2).
 * Файл сохраняется в БД и привязывается к задаче ЭТОГО проекта. Возвращает { id, url, name }.
 * Дальше ссылайся на него в коментаре markdown-ссылкой `[имя](/api/files/<id>)` (рендерится файл-карточкой);
 * клиент скачает по /api/files/<id> (он авторизован в портале), ты — по /api/dev/files/<id> под токеном.
 * Авторизация: Authorization: Bearer <project_token>.
 */
import { NextResponse } from "next/server";
import { getProjectKeyByToken, saveAttachment } from "@/lib/db";

export const dynamic = "force-dynamic";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "no token" }, { status: 401 });
  const projectKey = await getProjectKeyByToken(token);
  if (!projectKey) return NextResponse.json({ error: "invalid token" }, { status: 403 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 }); }

  const taskId = String(form.get("taskId") || "").trim();
  const file = form.get("file");
  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });
  if (!taskId.startsWith(projectKey + "-")) return NextResponse.json({ error: "task not in project" }, { status: 403 });
  if (!(file instanceof File)) return NextResponse.json({ error: "file (multipart) required" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) return NextResponse.json({ error: "empty file" }, { status: 400 });
  const mime = file.type || "application/octet-stream";
  const name = file.name || "file";

  const id = await saveAttachment(taskId, mime, buf.toString("base64"), name);
  if (id == null) return NextResponse.json({ error: `задача ${taskId} не найдена` }, { status: 404 });

  // url — для вставки в коммент: клиент откроет по нему файл-карточкой. Имя в БД получает суффикс уникальности,
  // но Content-Disposition в /api/files его срезает и отдаёт исходное имя.
  return NextResponse.json({ id, url: `/api/files/${id}`, name, bytes: buf.length });
}
