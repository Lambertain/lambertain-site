/**
 * Финансы проекта: стоимость + оплаты клиента (сумма+дата). Оплаты сверх cost увеличивают итоговую
 * стоимость (клиент доплачивает за доп. работы — эти суммы прибавляются к стоимости, а не «переплата»).
 * Легаси-фолбэк: старые проекты без payments, но с parts/paidParts — считаем оплату по частям.
 */
import type { ProjectMeta } from "./tasks/types";

export interface ProjectPayment { amount: number; date: string }

export interface ProjectFinance {
  cost: number;         // базовая стоимость, введённая админом
  paid: number;         // сумма всех оплат
  remaining: number;    // сколько осталось доплатить до базовой стоимости (не меньше 0)
  effectiveCost: number; // итоговая стоимость = max(cost, paid): доплаты сверх cost поднимают её
  currency: string;
  payments: ProjectPayment[];
  isClient: boolean;    // есть экономика (стоимость или оплаты) — клиентский проект
}

export function projectFinance(meta: ProjectMeta): ProjectFinance {
  const cost = Number.isFinite(meta.cost) ? (meta.cost as number) : 0;
  const currency = meta.currency || "₴";
  const payments = (meta.payments ?? [])
    .filter((p) => p && Number.isFinite(p.amount))
    .map((p) => ({ amount: Number(p.amount), date: p.date || "" }));
  let paid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  // Легаси-фолбэк для старых проектов (parts/paidParts) — пока админ не перевёл их на payments.
  if (!payments.length && meta.paidParts && meta.parts) {
    const parts = Math.max(1, Math.floor(meta.parts));
    const pp = Math.min(Math.max(Math.floor(meta.paidParts), 0), parts);
    paid = cost > 0 ? Math.round((cost * pp) / parts) : 0;
  }
  const effectiveCost = Math.max(cost, paid); // доплаты сверх стоимости → она растёт
  const remaining = Math.max(0, cost - paid);
  return { cost, paid, remaining, effectiveCost, currency, payments, isClient: cost > 0 || paid > 0 };
}
