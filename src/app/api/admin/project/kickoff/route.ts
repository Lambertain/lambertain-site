/**
 * Kickoff проекта из сохранённой спеки (для Claude/скриптов, без сессии портала).
 * POST /api/admin/project/kickoff  { projectKey }
 * Берёт meta.spec, разбивает на задачи (decomposeSpec) и СРАЗУ создаёт их с зависимостями/тегами,
 * assign на defaultAssignee, autoDone (спека супер-админа). То же, что кнопка kickoffFromSpec в портале.
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { readJsonSmart } from "@/lib/req-body";
import { getProjectFull, setTaskTags, projectReporterLogin } from "@/lib/db";
import { getBackend } from "@/lib/tasks";
import { decomposeSpec, type KickoffTask } from "@/lib/kickoff";
import { notifyLogins, notifyProjectClients } from "@/lib/notify";
import { getSpec, projectSpecText } from "@/lib/specs";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let body: { projectKey?: string; specKey?: string };
  try { body = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const projectKey = String(body.projectKey || "").trim();
  if (!projectKey) return NextResponse.json({ error: "projectKey required" }, { status: 400 });
  const specKey = String(body.specKey || "").trim();

  const p = await getProjectFull(projectKey);
  if (!p) return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
  // specKey — разбить ОДНУ спеку (модуль/фазу); иначе — всю спеку проекта (все specs[] или легаси).
  const one = specKey ? getSpec(p.meta, specKey) : null;
  if (specKey && !one) return NextResponse.json({ error: `спека ${specKey} не найдена` }, { status: 404 });
  const spec = (one ? `# ${one.title}\n\n${one.body}` : projectSpecText(p.meta)).trim();
  if (!spec) return NextResponse.json({ error: "У проекта нет сохранённой спеки" }, { status: 400 });
  const decompName = one ? `${p.name} — ${one.title}` : p.name;

  const be = getBackend();
  // Первый ли это kickoff проекта: если задачи уже есть (разбиваем следующий модуль спеки), то и дизайн-систему
  // заново НЕ создаём (она одна на продукт), и «проєкт розбито» повторно не шлём — уведомление одно на проект.
  const hadTasks = (await be.listTasks({ projectKey, limit: 1 })).length > 0;
  try {
    const tasks: KickoffTask[] = await decomposeSpec(spec, decompName, { includeDesignSystem: !hadTasks });
    if (!tasks.length) return NextResponse.json({ error: "Не удалось разбить спеку на задачи" }, { status: 422 });
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
      ids.push(task.id);
    }
    // Блокеры НЕ ставим: задачи созданы в порядке выполнения (по номерам). Разработчик делает их ПОДРЯД,
    // не дожидаясь приёмки предыдущей (см. dev-protocol). Порядок = очередь номеров задач.
    // Уведомление о заведении задач — ОДНО на проект (только при первом kickoff). Дальше — по каждой
    // задаче отдельно, когда её берут в работу (см. dev/status и admin/task-status).
    if (!hadTasks && assignee) await notifyLogins([assignee], `🆕 <b>${p.name}</b>: проєкт розбито на задачі. Бери ПО ПОРЯДКУ (за номерами), не чекай приймання попередньої.`).catch(() => {});
    if (!hadTasks && clientLogin) await notifyProjectClients(projectKey, `🚀 <b>${p.name}</b>: узялися за ваш проєкт — розклали його на задачі. Повідомлятимемо окремо, щойно братимемо кожну задачу в роботу.`).catch(() => {});
    return NextResponse.json({ ok: true, created: ids.length, ids });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка декомпозиции/создания" }, { status: 500 });
  }
}
