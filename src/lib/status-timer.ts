/**
 * Таймер пребывания задачи в статусах — для «кружков» на карточке (внутренний вид).
 * Каждый отрезок = непрерывное пребывание в одном статусе (создание → смена → … → now/resolved).
 * Счёт по 24 часа: цифра = floor(часы_в_статусе / 24) + 1 (первые сутки → «1», 24–48 ч → «2», …).
 * Цвет: 1 — зелёный, 2 — жёлтый, ≥3 — красный (дальше цифра растёт, цвет остаётся красным).
 * Смена статуса начинает новый отрезок. Возврат в статус, где задача уже была в текущей строке,
 * переносит отрезок на новую строку (строка = один «проход» по статусам → видно циклы доработок).
 */

const DAY_MS = 86400000;

export interface StatusEvent {
  ts: number; // epoch ms перехода
  from: string | null;
  to: string | null;
}

export interface StatusSegment {
  status: string;
  startMs: number;
  endMs: number; // конец пребывания: ts следующего перехода, либо resolved (заморожено), либо now (тикает)
}

/** Восстановить отрезки пребывания в статусах из журнала переходов. */
export function buildStatusSegments(opts: {
  createdMs: number;
  resolvedMs?: number | null;
  currentStatus: string;
  events: StatusEvent[];
  nowMs: number;
}): StatusSegment[] {
  const { createdMs, resolvedMs, currentStatus, nowMs } = opts;
  const evs = [...opts.events].filter((e) => e.ts >= createdMs).sort((a, b) => a.ts - b.ts);
  const segs: StatusSegment[] = [];
  // Начальный статус — «откуда» первого перехода; если переходов нет — текущий статус задачи.
  let curStatus = evs.length ? evs[0].from ?? currentStatus : currentStatus;
  let start = createdMs;
  for (const e of evs) {
    segs.push({ status: curStatus, startMs: start, endMs: e.ts });
    curStatus = e.to ?? curStatus;
    start = e.ts;
  }
  // Последний отрезок: у завершённой задачи заморожен на resolved, иначе тикает до now.
  const end = resolvedMs != null ? resolvedMs : nowMs;
  segs.push({ status: curStatus, startMs: start, endMs: Math.max(end, start) });
  return segs;
}

/** Номер дня пребывания (по 24 часа): первые сутки → 1, 24–48 ч → 2, … Минимум 1. */
export function segmentDayNumber(startMs: number, endMs: number): number {
  return Math.floor(Math.max(0, endMs - startMs) / DAY_MS) + 1;
}

export type DotColor = "green" | "amber" | "red";

export function dayColor(days: number): DotColor {
  return days <= 1 ? "green" : days === 2 ? "amber" : "red";
}

/** Разбить отрезки на строки: повтор статуса в текущей строке → перенос на новую строку. */
export function segmentsToRows<T extends { status: string }>(segs: T[]): T[][] {
  const rows: T[][] = [];
  let row: T[] = [];
  let seen = new Set<string>();
  for (const s of segs) {
    if (seen.has(s.status)) {
      rows.push(row);
      row = [];
      seen = new Set();
    }
    row.push(s);
    seen.add(s.status);
  }
  if (row.length) rows.push(row);
  return rows;
}

export interface StatusDot {
  status: string;
  days: number;
}

/** Готовые «кружки» по строкам для карточки задачи. */
export function statusDotRows(opts: {
  createdMs: number;
  resolvedMs?: number | null;
  currentStatus: string;
  events: StatusEvent[];
  nowMs: number;
}): StatusDot[][] {
  const segs = buildStatusSegments(opts);
  return segmentsToRows(segs).map((row) =>
    row.map((s) => ({ status: s.status, days: segmentDayNumber(s.startMs, s.endMs) })),
  );
}
