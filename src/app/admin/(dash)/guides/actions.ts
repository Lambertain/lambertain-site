"use server";

import { requireAdmin } from "@/lib/principal";
import { createGuide, updateGuide, deleteGuide, saveGuideImage,
  createInstructionSet, updateInstructionSet, deleteInstructionSet } from "@/lib/db";
import { revalidatePath } from "next/cache";

/** Загрузить картинку гайда (из буфера). Возвращает URL для вставки в markdown. */
export async function uploadGuideImage(mime: string, dataB64: string): Promise<{ url?: string; error?: string }> {
  await requireAdmin();
  if (!dataB64) return { error: "Пустая картинка" };
  const id = await saveGuideImage(mime, dataB64);
  return { url: `/api/guide-files/${id}` };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "guide";
}

export async function saveGuide(input: { id?: number; slug?: string; title: string; body: string; ord: number; loc?: { title_ru?: string; body_ru?: string; title_en?: string; body_en?: string }; collectField?: string | null }): Promise<{ ok?: boolean; id?: number; error?: string }> {
  await requireAdmin();
  if (!input.title.trim()) return { error: "Заголовок пуст" };
  const loc = {
    title_ru: input.loc?.title_ru?.trim() || null, body_ru: input.loc?.body_ru ?? null,
    title_en: input.loc?.title_en?.trim() || null, body_en: input.loc?.body_en ?? null,
  };
  const collectField = input.collectField?.trim() || null;
  if (input.id) {
    await updateGuide(input.id, input.title.trim(), input.body, input.ord, loc, collectField);
    revalidatePath("/admin/guides");
    return { ok: true, id: input.id };
  }
  const slug = input.slug?.trim() || slugify(input.title);
  const r = await createGuide(slug, input.title.trim(), input.body, input.ord, loc, collectField);
  revalidatePath("/admin/guides");
  return r.error ? { error: r.error } : { ok: true, id: r.id };
}

export async function removeGuide(id: number): Promise<{ ok?: boolean }> {
  await requireAdmin();
  await deleteGuide(id);
  revalidatePath("/admin/guides");
  return { ok: true };
}

/** Создать/обновить набор инструкций (выбранные блоки-гайды) → публичная ссылка. */
export async function saveInstructionSet(input: { id?: number; title: string; guideIds: number[] }): Promise<{ ok?: boolean; id?: number; token?: string; error?: string }> {
  await requireAdmin();
  const ids = (input.guideIds || []).filter((n) => Number.isInteger(n));
  if (!ids.length) return { error: "Оберіть хоча б один блок" };
  const title = input.title.trim() || null;
  if (input.id) {
    await updateInstructionSet(input.id, title, ids);
    revalidatePath("/admin/guides");
    return { ok: true, id: input.id };
  }
  const r = await createInstructionSet(title, ids);
  revalidatePath("/admin/guides");
  return { ok: true, id: r.id, token: r.token };
}

export async function removeInstructionSet(id: number): Promise<{ ok: boolean }> {
  await requireAdmin();
  await deleteInstructionSet(id);
  revalidatePath("/admin/guides");
  return { ok: true };
}
