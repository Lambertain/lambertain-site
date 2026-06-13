/**
 * Лёгкий ИИ-триаж задачи на портале: НЕ читает репозиторий (экономия токенов).
 * Из сырого запроса (текст + скрины) делает чистый заголовок, нормализованное требование
 * и теги (тип, сложность, скилы). Тяжёлую спеку/реализацию делает Claude разработчика
 * по тегам (подключает скилы, применяет spec-kit адаптивно). Server-side only.
 */
import Anthropic from "@anthropic-ai/sdk";
import { listSkills, logUsage, setTaskAiStatus, setTaskTags, assignTask, setTaskTitle, getTaskImages } from "./db";
import { notifyLogins, notifyProjectClients, notifyAdmin } from "./notify";
import { getBackend } from "./tasks";

const MODEL = process.env.STRUCTURER_MODEL || "claude-opus-4-8";

const TOOLS: Anthropic.Tool[] = [
  {
    name: "ask_client",
    description: "ЕДИНСТВЕННЫЙ способ задать вопрос клиенту/заказчику. Ровно один короткий вопрос ПО СУТИ (бизнес-неоднозначность, которую не вывести из запроса). Только если без ответа нельзя сформулировать требование. Технические детали НЕ спрашивай — их решит разработчик.",
    input_schema: { type: "object", properties: { question: { type: "string" } }, required: ["question"] },
  },
  {
    name: "submit_triage",
    description: "Финал триажа: чистый заголовок, нормализованное требование и теги. В репозиторий НЕ ходим — это делает Claude разработчика.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Короткий чёткий заголовок задачи (до 80 симв.)." },
        requirement: { type: "string", description: "Нормализованное требование в Markdown: ЧТО нужно (с точки зрения пользователя) + критерии приёмки. Без кода и реализации." },
        type: { type: "string", description: "Тип: bug | feature | improvement | content | design | infra | other." },
        complexity: { type: "string", enum: ["small", "feature"], description: "small — баг/правка/мелочь (разработчик делает сразу по скилам). feature — существенная фича/многофайловое/неоднозначное (полная спека по spec-kit)." },
        skills: { type: "array", items: { type: "string" }, description: "slug'и релевантных скилов из списка доступных (разработчик подключит их плейбуки)." },
        assigneeLogin: { type: ["string", "null"], description: "login исполнителя из списка или null (тогда — ответственный по проекту)." },
      },
      required: ["title", "requirement", "type", "complexity", "skills"],
    },
  },
];

function systemPrompt(projectName: string, today: string, users: string, skillList: string): string {
  return (
    "Ты — проджект-менеджер агентства Lambertain. Делаешь БЫСТРЫЙ ТРИАЖ входящего запроса. " +
    `Проект: «${projectName}». Сегодня: ${today}.\n` +
    `Возможные исполнители: ${users || "—"}.\n\n` +
    "Доступные скилы (slug: заголовок [триггеры]) — выбирай релевантные slug'и в теги:\n" + (skillList || "(нет)") + "\n\n" +
    "ВАЖНО: ты НЕ читаешь код и НЕ пишешь техническую спеку — это сделает Claude разработчика (у него полный доступ к репо). " +
    "Твоя задача дешёвая: понять суть запроса и разметить его.\n" +
    "Сделай submit_triage:\n" +
    "• title — чёткий короткий заголовок;\n" +
    "• requirement — что нужно с точки зрения пользователя + критерии приёмки (без кода, без файлов, без реализации);\n" +
    "• type — тип задачи; complexity — small (баг/правка → разработчик делает сразу) или feature (крупное → полная спека);\n" +
    "• skills — slug'и релевантных скилов (например systematic-debugging для бага, security для доступов);\n" +
    "• assigneeLogin — если из запроса ясно, иначе null.\n\n" +
    "ОБЩЕНИЕ — ТОЛЬКО через инструменты, свободный текст отбрасывается. ask_client вызывай ТОЛЬКО при реальной бизнес-неоднозначности " +
    "(не из-за кода). Не зависай: если суть ясна — сразу submit_triage."
  );
}

/**
 * Триаж задачи. Идемпотентно по состоянию: размечает (submit_triage → назначает разработчика)
 * либо задаёт клиенту уточняющий вопрос (ask_client). Вызывается после апрува / при ответе клиента.
 */
export async function draftTask(taskId: string): Promise<void> {
  const be = getBackend();
  let inTok = 0, outTok = 0;
  try {
    const [task, comments, projects, users, images, skills] = await Promise.all([
      be.getTask(taskId),
      be.getComments(taskId),
      be.listProjects(),
      be.listUsers(),
      getTaskImages(taskId),
      listSkills(),
    ]);
    const project = projects.find((p) => p.key === task.projectKey);
    if (!project) return;

    const userList = users.filter((u) => !u.banned && (u.role === "contributor" || u.role === "admin")).map((u) => `${u.login} (${u.fullName})`).join(", ");
    const system = systemPrompt(project.name, new Date().toISOString().slice(0, 10), userList, skills.map((s) => `- ${s.slug}: ${s.title} [${s.triggers}]`).join("\n"));

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
    for (let step = 0; step < 4; step++) {
      const resp = await client.messages.create({ model: MODEL, max_tokens: 2000, system, tools: TOOLS, messages: work });
      inTok += resp.usage.input_tokens;
      outTok += resp.usage.output_tokens;
      work.push({ role: "assistant", content: resp.content });
      const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

      const triage = toolUses.find((b) => b.name === "submit_triage");
      if (triage) {
        const inp = triage.input as { title: string; requirement: string; type: string; complexity: "small" | "feature"; skills?: string[]; assigneeLogin?: string | null };
        const skillSlugs = (inp.skills || []).filter((s) => skills.some((k) => k.slug === s));
        if (inp.title?.trim()) await setTaskTitle(taskId, inp.title.trim());
        await setTaskTags(taskId, { type: inp.type, complexity: inp.complexity, skills: skillSlugs });
        const tagLine = `Тип: ${inp.type} · Сложность: ${inp.complexity === "small" ? "мелкая (без спеки)" : "фича (спека)"}${skillSlugs.length ? ` · Скилы: ${skillSlugs.join(", ")}` : ""}`;
        await be.addComment(taskId, `📋 <b>Триаж Lambertain</b>\n\n${inp.requirement}\n\n— — —\n${tagLine}`, "internal");
        const assignee = inp.assigneeLogin || project.meta.defaultAssignee || null;
        if (assignee) {
          await assignTask(taskId, assignee);
          await notifyLogins([assignee], `🆕 <b>Задача готова</b> · ${taskId}: ${inp.title || task.summary}\n${tagLine}`).catch(() => {});
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
        work.push({ role: "user", content: "Свободный текст не используется. Вызови submit_triage (или ask_client при бизнес-неоднозначности)." });
        continue;
      }
    }
    // Не уложился — назначим разработчика без тегов (он разберётся), чтобы не зависнуть.
    const assignee = project.meta.defaultAssignee || null;
    if (assignee) {
      await assignTask(taskId, assignee);
      await notifyLogins([assignee], `🆕 <b>Задача</b> · ${taskId}: ${task.summary}`).catch(() => {});
    }
    await setTaskAiStatus(taskId, "done");
  } catch (e) {
    await notifyAdmin(`⚠️ Ошибка триажа ${taskId}: ${e instanceof Error ? e.message : "—"}`).catch(() => {});
    await setTaskAiStatus(taskId, null).catch(() => {});
  } finally {
    await logUsage(MODEL, "triage", inTok, outTok).catch(() => {});
  }
}
