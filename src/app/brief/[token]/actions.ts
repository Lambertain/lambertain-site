"use server";

import { submitBrief, getBriefByToken } from "@/lib/db";
import { notifyAdmin } from "@/lib/notify";

/** Отправка заполненного брифа (публично, по токену). */
export async function submitBriefAction(
  token: string,
  projectType: string,
  payload: Record<string, unknown>,
): Promise<{ ok?: boolean; error?: string }> {
  if (!token || !projectType) return { error: "type required" };
  const brief = await getBriefByToken(token);
  if (!brief) return { error: "not found" };
  const ok = await submitBrief(token, projectType, payload);
  if (!ok) return { error: "save failed" };
  await notifyAdmin(`📋 <b>Бриф заполнен</b> · ${brief.label || "лид"} · тип: ${projectType}`).catch(() => {});
  return { ok: true };
}
