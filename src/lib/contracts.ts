/**
 * Генерация договоров: плейсхолдеры {{key}} и подстановка.
 * Чистая логика (без БД/React) — переиспользуется в server actions, странице печати и тестах.
 *
 * Зарезервированные ключи:
 *   contractor.<field> — реквизиты исполнителя (нашего ФОПа) из справочника, см. CONTRACTOR_FIELDS;
 *   client.requisites  — реквизиты заказчика (вставляются вручную в одно поле);
 *   number, date, city — реквизиты самого договора (отдельные поля формы).
 * Любые прочие {{key}} (subject, price, term…) — динамические поля формы.
 */

/** Поля реквизитов ФОПа-исполнителя (ключ в БД ↔ плейсхолдер contractor.<key>). */
export const CONTRACTOR_FIELDS = [
  "name",
  "address",
  "ipn",
  "iban",
  "bank_name",
  "bank_mfo",
  "bank_edrpou",
  "phone",
  "email",
] as const;
export type ContractorField = (typeof CONTRACTOR_FIELDS)[number];

export interface ContractorData {
  name: string;
  address?: string | null;
  ipn?: string | null;
  iban?: string | null;
  bank_name?: string | null;
  bank_mfo?: string | null;
  bank_edrpou?: string | null;
  phone?: string | null;
  email?: string | null;
}

/** Ключи, которые не являются динамическими полями формы (обрабатываются отдельным UI). */
export const SPECIAL_KEYS = new Set<string>([
  ...CONTRACTOR_FIELDS.map((f) => `contractor.${f}`),
  "client.requisites",
  "payments",
  "number",
  "date",
  "city",
]);

/** Человекочитаемые подписи известных плейсхолдеров (uk) — для лейблов полей формы. */
export const FIELD_LABELS_UK: Record<string, string> = {
  number: "Номер договору",
  date: "Дата договору",
  city: "Місто укладення",
  subject: "Предмет договору",
  scope: "Склад/обсяг робіт",
  price: "Вартість, грн",
  price_words: "Вартість прописом",
  prepay: "Передоплата",
  term: "Строк виконання",
  warranty: "Гарантійний строк",
  payments: "Графік платежів",
  "client.requisites": "Реквізити Замовника",
};

/** Один платёж графика: сумма + условие (срок ИЛИ этап разработки — свободный текст). */
export interface PaymentItem { amount: string; condition: string }

/** Собрать текст графика платежей в тело договора: «Платіж № 1: 10 000 грн — …;» построчно. */
export function buildPaymentsText(items: PaymentItem[]): string {
  const rows = items.filter((p) => p.amount.trim() || p.condition.trim());
  return rows
    .map((p, i) => {
      const end = i === rows.length - 1 ? "." : ";";
      const amount = p.amount.trim();
      const cond = p.condition.trim();
      return `Платіж № ${i + 1}: ${amount} грн${cond ? ` — ${cond}` : ""}${end}`;
    })
    .join("\n");
}

/** Сумма платежей графика (для подсказки/сверки с общей стоимостью). Возвращает null, если ничего не распарсилось. */
export function paymentsSum(items: PaymentItem[]): number | null {
  let sum = 0;
  let any = false;
  for (const p of items) {
    const n = Number(p.amount.replace(/\s/g, "").replace(",", "."));
    if (!Number.isNaN(n) && p.amount.trim()) { sum += n; any = true; }
  }
  return any ? sum : null;
}

/** Поля, которые удобнее вводить многострочно. */
export const MULTILINE_KEYS = new Set(["subject", "scope", "price_words", "client.requisites"]);

/** Подпись плейсхолдера для UI (по словарю, иначе сам ключ). */
export function fieldLabel(key: string): string {
  return FIELD_LABELS_UK[key] ?? key;
}

const UA_MONTHS = [
  "січня", "лютого", "березня", "квітня", "травня", "червня",
  "липня", "серпня", "вересня", "жовтня", "листопада", "грудня",
];

/** ISO-дата YYYY-MM-DD → «15 червня 2026 р.». Не-ISO значения возвращаются как есть. */
export function formatUaDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  const [, y, mo, d] = m;
  const month = UA_MONTHS[Number(mo) - 1];
  if (!month) return iso;
  return `«${Number(d)}» ${month} ${y} р.`;
}

/** Найти все уникальные плейсхолдеры {{key}} в теле шаблона (в порядке появления). */
export function extractPlaceholders(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of body.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}

/** Динамические плейсхолдеры шаблона = все, кроме зарезервированных. */
export function dynamicPlaceholders(body: string): string[] {
  return extractPlaceholders(body).filter((k) => !SPECIAL_KEYS.has(k));
}

export interface RenderContext {
  contractor?: ContractorData | null;
  clientRequisites?: string | null;
  number?: string | null;
  date?: string | null;
  city?: string | null;
  vars?: Record<string, string>;
}

/** Подставить значения плейсхолдеров. Незаполненные → пустая строка. */
export function renderContract(body: string, ctx: RenderContext): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_full, key: string) => {
    if (key.startsWith("contractor.")) {
      const f = key.slice("contractor.".length) as ContractorField;
      return (ctx.contractor?.[f] ?? "").toString();
    }
    if (key === "client.requisites") return ctx.clientRequisites ?? "";
    if (key === "number") return ctx.number ?? "";
    if (key === "date") return ctx.date ?? "";
    if (key === "city") return ctx.city ?? "";
    return ctx.vars?.[key] ?? "";
  });
}
