/**
 * Привязка PR к задаче (источник деплой-стадии задачи: pr → dev → prod).
 * POST /api/dev/pr  { taskId, prUrl }
 *   Разработчик регистрирует Pull Request по задаче, когда открывает его. Задача получает стадию «pr»
 *   (клиенту — «Готується»). Когда PR смержат — поллер переведёт в «dev» («На тестовому сайті»);
 *   после доставки в прод — «prod» («Опубліковано»). Не зависит от статуса задачи (Open/Review/Done).
 * Авторизация: Authorization: Bearer <project_token>
 */
import { NextResponse } from "next/server";
import { getProjectKeyByToken, setTaskPr } from "@/lib/db";
import { readJsonSmart } from "@/lib/req-body";
import { revalidatePath } from "next/cache";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "no token" }, { status: 401 });
  const projectKey = await getProjectKeyByToken(token);
  if (!projectKey) return NextResponse.json({ error: "invalid token" }, { status: 403 });

  let body: { taskId?: string; prUrl?: string };
  try { body = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const taskId = String(body.taskId || "").trim();
  const prUrl = String(body.prUrl || "").trim();
  if (!taskId || !prUrl) return NextResponse.json({ error: "taskId and prUrl required" }, { status: 400 });
  if (!taskId.startsWith(projectKey + "-")) return NextResponse.json({ error: "task not in project" }, { status: 403 });
  if (!/^https?:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(prUrl)) {
    return NextResponse.json({ error: "prUrl должен быть ссылкой на GitHub PR (…/pull/N)" }, { status: 400 });
  }

  const r = await setTaskPr(taskId, prUrl);
  if (!r) return NextResponse.json({ error: "task not found" }, { status: 404 });
  revalidatePath(`/admin/tasks/${taskId}`);
  return NextResponse.json({ ok: true, taskId, stage: "pr" });
}
