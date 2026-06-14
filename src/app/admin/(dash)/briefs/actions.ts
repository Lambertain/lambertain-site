"use server";

import { requireAdmin } from "@/lib/principal";
import { createBrief } from "@/lib/db";

/** Завести нового лида/бриф (метка — имя/контакт). Возвращает токен для ссылки /brief/<token>. */
export async function newBrief(label: string): Promise<{ token?: string; error?: string }> {
  await requireAdmin();
  if (!label.trim()) return { error: "Укажите имя/контакт лида" };
  const { token } = await createBrief(label);
  return { token };
}
