/**
 * Структурирование произвольного текста задачи в DraftTask через Claude API.
 * Server-side only. Env: ANTHROPIC_API_KEY, STRUCTURER_MODEL (опц.).
 */
import Anthropic from "@anthropic-ai/sdk";
import type { DraftTask, Project, User } from "./tasks/types";

const MODEL = process.env.STRUCTURER_MODEL || "claude-sonnet-4-6";

const TASK_TOOL: Anthropic.Tool = {
  name: "create_task",
  description: "Структурированная задача для постановки в трекер.",
  input_schema: {
    type: "object",
    properties: {
      projectKey: {
        type: "string",
        description: "key проекта строго из списка доступных.",
      },
      summary: { type: "string", description: "Короткий заголовок (до 80 симв.)." },
      description: {
        type: "string",
        description: "Развёрнутое описание: что сделать, критерии готовности. Markdown.",
      },
      assigneeLogin: {
        type: ["string", "null"],
        description: "login исполнителя из списка или null.",
      },
      priority: {
        type: ["string", "null"],
        description: "Critical/Major/Normal/Minor если явно указан, иначе null.",
      },
      dueDate: {
        type: ["string", "null"],
        description: "Дедлайн YYYY-MM-DD (учесть относительные даты) или null.",
      },
      confidence: {
        type: "string",
        enum: ["high", "low"],
        description: "low если проект или суть неоднозначны.",
      },
    },
    required: ["projectKey", "summary", "description", "confidence"],
  },
};

export async function structureTask(
  text: string,
  projects: Project[],
  users: User[],
  today: string,
): Promise<DraftTask> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const projList = projects.map((p) => `- ${p.key}: ${p.name}`).join("\n");
  const userList = users
    .filter((u) => !u.banned)
    .map((u) => `- ${u.login}: ${u.fullName}${u.role !== "unknown" ? ` (${u.role})` : ""}`)
    .join("\n");

  const system =
    "Ты — ассистент проджект-менеджера. Преобразуй произвольное задание в структуру для трекера.\n" +
    `Сегодня: ${today}.\n\n` +
    `Доступные проекты (projectKey):\n${projList}\n\n` +
    `Возможные исполнители (assigneeLogin):\n${userList}\n\n` +
    "Правила: projectKey строго из списка. assigneeLogin только из списка или null. " +
    "Если проект или суть неоднозначны — confidence=low. Описание делай ясным и проверяемым.";

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system,
    tools: [TASK_TOOL],
    tool_choice: { type: "tool", name: "create_task" },
    messages: [{ role: "user", content: text }],
  });

  for (const block of resp.content) {
    if (block.type === "tool_use" && block.name === "create_task") {
      return block.input as DraftTask;
    }
  }
  throw new Error("Claude не вернул структуру задачи");
}
