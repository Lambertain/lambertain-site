/**
 * Фоновая ИИ-проработка задачи: читает сырой запрос (текст + скрины) и код репозитория,
 * пишет техническую спецификацию во ВНУТРЕННИЙ комментарий (видит разработчик, не клиент)
 * и назначает исполнителя. Если без уточнения нельзя — задаёт клиенту вопрос в клиентском
 * комментарии. Server-side only.
 */
import Anthropic from "@anthropic-ai/sdk";
import { listDir, listTree, readFile, searchCode, repoFromGit } from "./github";
import { listSkills, getSkill, createSkill, logUsage, setTaskAiStatus, assignTask, setTaskTitle, getTaskImages } from "./db";
import { notifyLogins, notifyProjectClients, notifyAdmin } from "./notify";
import { getBackend } from "./tasks";

const MODEL = process.env.STRUCTURER_MODEL || "claude-opus-4-8";

const TOOLS: Anthropic.Tool[] = [
  { name: "list_tree", description: "ВСЁ дерево файлов репозитория одним вызовом (рекурсивно). Начни с него для ориентации — приложение может быть во вложенной папке. sub — фильтр по префиксу пути (опц.).", input_schema: { type: "object", properties: { sub: { type: "string" } } } },
  { name: "list_dir", description: "Список файлов/папок в директории репозитория.", input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "read_file", description: "Прочитать файл репозитория.", input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "search_code", description: "Поиск по коду/путям репозитория (для private ищет по именам файлов — ориентируйся также по list_tree).", input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "use_skill", description: "Получить плейбук скила по slug (из списка доступных).", input_schema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] } },
  {
    name: "create_skill",
    description: "Создать новый скил-плейбук, если подходящего нет. Затем следуй ему.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "kebab-case" },
        title: { type: "string" },
        triggers: { type: "string", description: "ключевые слова через запятую" },
        playbook: { type: "string", description: "чек-лист постановки задач этого типа" },
      },
      required: ["slug", "title", "triggers", "playbook"],
    },
  },
  {
    name: "ask_client",
    description: "ЕДИНСТВЕННЫЙ способ задать вопрос клиенту/заказчику. Ровно один короткий вопрос по делу. Только если без ответа реально нельзя подготовить спеку. Решай как опытный разработчик — мелочи не уточняй.",
    input_schema: { type: "object", properties: { question: { type: "string" } }, required: ["question"] },
  },
  {
    name: "write_spec",
    description: "Финал: техническая спецификация реализации для разработчика (внутренняя, клиент не видит). Вызывай, когда всё ясно.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Уточнённый короткий заголовок задачи (до 80 симв.)." },
        spec: { type: "string", description: "Детальная спека в Markdown: что сделать, затронутые файлы/модули, поток данных, edge-cases, критерии готовности, найденные попутно баги (блок «Попутно исправить»)." },
        assigneeLogin: { type: ["string", "null"], description: "login исполнителя из списка или null (тогда — ответственный по проекту)." },
      },
      required: ["spec"],
    },
  },
];

async function runTool(name: string, input: Record<string, unknown>, repo: string | null): Promise<string> {
  if (name === "use_skill") {
    const s = await getSkill(String(input.slug || ""));
    return s ? s.playbook : "Скил не найден — создай через create_skill.";
  }
  if (name === "create_skill") {
    const slug = String(input.slug || "").trim();
    await createSkill(slug, String(input.title || slug), String(input.triggers || ""), String(input.playbook || ""), true);
    await notifyAdmin(`🧩 <b>Добавлен новый скил</b>: ${input.title || slug}`);
    return `Скил ${slug} создан. Следуй его плейбуку:\n${input.playbook}`;
  }
  if (!repo) return "Репозиторий не привязан к проекту.";
  if (name === "list_tree") return listTree(repo, String(input.sub || ""));
  if (name === "list_dir") return listDir(repo, String(input.path || ""));
  if (name === "read_file") return readFile(repo, String(input.path || ""));
  if (name === "search_code") return searchCode(repo, String(input.query || ""));
  return "неизвестный инструмент";
}

function systemPrompt(opts: {
  taskId: string;
  projectName: string;
  repo: string | null;
  conventions: string;
  users: string;
  skillList: string;
  today: string;
}): string {
  return (
    "Ты — старший инженер и проджект-менеджер агентства Lambertain. Тебе передали СЫРОЙ запрос (текст + скриншоты) " +
    `на задачу ${opts.taskId} проекта «${opts.projectName}». Сегодня: ${opts.today}.\n` +
    (opts.repo ? `Репозиторий: ${opts.repo}. Сверяйся с кодом инструментами.\n` : "Репозиторий не привязан — работай по тексту и скринам.\n") +
    `Возможные исполнители: ${opts.users || "—"}.\n\n` +
    (opts.conventions ? opts.conventions + "\n\n" : "") +
    "Доступные скилы (плейбуки):\n" + (opts.skillList || "(нет)") + "\n\n" +
    "ЗАДАЧА: изучи код и подготовь детальную ТЕХНИЧЕСКУЮ СПЕЦИФИКАЦИЮ реализации для разработчика.\n" +
    "Алгоритм (двигайся ЭФФЕКТИВНО, не трать ходы впустую):\n" +
    "1) СНАЧАЛА list_tree — увидь всю структуру репо одним вызовом (приложение может быть во вложенной папке, напр. lambertain-agency/). Затем читай только релевантные файлы.\n" +
    "2) Определи тип задачи, при необходимости подними скил (use_skill); нет подходящего — create_skill.\n" +
    "3) Найди затронутые файлы и пойми что есть и чего не хватает. ВАЖНО: GitHub code-search по содержимому для private пуст — ориентируйся по list_tree и читай файлы напрямую (read_file), не повторяй пустой search.\n" +
    "4) Кратко продумай решение (writing-plans по сути): затронутые файлы/модули, поток данных, edge-cases, критерии готовности. Найденные попутно баги — блок «Попутно исправить».\n" +
    "5) write_spec — финальная техническая спека для разработчика (внутренняя, клиент НЕ видит). Это ОСНОВНОЙ результат. НЕ затягивай: как только понял суть — финализируй.\n\n" +
    "ОБЩЕНИЕ — ТОЛЬКО ЧЕРЕЗ ИНСТРУМЕНТЫ. Любой свободный текст отбрасывается, его никто не прочитает. " +
    "НЕ отчитывайся о прогрессе, не рассуждай вслух, не пиши «сейчас прочитаю/похоже…» — просто молча работай инструментами. " +
    "Действуй автономно как опытный разработчик: решения принимай сам, мелочи не уточняй. ask_client вызывай ТОЛЬКО если без ответа клиента реально нельзя " +
    "(неоднозначность бизнес-логики, которую не вывести из кода) — один короткий вопрос по делу. " +
    "Даже если что-то не до конца ясно по коду — лучше написать спеку с разумными допущениями (пометив их), чем зависнуть. write_spec — обязательный итог."
  );
}

/**
 * Прогнать ИИ-проработку задачи. Идемпотентно по состоянию: пишет спеку (write_spec) или
 * задаёт вопрос клиенту (ask_client). Вызывается из Server Action (after) и при ответе клиента.
 */
export async function draftTask(taskId: string): Promise<void> {
  const be = getBackend();
  let inTok = 0, outTok = 0;
  try {
    const [task, comments, projects, users, images] = await Promise.all([
      be.getTask(taskId),
      be.getComments(taskId),
      be.listProjects(),
      be.listUsers(),
      getTaskImages(taskId),
    ]);
    const project = projects.find((p) => p.key === task.projectKey);
    if (!project) return;
    const repo = repoFromGit(project.meta.devGit);
    const skills = await listSkills();

    const conventions = project.meta.conventions?.trim() ? `Конвенции проекта (из портала):\n${project.meta.conventions.slice(0, 6000)}` : "";
    const userList = users.filter((u) => !u.banned && (u.role === "contributor" || u.role === "admin")).map((u) => `${u.login} (${u.fullName})`).join(", ");
    const system = systemPrompt({
      taskId,
      projectName: project.name,
      repo,
      conventions,
      users: userList,
      skillList: skills.map((s) => `- ${s.slug}: ${s.title} [${s.triggers}]`).join("\n"),
      today: new Date().toISOString().slice(0, 10),
    });

    // Первое сообщение модели: сырой запрос + скрины + уже имеющаяся переписка (ответы клиента на вопросы).
    const first: Anthropic.ContentBlockParam[] = [
      { type: "text", text: `Запрос (${task.summary}):\n\n${task.description || "(без текста)"}` },
    ];
    for (const img of images) {
      const mt = img.mime === "image/jpg" ? "image/jpeg" : img.mime;
      if (/^image\/(png|jpeg|gif|webp)$/.test(mt)) first.push({ type: "image", source: { type: "base64", media_type: mt as "image/png", data: img.data } });
    }
    if (comments.length) {
      const dialog = comments.map((c) => `${c.author.role === "client" ? "Клиент" : "Lambertain"}: ${c.text}`).join("\n");
      first.push({ type: "text", text: `Переписка по задаче:\n${dialog}` });
    }
    const work: Anthropic.MessageParam[] = [{ role: "user", content: first }];

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const MAX_STEPS = 32;
    let forced = false;
    for (let step = 0; step < MAX_STEPS; step++) {
      // За пару шагов до лимита — заставляем финализировать спекой (а не упираться в бесполезный фолбэк-вопрос).
      if (step === MAX_STEPS - 3 && !forced) {
        forced = true;
        work.push({ role: "user", content: "Шагов почти не осталось. ПРЯМО СЕЙЧАС вызови write_spec с лучшим текущим пониманием (разумные допущения помечай). Спека обязательна — не задавай вопрос, если без него можно обойтись." });
      }
      const resp = await client.messages.create({ model: MODEL, max_tokens: 3000, system, tools: TOOLS, messages: work });
      inTok += resp.usage.input_tokens;
      outTok += resp.usage.output_tokens;
      work.push({ role: "assistant", content: resp.content });
      const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

      const spec = toolUses.find((b) => b.name === "write_spec");
      if (spec) {
        const inp = spec.input as { title?: string; spec: string; assigneeLogin?: string | null };
        if (inp.title?.trim()) await setTaskTitle(taskId, inp.title.trim());
        await be.addComment(taskId, `🛠 <b>Спецификация Lambertain</b>\n\n${inp.spec}`, "internal");
        const assignee = inp.assigneeLogin || project.meta.defaultAssignee || null;
        if (assignee) {
          await assignTask(taskId, assignee);
          await notifyLogins([assignee], `🆕 <b>Задача готова к работе</b> · ${taskId}: ${inp.title || task.summary}\nLambertain подготовил спецификацию — детали в задаче.`).catch(() => {});
        }
        await setTaskAiStatus(taskId, "done");
        return;
      }

      const ask = toolUses.find((b) => b.name === "ask_client");
      if (ask) {
        const question = String((ask.input as { question?: string }).question || "").trim();
        if (question) {
          await be.addComment(taskId, `🟡 <b>Вопрос:</b> ${question}`, "client");
          await notifyProjectClients(task.projectKey, `🟡 <b>Уточнение по задаче</b> · ${taskId}: ${task.summary}\n${question}\nОтветьте в задаче на портале.`).catch(() => {});
          if (task.reporter?.login) await notifyLogins([task.reporter.login], `🟡 <b>Уточнение по задаче</b> · ${taskId}: ${question}`).catch(() => {});
        }
        await setTaskAiStatus(taskId, "waiting");
        return;
      }

      if (toolUses.length === 0) {
        // Модель «замолчала» свободным текстом — он никуда не идёт. Подталкиваем продолжать.
        work.push({ role: "user", content: "Свободный текст не используется. Продолжай инструментами; когда готов — write_spec, либо ask_client (один вопрос по делу)." });
        continue;
      }
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const out = await runTool(tu.name, tu.input as Record<string, unknown>, repo);
        results.push({ type: "tool_result", tool_use_id: tu.id, content: out });
      }
      work.push({ role: "user", content: results });
    }
    // Не уложился в лимит даже после форса — отдаём админу на ручную проработку (не дёргаем клиента зря).
    await be.addComment(taskId, `🛠 <b>Спецификация Lambertain</b>\n\nНе удалось автоматически подготовить спеку за отведённые шаги (большой/сложный репозиторий). Нужна ручная проработка. Запрос клиента — в описании задачи.`, "internal");
    await notifyAdmin(`⚠️ ИИ-проработка ${taskId} не уложилась в лимит шагов — нужна ручная спека.`).catch(() => {});
    await setTaskAiStatus(taskId, "done");
  } catch (e) {
    await notifyAdmin(`⚠️ Ошибка ИИ-проработки ${taskId}: ${e instanceof Error ? e.message : "—"}`).catch(() => {});
    await setTaskAiStatus(taskId, null).catch(() => {});
  } finally {
    await logUsage(MODEL, "drafter", inTok, outTok).catch(() => {});
  }
}
