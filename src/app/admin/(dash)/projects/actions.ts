"use server";

import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/principal";
import { setProjectToken } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function generateProjectToken(
  projectKey: string,
): Promise<{ token?: string; error?: string }> {
  try {
    await requireAdmin();
    if (!projectKey) return { error: "no project" };
    const token = `pk_${randomBytes(20).toString("hex")}`;
    await setProjectToken(projectKey, token);
    revalidatePath("/admin/projects");
    return { token };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}
