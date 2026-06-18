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
    "Разбей её на ПОСЛЕДОВАТЕЛЬНОСТЬ КРУПНЫХ задач для ОДНОГО разработчика.\n" +
    "ГЛАВНОЕ ПРАВИЛО ГРАНУЛЯРНОСТИ: дроби на УРОВНЕ ФИЧ / вех / вертикальных срезов (фича целиком, end-to-end: бэкенд+фронт вместе), " +
    "а НЕ на микрошаги реализации. НЕ создавай задачи вида «создай файл X», «добавь поле Y», «напиши функцию Z», «настрой роут» — " +
    "такую мелкую разбивку делает САМ Claude разработчика ВНУТРИ задачи (по spec-kit: plan → tasks), держа её в своём контексте. " +
    "Здесь дублировать её НЕ нужно — иначе теряется цельная картина и контекст.\n" +
    "Правила:\n" +
    "- Каждая задача — самостоятельный осмысленный кусок (фича/модуль/веха) с критериями приёмки НА ВСЮ ФИЧУ. summary — суть фичи; description — что должно работать с точки зрения результата + критерии приёмки (по спеке; без кода, без выдумок).\n" +
    "- ПОЛНАЯ спека проекта будет доступна разработчику (поле projectSpec) — НЕ дублируй в каждую задачу весь контекст/стек/архитектуру. В description — только что относится к этой фиче; общий контекст разработчик возьмёт из спеки.\n" +
    "- Порядок: сначала ФУНДАМЕНТ (каркас проекта, модель данных, авторизация), затем фичи end-to-end, затем полировка. Проставь dependsOn (индексы предшественников), чтобы фундамент шёл первым (блокеры).\n" +
    "- БЛОКЕРЫ — ТОЛЬКО РЕАЛЬНЫЕ И ПРЯМЫЕ. Ставь зависимость, лишь если задачу ТЕХНИЧЕСКИ НЕЛЬЗЯ начать без предшественника (нужен его код/схема/сущность). НЕ ставь блокеры «для порядка/на всякий случай» — лишние блокеры зря держат параллельные задачи.\n" +
    "  • БЕЗ ТРАНЗИТИВНЫХ дублей: если B зависит от A, а C от B — НЕ добавляй A в dependsOn у C (C и так после A). Указывай только НЕПОСРЕДСТВЕННОГО предшественника.\n" +
    "  • БЭКЕНД-ФУНДАМЕНТ (стек, модель данных, роли/авторизация) НЕ зависит от ДИЗАЙНА — его можно делать параллельно. От дизайн-задачи зависят ТОЛЬКО задачи с UI/вёрсткой/страницами, а не схема БД и серверная логика.\n" +
    "- ДИЗАЙН ПЕРВЫМ (ОБЯЗАТЕЛЬНО, если в спеке есть дизайн-система/арт-дирекшен — упоминаются design-system/MASTER.md, токены, палитра/шрифты, index.html): ПЕРВОЙ задачей (индекс 0) поставь «Внедрить дизайн-систему: глобальные токены (палитра/радиусы/тени), шрифты, базовый layout (хедер/футер/типографика) строго по design-system/MASTER.md + эталону index.html, без выдумок из головы». type=design, complexity=feature. " +
    "И КАЖДАЯ задача, затрагивающая UI/вёрстку/страницы/компоненты, ДОЛЖНА иметь индекс этой дизайн-задачи в своём dependsOn — чтобы фичи верстались уже по дизайн-системе, а не «из головы». Это критично: без этого визуал получается несогласованным.\n" +
    "- ОРИЕНТИР ПО КОЛИЧЕСТВУ: обычно 5–15 задач на проект, а НЕ десятки. Лучше крупнее и цельнее, чем мельче. Если получается >20 — ты дробишь слишком мелко, укрупни.\n" +
    "- Теги: type; complexity (для таких фич — обычно feature; small лишь для реально мелких правок); skills (slug'и из списка ниже).\n" +
    "- ЕСЛИ в спеке указано, что уже сделано / текущее состояние (проект частично готов) — НЕ создавай задачи на готовое, только на ОСТАВШЕЕСЯ; зависимости считай относительно остатка.\n" +
    "- В репозиторий НЕ ходишь — код и детальную разбивку каждой фичи делает Claude разработчика (у него весь код как контекст).\n\n" +
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
