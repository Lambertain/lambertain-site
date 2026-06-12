"use server";

import { requireAdmin } from "@/lib/principal";
import { saveOnboarding, saveOnboardingMedia, type OnboardingStep } from "@/lib/db";

/** Сохранить шаги инструкции (admin). */
export async function saveOnboardingSteps(steps: OnboardingStep[]): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  try {
    const clean = steps
      .map((s) => ({ title: (s.title || "").trim(), body: (s.body || "").trim(), ...(s.collect ? { collect: s.collect } : {}) }))
      .filter((s) => s.title || s.body);
    await saveOnboarding(clean);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка сохранения" };
  }
}

/** Загрузить картинку шага (base64 data) → markdown-ссылка для вставки (admin). */
export async function uploadOnboardingImage(mime: string, base64: string): Promise<{ url?: string; error?: string }> {
  await requireAdmin();
  try {
    const id = await saveOnboardingMedia(mime, base64);
    return { url: `/api/onboarding-media/${id}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка загрузки" };
  }
}
