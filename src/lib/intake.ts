/**
 * Диалоговый agentic-интейк: Claude читает конвенции репо, подбирает/создаёт скил
 * под тип задачи, сверяет с кодом и предлагает детальные задачи. Server-side only.
 */
import Anthropic from "@anthropic-ai/sdk";
import { listDir, readFile, searchCode } from "./github";
import { listSkills, getSkill, createSkill, logUsage } from "./db";
import { notifyAdmin } from "./notify";

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
  repo: string | null;
  /** Конвенции из портала (БД) — приоритетнее CLAUDE.md из репо. */
  conventions?: string;
  users: Array<{ login: string; fullName: string; role: string }>;
  today: string;
}

const TOOLS: Anthropic.Tool[] = [
  { name: "list_dir", description: "Список файлов/папок в директории репозитория.", input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "read_file", description: "Прочитать файл репозитория.", input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "search_code", description: "Поиск по коду репозитория.", input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
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
    name: "propose_tasks",
    description: "Когда требования ясны — предложить задачи с детальным описанием.",
    input_schema: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              summary: { type: "string" },
              description: { type: "string", description: "Детально: что сделать, критерии готовности, что в коде есть и чего не хватает." },
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

async function readConventions(repo: string): Promise<string> {
  for (const f of ["CLAUDE.md", "AGENTS.md", "README.md"]) {
    const c = await readFile(repo, f);
    if (!c.startsWith("Ошибка")) return `Конвенции проекта (${f}):\n${c.slice(0, 4000)}`;
  }
  return "";
}

function systemPrompt(ctx: IntakeCtx, skills: { slug: string; title: string; triggers: string }[], conventions: string): string {
  const users = ctx.users.filter((u) => u.role !== "client").map((u) => `${u.login} (${u.fullName})`).join(", ");
  const skillList = skills.map((s) => `- ${s.slug}: ${s.title} [${s.triggers}]`).join("\n");
  return (
    "Ты — старший проджект-менеджер и инженер агентства Lambertain. Ведёшь приём требований в режиме диалога.\n" +
    `Проект: ${ctx.projectKey} — ${ctx.projectName}. Сегодня: ${ctx.today}.\n` +
    (ctx.repo ? `Репозиторий: ${ctx.repo}. Сверяйся с кодом инструментами.\n` : "Репозиторий не привязан — работай по тексту и скриншотам.\n") +
    `Исполнители: ${users || "—"}.\n\n` +
    (conventions ? conventions + "\n\n" : "") +
    "Доступные скилы (плейбуки под тип задачи):\n" + (skillList || "(нет)") + "\n\n" +
    "Алгоритм:\n" +
    "1) Определи тип задачи и вызови use_skill с подходящим slug. Если подходящего НЕТ — создай его через create_skill (качественный чек-лист) и следуй ему.\n" +
    "2) Задавай уточняющие вопросы ПО ОДНОМУ, кратко. Проси скрины при необходимости.\n" +
    "3) Сверься с репозиторием (если привязан): найди затронутые файлы, оцени что есть и чего не хватает.\n" +
    "4) Следуй конвенциям проекта.\n" +
    "5) Когда ясно — propose_tasks (одна/несколько) с описанием: суть, критерии готовности, «Чего не хватает в коде»."
  );
}

async function runTool(name: string, input: Record<string, unknown>, ctx: IntakeCtx): Promise<string> {
  if (name === "use_skill") {
    const s = await getSkill(String(input.slug || ""));
    return s ? s.playbook : "Скил не найден — создай через create_skill.";
  }
  if (name === "create_skill") {
    const slug = String(input.slug || "").trim();
    await createSkill(slug, String(input.title || slug), String(input.triggers || ""), String(input.playbook || ""), true);
    await notifyAdmin(`🧩 <b>Добавлен новый скил</b>: ${input.title || slug}\nПроект: ${ctx.projectKey}`);
    return `Скил ${slug} создан. Следуй его плейбуку:\n${input.playbook}`;
  }
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

export async function runIntake(history: Anthropic.MessageParam[], ctx: IntakeCtx): Promise<IntakeResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const skills = await listSkills();
  // Конвенции из портала (БД) приоритетнее; иначе CLAUDE.md/README из репо.
  const conventions = ctx.conventions?.trim()
    ? `Конвенции проекта (из портала):\n${ctx.conventions.slice(0, 6000)}`
    : ctx.repo
      ? await readConventions(ctx.repo)
      : "";
  const system = systemPrompt(ctx, skills, conventions);
  const messages = [...history];
  let inTok = 0, outTok = 0;

  try {
    for (let step = 0; step < 10; step++) {
      const resp = await client.messages.create({ model: MODEL, max_tokens: 2500, system, tools: TOOLS, messages });
      inTok += resp.usage.input_tokens;
      outTok += resp.usage.output_tokens;
      messages.push({ role: "assistant", content: resp.content });

      const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const propose = toolUses.find((b) => b.name === "propose_tasks");
      if (propose) {
        return { messages, proposed: (propose.input as { tasks: ProposedTask[] }).tasks || [] };
      }
      if (toolUses.length === 0) {
        const text = resp.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text).join("\n");
        return { messages, reply: text };
      }
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const out = await runTool(tu.name, tu.input as Record<string, unknown>, ctx);
        results.push({ type: "tool_result", tool_use_id: tu.id, content: out });
      }
      messages.push({ role: "user", content: results });
    }
    return { messages, reply: "Превышено число шагов. Уточни запрос." };
  } finally {
    await logUsage(MODEL, "intake", inTok, outTok);
  }
}
