/**
 * Черновик ответа клиенту через Claude API.
 * Тон: формально на «Вы», без воды, по сути вопроса. Server-side only.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Task, Comment } from "./tasks/types";

const MODEL = process.env.STRUCTURER_MODEL || "claude-opus-4-8";

export async function draftClientReply(
  task: Task,
  question: string,
  history: Comment[],
): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const hist = history
    .slice(-8)
    .map((c) => `${c.author.fullName} (${c.author.role}): ${c.text}`)
    .join("\n");

  const system =
    "Ты — проджект-менеджер агентства Lambertain. Составь ответ клиенту на его вопрос в задаче.\n" +
    "Тон: вежливо и формально, обращение на «Вы», по сути, без воды и без подписи. " +
    "Не задавай встречных вопросов без необходимости — ты принимаешь решения сам. " +
    "Если нужно уточнение по срокам/реализации — формулируй как решение, а не как вопрос.";

  const prompt =
    `Задача ${task.id}: ${task.summary}\n` +
    `Описание: ${task.description || "—"}\n\n` +
    `Переписка:\n${hist || "—"}\n\n` +
    `Вопрос клиента, на который нужно ответить:\n${question}\n\n` +
    `Напиши только текст ответа.`;

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    system,
    messages: [{ role: "user", content: prompt }],
  });

  const block = resp.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text.trim() : "";
}

/**
 * Черновик ответа клиенту НА ОСНОВЕ фидбека разработчика.
 * Разработчик даёт фактуру своими словами; ИИ сверяет с задачей и кодом и формулирует
 * ответ от имени агентства Lambertain (не от лица разработчика, не его словами).
 * Возвращает текст для утверждения разработчиком — не публикует.
 */
export async function draftReplyFromDevFeedback(
  task: Task,
  clientQuestion: string,
  devFeedback: string,
  history: Comment[],
  code?: string | null,
): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const hist = history.slice(-8).map((c) => `${c.author.fullName} (${c.author.role}): ${c.text}`).join("\n");

  const system =
    "Ты — проджект-менеджер агентства Lambertain. Пишешь ответ клиенту ОТ ИМЕНИ агентства (не от лица разработчика).\n" +
    "Разработчик дал тебе фактуру (что сделано / что передать) своими словами. Сверь её с задачей и кодом, " +
    "сформулируй вежливый ответ клиенту: на «Вы», по сути, без технического жаргона и без внутренней кухни. " +
    "НЕ упоминай, что отвечал конкретный исполнитель — для клиента это работа агентства. " +
    "Не выдавай детали реализации, если клиенту это не нужно. Без подписи. Пиши только текст ответа.";

  const prompt =
    `Задача ${task.id}: ${task.summary}\n` +
    `Описание: ${task.description || "—"}\n\n` +
    `Переписка:\n${hist || "—"}\n\n` +
    (clientQuestion ? `Вопрос/комментарий клиента:\n${clientQuestion}\n\n` : "") +
    (code ? `Код по задаче (для сверки фактов):\n${code.slice(0, 8000)}\n\n` : "") +
    `Фактура от разработчика (своими словами, её нужно превратить в ответ клиенту):\n${devFeedback}\n\n` +
    `Напиши только текст ответа клиенту.`;

  const resp = await client.messages.create({ model: MODEL, max_tokens: 800, system, messages: [{ role: "user", content: prompt }] });
  const block = resp.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text.trim() : "";
}
