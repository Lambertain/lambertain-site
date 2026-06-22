/**
 * Классификатор ops-эскалации разработчика (handoff): кто должен сделать шаг —
 * сам разработчик (self), КЛИЕНТ (client: зарегистрировать сервис / дать доступ к своему аккаунту),
 * или ВЛАДЕЛЕЦ агентства (owner: наш хостинг/деплой/биллинг/сторы/наши токены).
 * Заодно подбирает подходящий гайд из библиотеки. Server-side only (Anthropic).
 */
import Anthropic from "@anthropic-ai/sdk";
import { randomBytes } from "node:crypto";
import { listGuides, logUsage, createGuide } from "./db";
import { PROJECT_FIELD_DEFS } from "./project-fields";

const MODEL = process.env.STRUCTURER_MODEL || "claude-opus-4-8";

// Каталог известных полей-кредов для матчинга (fieldKey.subKey → подпись).
const FIELD_CATALOG = PROJECT_FIELD_DEFS.flatMap((f) => f.subs.map((s) => `${f.key}.${s.key}: ${f.label.uk} · ${s.label.uk}`)).join("\n");

export interface HandoffClassification {
  kind: "self" | "client" | "owner";
  reason: string;
  clientShort?: string;   // короткое для пуша: «зареєструвати бота в @BotFather»
  clientText?: string;    // полный понятный клиенту текст: что и зачем зарегистрировать
  ownerText?: string;     // что нужно сделать владельцу
  guideId?: number | null; // id подходящего гайда из библиотеки (или null)
  fieldKey?: string | null; // совпавшее поле каталога "fieldKey.subKey" (напр. "aiKeys.anthropic") или null
  recurringCost?: boolean;  // true — клиенту нужно ОПЛАТИТЬ платный/подписочный сервис (нужен апрув стоимости)
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
      field_key: { type: ["string", "null"], description: "Если шаг — про токен/ключ/доступ, совпадающий с полем КАТАЛОГА полей (см. список), верни его ключ в формате \"fieldKey.subKey\" (напр. \"aiKeys.anthropic\"). Если подходящего поля в каталоге нет — null." },
      recurring_cost: { type: "boolean", description: "true, если клиенту нужно ОПЛАТИТЬ платный/подписочный сервис (Anthropic/OpenAI API, платный тариф тощо) — тогда нужен апрув стоимости. false — если это бесплатная регистрация/выдача существующего доступа." },
    },
    required: ["kind", "reason"],
  },
};

export async function classifyHandoff(action: string, opts: { summary?: string; projectSpec?: string; hasClient?: boolean }): Promise<HandoffClassification> {
  const guides = await listGuides();
  const guideList = guides.map((g) => `#${g.id}: ${g.title}`).join("\n") || "(пусто)";
  // Главный фактор: есть ли у проекта клиент. Без клиента некому регистрировать на стороне клиента → это owner.
  const clientRule = opts.hasClient
    ? "У ЭТОГО проекта ЕСТЬ клиент. Регистрация ЕГО сервисов/аккаунтов (Telegram-бот, аналитика, домен, платёжка), доступ к ЕГО данным, ЕГО токены/ключи → kind=client, НЕ owner. " +
      "owner оставляй ТОЛЬКО для инфры самого агентства (наш хостинг/деплой Railway, наш биллинг, публикация в сторы, общие токены агентства). Если шаг про регистрацию/доступ/токен для функционала проекта — это почти всегда client."
    : "У ЭТОГО проекта НЕТ клиента (личный/внутренний проект агентства). Регистрировать на стороне клиента НЕКОМУ — такие шаги делает владелец сам → kind=owner. kind=client НЕ используй.";
  const sys =
    "Ты — диспетчер агентства. Разработчик уперся в ручной ops-шаг и описал его. Определи, КТО должен это сделать:\n" +
    "• self — разработчик может сделать сам в коде/конфиге (НЕ нужен внешний аккаунт, регистрация или чужие данные).\n" +
    "• client — нужно действие на стороне КЛИЕНТА: зарегистрировать его сервис (Telegram-бот, Google Analytics, домен, платёжка), " +
    "создать аккаунт от его имени, дать доступ к ЕГО аккаунтам, прислать его токен/ключ.\n" +
    "• owner — инфра АГЕНТСТВА: наш хостинг/деплой (Railway), наш биллинг, публикация в сторы, наши общие токены/ключи.\n" +
    `ВАЖНО: ${clientRule}\n` +
    "Если client — сформулируй для клиента понятный текст (что и зачем, без жаргона, на украинском) и короткую суть для пуша. " +
    "Подбери guide_id из списка гайдов, если подходящий есть (как это зарегистрировать), иначе null.\n" +
    "Если шаг — про ТОКЕН/КЛЮЧ/ДОСТУП (client или owner), сопоставь с КАТАЛОГОМ полей ниже и верни field_key=\"fieldKey.subKey\" (иначе null). " +
    "Поставь recurring_cost=true, если клиенту нужно ОПЛАТИТЬ платный/подписочный сервис (напр. Anthropic/OpenAI API-ключ, платный тариф), иначе false.\n\n" +
    `Каталог полей (fieldKey.subKey: підпис):\n${FIELD_CATALOG}\n\n` +
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
  let kind = (["self", "client", "owner"].includes(String(inp.kind)) ? inp.kind : opts.hasClient ? "client" : "owner") as HandoffClassification["kind"];
  // Нет клиента → регистрировать на стороне клиента некому: client коерсим в owner. Есть клиент → owner-регистрацию НЕ трогаем (только инфра агентства — owner, это решает модель).
  if (!opts.hasClient && kind === "client") kind = "owner";
  const gid = typeof inp.guide_id === "number" ? inp.guide_id : null;
  // Валидируем field_key против каталога (только реально существующее поле.подполе).
  const fkRaw = inp.field_key ? String(inp.field_key) : "";
  const [fk, sk] = fkRaw.split(".");
  const fieldValid = !!fk && !!sk && PROJECT_FIELD_DEFS.some((f) => f.key === fk && f.subs.some((s) => s.key === sk));
  return {
    kind,
    reason: String(inp.reason || ""),
    clientShort: inp.client_short ? String(inp.client_short) : undefined,
    clientText: inp.client_text ? String(inp.client_text) : undefined,
    ownerText: inp.owner_text ? String(inp.owner_text) : undefined,
    guideId: gid && guides.some((g) => g.id === gid) ? gid : null,
    fieldKey: fieldValid ? fkRaw : null,
    recurringCost: inp.recurring_cost === true,
  };
}

const CLIENT_STEP_TOOL: Anthropic.Tool = {
  name: "client_step",
  description: "Сформулировать шаг для клиента (что зарегистрировать/дать) простым языком.",
  input_schema: {
    type: "object",
    properties: {
      short: { type: "string", description: "Короткая суть для пуша (укр.), напр. «зареєструвати Telegram-бота в @BotFather і надіслати токен»." },
      text: { type: "string", description: "Понятный клиенту текст (укр., без жаргона): ЧТО зарегистрировать/дать и зачем. Только то, что делает КЛИЕНТ." },
      guide_id: { type: ["integer", "null"], description: "id подходящего гайда из списка или null." },
    },
    required: ["short", "text"],
  },
};

/**
 * Ручная переброска ops-шага на клиента: из технического описания (например, owner-шага, который завели,
 * когда клиента ещё не было) выделяет ИМЕННО клиентскую часть (зарегистрировать сервис/дать доступ/прислать токен)
 * и формулирует простым языком + подбирает гайд. Инфра-подпункты агентства (env/cron/деплой) отбрасывает.
 */
export async function clientStepFromAction(action: string, opts: { summary?: string; projectSpec?: string }): Promise<{ short: string; text: string; guideId: number | null }> {
  const guides = await listGuides();
  const guideList = guides.map((g) => `#${g.id}: ${g.title}`).join("\n") || "(пусто)";
  const sys =
    "Ты — диспетчер агентства. Шаг ниже передают КЛИЕНТУ (нетехническому человеку). Из технического описания выдели ИМЕННО то, " +
    "что должен сделать КЛИЕНТ: зарегистрировать сервис/аккаунт (бот, аналитика, домен, платёжка), дать доступ к своему аккаунту, прислать токен/ключ. " +
    "Опиши простым языком, без жаргона, на украинском — что и зачем. Инфраструктурные подпункты самого агентства (env, cron, деплой, секреты) НЕ включай. " +
    "Подбери guide_id из списка, если подходящий есть, иначе null.\n\n" +
    `Доступные гайды:\n${guideList}`;
  const user = `Шаг (тех. описание): ${action}\n${opts.summary ? `Задача: ${opts.summary}\n` : ""}${opts.projectSpec ? `Контекст: ${opts.projectSpec.slice(0, 1200)}` : ""}`;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const r = await anthropic.messages.create({ model: MODEL, max_tokens: 1024, system: sys, tools: [CLIENT_STEP_TOOL], tool_choice: { type: "tool", name: "client_step" }, messages: [{ role: "user", content: user }] });
  await logUsage(MODEL, "client-step", r.usage.input_tokens, r.usage.output_tokens).catch(() => {});
  const tu = r.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const inp = (tu?.input ?? {}) as Record<string, unknown>;
  const gid = typeof inp.guide_id === "number" ? inp.guide_id : null;
  return {
    short: String(inp.short || action.slice(0, 120)),
    text: String(inp.text || action),
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
