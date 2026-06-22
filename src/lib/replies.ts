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
    "Не предлагай клиенту созвон/звонок/встречу. " +
    "Если нужно уточнение по срокам/реализации — формулируй как решение, а не как вопрос.\n" +
    "ЯЗЫК: украинский по умолчанию (основной язык портала). Перейди на русский/английский ТОЛЬКО если КЛИЕНТ в переписке обращается на этом языке — тогда отвечай на языке клиента (ориентируйся на язык сообщений клиента, не команды).";

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
 * Оформить сырой вопрос разработчика (или его Claude) в вежливый вопрос КЛИЕНТУ от лица агентства.
 * Без техжаргона, на «Вы», конкретно — чтобы клиент мог однозначно ответить.
 */
export async function draftClientQuestion(task: Task, devQuestion: string, history: Comment[]): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const hist = history.slice(-6).map((c) => `${c.author.fullName} (${c.author.role}): ${c.text}`).join("\n");
  const system =
    "Ты — проджект-менеджер агентства Lambertain. Переформулируй технический вопрос (от разработки) в понятный вопрос КЛИЕНТУ " +
    "от имени агентства. На «Вы», без технического жаргона, конкретно — чтобы клиент мог однозначно ответить (если уместно — с вариантами на выбор простыми словами). " +
    "Не упоминай разработчика/исполнителя. Не предлагай созвон. Без подписи. Пиши только текст вопроса.\n" +
    "ЯЗЫК: украинский по умолчанию (основной язык портала) — даже если технический вопрос разработчика на русском. Перейди на русский/английский ТОЛЬКО если КЛИЕНТ в переписке обращается на этом языке (ориентируйся на язык сообщений клиента, не разработчика).";
  const prompt =
    `Задача ${task.id}: ${task.summary}\n` +
    `Описание: ${task.description?.slice(0, 2000) || "—"}\n\n` +
    (hist ? `Переписка:\n${hist}\n\n` : "") +
    `Технический вопрос, который надо задать клиенту по-человечески:\n${devQuestion}\n\n` +
    `Напиши только текст вопроса клиенту.`;
  const resp = await client.messages.create({ model: MODEL, max_tokens: 600, system, messages: [{ role: "user", content: prompt }] });
  const block = resp.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text.trim() : devQuestion;
}

/**
 * Полировка любого сообщения команды → КЛИЕНТУ в голос агентства (для модерации).
 * Меняет ТОЛЬКО тон/форму; факты, числа, ссылки, маркеры файлов и список вопросов сохраняет дословно.
 */
export async function draftClientMessage(task: Task, raw: string, history: Comment[]): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const hist = history.slice(-6).map((c) => `${c.author.fullName} (${c.author.role}): ${c.text}`).join("\n");
  const system =
    "Ты — проджект-менеджер агентства Lambertain. Перепиши сообщение команды для КЛИЕНТА от имени агентства. " +
    "Меняй ТОЛЬКО тон и форму: вежливо, формально на «Вы», от первого лица единственного числа в мужском роде, без технического жаргона и внутренней кухни, " +
    "без приветствий-фамильярностей и без подписи. НЕ упоминай разработчика/исполнителя, не предлагай созвон. " +
    "СОХРАНИ дословно: все факты, числа, проценты, названия, ссылки и маркеры файлов (вида /api/files/...), markdown. " +
    "Если это вопросы — оставь их вопросами (понятными, при необходимости с вариантами простыми словами). " +
    "ЯЗЫК: украинский по умолчанию (основной язык портала), даже если исходное сообщение команды на русском. Переведи на русский/английский ТОЛЬКО если КЛИЕНТ в переписке обращается на этом языке (ориентируйся на язык клиента, не команды). Верни ТОЛЬКО готовый текст.";
  const prompt =
    `Задача ${task.id}: ${task.summary}\n` +
    (hist ? `Переписка:\n${hist}\n\n` : "") +
    `Сообщение команды (перепиши его для клиента):\n${raw}\n\n` +
    `Верни только готовый текст.`;
  const resp = await client.messages.create({ model: MODEL, max_tokens: 1000, system, messages: [{ role: "user", content: prompt }] });
  const block = resp.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text.trim() : raw;
}

/**
 * Черновик ответа клиенту: ИИ читает задачу, переписку и код и сам предлагает ответ
 * на последний вопрос/комментарий клиента — от имени агентства Lambertain (не от лица разработчика).
 * `instructions` — правки разработчика («убери X», «добавь про сроки»); `priorDraft` — текущая версия
 * (перерабатываем по правкам). Возвращает текст для утверждения — не публикует.
 */
export async function draftClientAnswer(
  task: Task,
  clientQuestion: string,
  history: Comment[],
  code?: string | null,
  instructions?: string,
  priorDraft?: string,
): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const hist = history.slice(-10).map((c) => `${c.author.fullName} (${c.author.role}): ${c.text}`).join("\n");

  const system =
    "Ты — проджект-менеджер агентства Lambertain. Составь ответ клиенту на его последний вопрос/комментарий по задаче — " +
    "ОТ ИМЕНИ агентства (не от лица разработчика). Опирайся на задачу, переписку и код: пойми суть вопроса и дай по делу. " +
    "Тон: вежливо, на «Вы», без технического жаргона и без внутренней кухни. НЕ упоминай конкретного исполнителя — " +
    "для клиента это работа агентства. Если из контекста ответа точно не видно (напр. сроки) — сформулируй аккуратно, " +
    "не выдумывая фактов. НЕ предлагай клиенту созвон/звонок/встречу. Без подписи. Пиши только текст ответа.\n" +
    "ЯЗЫК: украинский по умолчанию (основной язык портала). Перейди на русский/английский ТОЛЬКО если КЛИЕНТ в переписке обращается на этом языке — тогда отвечай на языке клиента (ориентируйся на язык сообщений клиента, не команды).";

  const prompt =
    `Задача ${task.id}: ${task.summary}\n` +
    `Описание: ${task.description || "—"}\n\n` +
    `Переписка:\n${hist || "—"}\n\n` +
    (clientQuestion ? `Последний вопрос/комментарий клиента (на него отвечаем):\n${clientQuestion}\n\n` : "") +
    (code ? `Код по задаче (для сверки фактов):\n${code.slice(0, 8000)}\n\n` : "") +
    (priorDraft ? `Текущая версия ответа — переработай её по указаниям ниже, сохранив верное:\n${priorDraft}\n\n` : "") +
    (instructions ? `Указания разработчика по ответу:\n${instructions}\n\n` : "") +
    `Напиши только текст ответа клиенту.`;

  const resp = await client.messages.create({ model: MODEL, max_tokens: 800, system, messages: [{ role: "user", content: prompt }] });
  const block = resp.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text.trim() : "";
}
