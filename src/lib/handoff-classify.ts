/**
 * Классификатор ops-эскалации разработчика (handoff): кто должен сделать шаг —
 * сам разработчик (self), КЛИЕНТ (client: зарегистрировать сервис / дать доступ к своему аккаунту),
 * или ВЛАДЕЛЕЦ агентства (owner: наш хостинг/деплой/биллинг/сторы/наши токены).
 * Заодно подбирает подходящий гайд из библиотеки. Server-side only (Anthropic).
 */
import Anthropic from "@anthropic-ai/sdk";
import { randomBytes } from "node:crypto";
import { listGuides, logUsage, createGuide } from "./db";

const MODEL = process.env.STRUCTURER_MODEL || "claude-opus-4-8";

export interface HandoffClassification {
  kind: "self" | "client" | "owner";
  reason: string;
  clientShort?: string;   // короткое для пуша: «зареєструвати бота в @BotFather»
  clientText?: string;    // полный понятный клиенту текст: что и зачем зарегистрировать
  ownerText?: string;     // что нужно сделать владельцу
  guideId?: number | null; // id подходящего гайда из библиотеки (или null)
}

const TOOL: Anthropic.Tool = {
  name: "submit",
  description: "Классификация ops-шага.",
  input_schema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["self", "client", "owner"] },
      reason: { type: "string", description: "Кратко почему этот адресат." },
      client_short: { type: "string", description: "Если client: короткая суть для пуша, напр. «зареєструвати Telegram-бота в @BotFather»." },
      client_text: { type: "string", description: "Если client: понятный клиенту текст — ЧТО зарегистрировать/дать и зачем (без тех-жаргона), на украинском." },
      owner_text: { type: "string", description: "Если owner: что нужно сделать владельцу агентства." },
      guide_id: { type: ["integer", "null"], description: "id подходящего гайда из списка (как это зарегистрировать) или null." },
    },
    required: ["kind", "reason"],
  },
};

export async function classifyHandoff(action: string, opts: { summary?: string; projectSpec?: string }): Promise<HandoffClassification> {
  const guides = await listGuides();
  const guideList = guides.map((g) => `#${g.id}: ${g.title}`).join("\n") || "(пусто)";
  const sys =
    "Ты — диспетчер агентства. Разработчик уперся в ручной ops-шаг и описал его. Определи, КТО должен это сделать:\n" +
    "• self — разработчик может сделать сам в коде/конфиге (НЕ нужен внешний аккаунт, регистрация или чужие данные).\n" +
    "• client — нужно действие на стороне КЛИЕНТА: зарегистрировать его сервис (Telegram-бот, Google Analytics, домен, платёжка), " +
    "создать аккаунт от его имени, дать доступ к ЕГО аккаунтам, прислать его токен/ключ.\n" +
    "• owner — инфра АГЕНТСТВА: наш хостинг/деплой (Railway), наш биллинг, публикация в сторы, наши общие токены/ключи.\n" +
    "Если client — сформулируй для клиента понятный текст (что и зачем, без жаргона, на украинском) и короткую суть для пуша. " +
    "Подбери guide_id из списка гайдов, если подходящий есть (как это зарегистрировать), иначе null.\n\n" +
    `Доступные гайды:\n${guideList}`;
  const user = `Шаг от разработчика: ${action}\n${opts.summary ? `Задача: ${opts.summary}\n` : ""}${opts.projectSpec ? `Контекст проекта (фрагмент): ${opts.projectSpec.slice(0, 1500)}` : ""}`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const r = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: sys,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "submit" },
    messages: [{ role: "user", content: user }],
  });
  await logUsage(MODEL, "handoff-classify", r.usage.input_tokens, r.usage.output_tokens).catch(() => {});
  const tu = r.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const inp = (tu?.input ?? {}) as Record<string, unknown>;
  const kind = (["self", "client", "owner"].includes(String(inp.kind)) ? inp.kind : "owner") as HandoffClassification["kind"];
  const gid = typeof inp.guide_id === "number" ? inp.guide_id : null;
  return {
    kind,
    reason: String(inp.reason || ""),
    clientShort: inp.client_short ? String(inp.client_short) : undefined,
    clientText: inp.client_text ? String(inp.client_text) : undefined,
    ownerText: inp.owner_text ? String(inp.owner_text) : undefined,
    guideId: gid && guides.some((g) => g.id === gid) ? gid : null,
  };
}

const GUIDE_TOOL: Anthropic.Tool = {
  name: "guide",
  description: "Готовый гайд-инструкция в 3 локалях.",
  input_schema: {
    type: "object",
    properties: {
      title_uk: { type: "string" }, body_uk: { type: "string" },
      title_ru: { type: "string" }, body_ru: { type: "string" },
      title_en: { type: "string" }, body_en: { type: "string" },
    },
    required: ["title_uk", "body_uk", "title_ru", "body_ru", "title_en", "body_en"],
  },
};

/**
 * Сгенерировать гайд-инструкцию «как зарегистрировать X» на понятном клиенту языке в 3 локалях (uk/ru/en),
 * сохранить в библиотеку гайдов и вернуть его id. Используется, когда подходящего гайда нет.
 */
export async function generateGuide(topic: string): Promise<number | null> {
  const sys =
    "Ты пишешь инструкцию для НЕтехнического клиента: как самостоятельно зарегистрировать/настроить сервис и где взять данные (токен/ключ/логин). " +
    "Подробно, по шагам, простым языком, markdown (заголовки, нумерованные шаги). Без жаргона. " +
    "Дай ОДИН и тот же гайд в трёх локалях: украинской (uk), русской (ru), английской (en). Заголовок — короткий и понятный.";
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const r = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: sys,
    tools: [GUIDE_TOOL],
    tool_choice: { type: "tool", name: "guide" },
    messages: [{ role: "user", content: `Тема інструкції: ${topic}` }],
  });
  await logUsage(MODEL, "generate-guide", r.usage.input_tokens, r.usage.output_tokens).catch(() => {});
  const tu = r.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const g = (tu?.input ?? {}) as Record<string, string>;
  if (!g.title_uk || !g.body_uk) return null;
  const slug = (g.title_uk.toLowerCase().replace(/[^a-z0-9а-яіїєґ]+/gi, "-").replace(/^-|-$/g, "").slice(0, 32) || "guide") + "-" + randomBytes(3).toString("hex");
  const res = await createGuide(slug, g.title_uk, g.body_uk, 100, { title_ru: g.title_ru, body_ru: g.body_ru, title_en: g.title_en, body_en: g.body_en });
  return res.id ?? null;
}
