/**
 * Старт проекта: декомпозиция полной спеки/роадмэпа в ПОСЛЕДОВАТЕЛЬНОСТЬ связанных задач
 * для одного разработчика (с зависимостями + тегами). Портал в репо НЕ ходит — спеку даёт
 * админ, теги/порядок проставляет ИИ, разработчик делает по порядку (его spec-kit обрабатывает
 * каждую задачу). Server-side only.
 */
import Anthropic from "@anthropic-ai/sdk";
import { listSkills, logUsage } from "./db";

const MODEL = process.env.STRUCTURER_MODEL || "claude-opus-4-8";

export interface KickoffTask {
  summary: string;
  description: string;
  /** Индексы (0-based) задач из этого списка, которые надо сделать ДО этой (блокеры). */
  dependsOn?: number[];
  type?: string;
  complexity?: "small" | "feature";
  skills?: string[];
}

const TOOL: Anthropic.Tool = {
  name: "propose_tasks",
  description: "Разбить спеку проекта на последовательность связанных задач для одного разработчика.",
  input_schema: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Короткий чёткий заголовок." },
            description: { type: "string", description: "Что сделать + критерии приёмки (по спеке), Markdown. Без воды и без кода." },
            dependsOn: { type: "array", items: { type: "integer" }, description: "Индексы (0-based) задач из этого списка, которые надо сделать ДО этой (правильный порядок)." },
            type: { type: "string", description: "bug | feature | improvement | infra | content | design | other" },
            complexity: { type: "string", enum: ["small", "feature"], description: "small — мелочь/правка; feature — существенное (спека)." },
            skills: { type: "array", items: { type: "string" }, description: "slug'и релевантных скилов из списка." },
          },
          required: ["summary", "description"],
        },
      },
    },
    required: ["tasks"],
  },
};

/** Разбить спеку проекта на задачи (без создания). */
export async function decomposeSpec(spec: string, projectName: string): Promise<KickoffTask[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const skills = await listSkills();
  const skillList = skills.map((s) => `- ${s.slug}: ${s.title} [${s.triggers}]`).join("\n");
  const system =
    `Ты — старший проджект-менеджер агентства Lambertain. Тебе дают ПОЛНУЮ спеку/роадмэп нового проекта «${projectName}». ` +
    "Разбей её на ПОСЛЕДОВАТЕЛЬНОСТЬ реализуемых задач для ОДНОГО разработчика.\n" +
    "Правила:\n" +
    "- Каждая задача: чёткий summary; description (что сделать + критерии приёмки строго по спеке; без воды, без кода, без выдумок).\n" +
    "- Логичный порядок: инфраструктура/каркас → модель данных → бэкенд → фронт → фичи → полировка. Проставь dependsOn (индексы предшественников), чтобы разработчик делал в правильной последовательности (блокеры).\n" +
    "- Теги: type; complexity (small — мелочь/правка, feature — существенное); skills (slug'и из списка ниже).\n" +
    "- Не дроби слишком мелко и не делай слишком крупно — разумные куски, которые разработчик возьмёт за раз.\n" +
    "- В репозиторий НЕ ходишь — код пишет Claude разработчика по каждой задаче.\n\n" +
    "Доступные скилы:\n" + (skillList || "(нет)");

  let inTok = 0, outTok = 0;
  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "propose_tasks" },
      messages: [{ role: "user", content: spec.slice(0, 60000) }],
    });
    inTok += resp.usage.input_tokens;
    outTok += resp.usage.output_tokens;
    for (const block of resp.content) {
      if (block.type === "tool_use" && block.name === "propose_tasks") {
        return ((block.input as { tasks?: KickoffTask[] }).tasks || []).filter((t) => t.summary?.trim());
      }
    }
    throw new Error("ИИ не вернул задачи");
  } finally {
    await logUsage(MODEL, "kickoff", inTok, outTok).catch(() => {});
  }
}
