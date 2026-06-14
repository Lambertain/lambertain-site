"use server";

import { requireAdmin } from "@/lib/principal";
import { createGuide, updateGuide, deleteGuide } from "@/lib/db";
import { revalidatePath } from "next/cache";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "guide";
}

export async function saveGuide(input: { id?: number; slug?: string; title: string; body: string; ord: number }): Promise<{ ok?: boolean; id?: number; error?: string }> {
  await requireAdmin();
  if (!input.title.trim()) return { error: "Заголовок пуст" };
  if (input.id) {
    await updateGuide(input.id, input.title.trim(), input.body, input.ord);
    revalidatePath("/admin/guides");
    return { ok: true, id: input.id };
  }
  const slug = input.slug?.trim() || slugify(input.title);
  const r = await createGuide(slug, input.title.trim(), input.body, input.ord);
  revalidatePath("/admin/guides");
  return r.error ? { error: r.error } : { ok: true, id: r.id };
}

export async function removeGuide(id: number): Promise<{ ok?: boolean }> {
  await requireAdmin();
  await deleteGuide(id);
  revalidatePath("/admin/guides");
  return { ok: true };
}
