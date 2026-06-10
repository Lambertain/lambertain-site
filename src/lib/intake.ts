/**
 * Диалоговый agentic-интейк: Claude уточняет требования, читает репозиторий,
 * сверяет с кодом и предлагает детальные задачи. Server-side only.
 */
import Anthropic from "@anthropic-ai/sdk";
import { listDir, readFile, searchCode } from "./github";

const MODEL = process.env.STRUCTURER_MODEL || "claude-opus-4-8";

export interface ProposedTask {
  summary: string;
  description: string;
  assigneeLogin?: string | null;
  priority?: string | null;
}

export interface IntakeCtx {
  projectKey: string;
  projectName: string;
  repo: string | null; // owner/name или null
  users: Array<{ login: string; fullName: string; role: string }>;
  today: string;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_dir",
    description: "Список файлов/папок в директории репозитория проекта.",
    input_schema: { type: "object", properties: { path: { type: "string", description: "путь от корня, '' для корня" } }, required: ["path"] },
  },
  {
    name: "read_file",
    description: "Прочитать файл репозитория проекта.",
    input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  {
    name: "search_code",
    description: "Поиск по коду репозитория проекта.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "propose_tasks",
    description: "Когда требования ясны — предложить одну или несколько задач с детальным описанием.",
    input_schema: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              summary: { type: "string" },
              description: { type: "string", description: "Детально: что сделать, критерии готовности, что в коде уже есть и чего не хватает." },
              assigneeLogin: { type: ["string", "null"] },
              priority: { type: ["string", "null"] },
            },
            required: ["summary", "description"],
          },
        },
      },
      required: ["tasks"],
    },
  },
];

function systemPrompt(ctx: IntakeCtx): string {
  const users = ctx.users.filter((u) => u.role !== "client").map((u) => `${u.login} (${u.fullName})`).join(", ");
  return (
    "Ты — старший проджект-менеджер и инженер агентства Lambertain. Ведёшь приём требований по задаче в режиме диалога.\n" +
    `Проект: ${ctx.projectKey} — ${ctx.projectName}. Сегодня: ${ctx.today}.\n` +
    (ctx.repo
      ? `Репозиторий: ${ctx.repo}. Используй инструменты list_dir/read_file/search_code, чтобы СВЕРИТЬ с кодом: что уже реализовано и чего конкретно не хватает.\n`
      : "Репозиторий не привязан — работай по тексту и скриншотам.\n") +
    `Возможные исполнители: ${users || "—"}.\n\n` +
    "Правила:\n" +
    "- Задавай уточняющие вопросы ПО ОДНОМУ за сообщение, кратко. Проси скриншоты/материалы, если нужно.\n" +
    "- Перед предложением задачи сверься с репозиторием (если привязан): найди затронутые файлы, оцени что есть и чего не хватает.\n" +
    "- Когда требований достаточно — вызови propose_tasks. Можно несколько задач. В описании укажи: суть, критерии готовности, и отдельно «Чего не хватает в коде».\n" +
    "- Не выдумывай факты о коде — проверяй инструментами."
  );
}

async function runTool(name: string, input: Record<string, unknown>, ctx: IntakeCtx): Promise<string> {
  if (!ctx.repo) return "Репозиторий не привязан к проекту.";
  if (name === "list_dir") return listDir(ctx.repo, String(input.path || ""));
  if (name === "read_file") return readFile(ctx.repo, String(input.path || ""));
  if (name === "search_code") return searchCode(ctx.repo, String(input.query || ""));
  return "неизвестный инструмент";
}

export interface IntakeResult {
  messages: Anthropic.MessageParam[];
  reply?: string;
  proposed?: ProposedTask[];
}

/** Один ход диалога: выполняет репо-инструменты, возвращает либо текст-вопрос, либо предложенные задачи. */
export async function runIntake(history: Anthropic.MessageParam[], ctx: IntakeCtx): Promise<IntakeResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const messages = [...history];

  for (let step = 0; step < 8; step++) {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: systemPrompt(ctx),
      tools: TOOLS,
      messages,
    });
    messages.push({ role: "assistant", content: resp.content });

    const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const proposeBlock = toolUses.find((b) => b.name === "propose_tasks");
    if (proposeBlock) {
      const tasks = (proposeBlock.input as { tasks: ProposedTask[] }).tasks || [];
      return { messages, proposed: tasks };
    }

    if (toolUses.length === 0) {
      const text = resp.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text).join("\n");
      return { messages, reply: text };
    }

    // Выполнить репо-инструменты и продолжить цикл.
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const out = await runTool(tu.name, tu.input as Record<string, unknown>, ctx);
      results.push({ type: "tool_result", tool_use_id: tu.id, content: out });
    }
    messages.push({ role: "user", content: results });
  }
  return { messages, reply: "Не удалось завершить за отведённое число шагов. Уточни запрос." };
}
