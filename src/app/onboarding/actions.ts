"use server";

import { getPrincipal } from "@/lib/principal";
import { getOnboarding, saveOnboardingValue, getOnboardingValues, setProjectShowOnboarding, type OnboardingCollect } from "@/lib/db";

/**
 * Клиент сохраняет введённое на шаге значение (репозиторий/токен) в поле своего проекта.
 * Когда все собираемые поля заполнены — снимаем флаг показа онбординга.
 */
export async function submitOnboardingField(
  field: OnboardingCollect,
  value: string,
): Promise<{ ok?: boolean; done?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me || me.role !== "client" || !me.projectKey) return { error: "Немає доступу" };
  if (!value.trim()) return { error: "Порожнє значення" };
  try {
    await saveOnboardingValue(me.projectKey, field, value);
    // Проверяем, все ли собираемые поля заполнены → снимаем флаг.
    const [{ steps }, values] = await Promise.all([getOnboarding(), getOnboardingValues(me.projectKey)]);
    const required = new Set(steps.map((s) => s.collect).filter(Boolean) as OnboardingCollect[]);
    const allFilled = [...required].every((c) => (values[c] || "").trim().length > 0);
    if (allFilled) await setProjectShowOnboarding(me.projectKey, false);
    return { ok: true, done: allFilled };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Помилка" };
  }
}
