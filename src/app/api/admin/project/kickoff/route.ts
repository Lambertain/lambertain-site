/**
 * Kickoff проекта из сохранённой спеки (для Claude/скриптов, без сессии портала).
 * POST /api/admin/project/kickoff  { projectKey }
 * Берёт meta.spec, разбивает на задачи (decomposeSpec) и СРАЗУ создаёт их с зависимостями/тегами,
 * assign на defaultAssignee, autoDone (спека супер-админа). То же, что кнопка kickoffFromSpec в портале.
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { readJsonSmart } from "@/lib/req-body";
import { getProjectFull, setTaskTags, setTaskAiStatus, setTaskDeps, projectReporterLogin } from "@/lib/db";
import { getBackend } from "@/lib/tasks";
import { decomposeSpec, type KickoffTask } from "@/lib/kickoff";
import { notifyLogins, notifyProjectClients } from "@/lib/notify";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let body: { projectKey?: string };
  try { body = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const projectKey = String(body.projectKey || "").trim();
  if (!projectKey) return NextResponse.json({ error: "projectKey required" }, { status: 400 });

  const p = await getProjectFull(projectKey);
  if (!p) return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
  const spec = (p.meta.spec || "").trim();
  if (!spec) return NextResponse.json({ error: "У проекта нет сохранённой meta.spec" }, { status: 400 });

  try {
    const tasks: KickoffTask[] = await decomposeSpec(spec, p.name);
    if (!tasks.length) return NextResponse.json({ error: "Не удалось разбить спеку на задачи" }, { status: 422 });
    const be = getBackend();
    const assignee = p.meta.defaultAssignee || null;
    // Постановщик задач проекта — КЛИЕНТ (его проект, он принимает результат). Нет клиента → null.
    const clientLogin = await projectReporterLogin(projectKey);
    const ids: string[] = [];
    for (const tk of tasks) {
      const task = await be.createTask({
        projectKey,
        summary: tk.summary,
        description: tk.description || "",
        assigneeLogin: assignee,
        reporterLogin: clientLogin,
        approvalStatus: "approved",
        autoDone: false, // клиент-постановщик принимает результат сам (а не авто-Готово)
      });
      await setTaskTags(task.id, { type: tk.type, complexity: tk.complexity, skills: (Array.isArray(tk.skills) ? tk.skills : []).filter(Boolean) });
      await setTaskAiStatus(task.id, "done");
      ids.push(task.id);
    }
    // Зависимости (правильный порядок выполнения).
    for (let i = 0; i < tasks.length; i++) {
      const deps = (tasks[i].dependsOn || []).filter((j) => j >= 0 && j < ids.length && j !== i).map((j) => ids[j]);
      if (deps.length) await setTaskDeps(ids[i], deps).catch(() => {});
    }
    if (assignee) await notifyLogins([assignee], `🆕 <b>Проект разбит на задачи</b> · ${p.name}: ${ids.length} задач(и). Делай по порядку — блокеры расставлены.`).catch(() => {});
    // Клиент-постановщик — пуш, что по проекту начали работу (вовлечённость + видно прогресс).
    if (clientLogin) await notifyProjectClients(projectKey, `🚀 <b>${p.name}</b>: по проєкту створено ${ids.length} задач — роботу розпочато. Стежте за прогресом у порталі.`).catch(() => {});
    return NextResponse.json({ ok: true, created: ids.length, ids });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка декомпозиции/создания" }, { status: 500 });
  }
}
