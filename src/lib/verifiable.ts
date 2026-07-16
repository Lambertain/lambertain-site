/**
 * Классификатор «может ли КЛИЕНТ проверить задачу сам» (client_verifiable) — пакетно, для бэкфилла
 * существующих задач и разовой сверки. НЕтехнический клиент принимает задачу, только если может открыть
 * экран/страницу/приложение и увидеть или покликать результат. Внутренние/технические задачи (миграция БД,
 * схема данных, бэкап, CI/деплой-настройка, серверная интеграция без UI, рефакторинг) клиент проверить не
 * может — их не выносим ему на приёмку, они идут сразу в Done.
 * Консервативно: при сомнении → verifiable=true (лучше показать клиенту, чем молча авто-закрыть). Server-side only.
 */
import Anthropic from "@anthropic-ai/sdk";
import { logUsage } from "./db";

const MODEL = process.env.STRUCTURER_MODEL || "claude-opus-4-8";

export interface VerifiableItem { id: string; summary: string; description?: string | null }

const TOOL: Anthropic.Tool = {
  name: "classify",
  description: "Для каждой задачи определить, может ли НЕтехнический клиент проверить результат сам.",
  input_schema: {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "id задачи из входа (напр. VNAC-13)." },
            client_verifiable: { type: "boolean", description: "true — задача даёт клиенту НОВЫЙ наблюдаемый результат, который он сам откроет и увидит/использует: экран, страница, форма, личный кабинет, поведение фичи, документ/файл, письмо, ответ бота, каталог, дашборд/отчёт. false — задача, которую клиент НЕ принимает глазами/руками: (1) тестирование/QA/автотесты (unit/E2E)/CI-пороги; (2) деплой/публикация/настройка окружения/инфраструктура/DNS; (3) финализация/сквозная проверка/приёмка/безопасность-хардненинг/рефакторинг/оптимизация без нового видимого результата; (4) внутренняя/серверная работа без UI (миграция БД, схема данных, бэкап, серверная интеграция без экрана, авторизация/middleware). Правило: если задача даёт НОВУЮ видимую фичу (пусть и с доработкой) — true; если это ТОЛЬКО тесты/деплой/финализация/инфраструктура — false. При сомнении между видимой фичей и «просто доработкой» → true." },
          },
          required: ["id", "client_verifiable"],
        },
      },
    },
    required: ["results"],
  },
};

/**
 * Классифицировать пакет задач. Возвращает map id → client_verifiable. Не вернувшиеся id считаем true
 * (консервативно — на ревью). Бросает при отсутствии ключа/ошибке API.
 */
export async function classifyClientVerifiable(items: VerifiableItem[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  if (!items.length) return out;
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY не задан");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const CHUNK = 25; // задач на один запрос
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    const userText = chunk
      .map((t) => `### ${t.id}\n${t.summary}\n${(t.description || "").slice(0, 700)}`)
      .join("\n\n");
    const system =
      "Ты — диспетчер агентства. Для КАЖДОЙ задачи реши: может ли НЕтехнический клиент принять её результат САМ, " +
      "глазами/руками. client_verifiable=true — задача даёт НОВЫЙ наблюдаемый результат (экран, страница, форма, " +
      "личный кабинет, поведение фичи, документ/файл, письмо, ответ бота, каталог, дашборд/отчёт). " +
      "client_verifiable=false для задач, которые клиент НЕ принимает глазами/руками: (1) тестирование/QA/автотесты/CI; " +
      "(2) деплой/публикация/настройка окружения/инфраструктура/DNS; (3) финализация/сквозная проверка/приёмка/" +
      "безопасность-хардненинг/рефакторинг/оптимизация без нового видимого результата; (4) внутренняя/серверная работа " +
      "без UI (миграция БД, схема данных, бэкап, серверная интеграция без экрана, авторизация/middleware). " +
      "Если задача даёт новую видимую фичу (пусть и с доработкой) → true; если это ТОЛЬКО тесты/деплой/финализация/" +
      "инфраструктура → false. Верни результат по КАЖДОМУ id инструментом classify.";
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "classify" },
      messages: [{ role: "user", content: userText }],
    });
    await logUsage(MODEL, "classify-verifiable", resp.usage.input_tokens, resp.usage.output_tokens).catch(() => {});
    const tu = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const results = ((tu?.input ?? {}) as { results?: { id?: string; client_verifiable?: boolean }[] }).results || [];
    for (const r of results) {
      if (r.id) out.set(String(r.id).trim(), r.client_verifiable !== false);
    }
  }
  return out;
}
