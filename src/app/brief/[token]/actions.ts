"use server";

import { submitBrief, getBriefByToken } from "@/lib/db";
import { notifyAdmin } from "@/lib/notify";
import { validateInitData } from "@/lib/telegram-auth";

/** Отправка заполненного брифа. initData (Telegram Mini App) даёт контакт лида — его не спрашиваем в форме. */
export async function submitBriefAction(
  token: string,
  projectType: string,
  payload: Record<string, unknown>,
  initData?: string,
): Promise<{ ok?: boolean; error?: string }> {
  if (!token || !projectType) return { error: "type required" };
  const brief = await getBriefByToken(token);
  if (!brief) return { error: "not found" };
  // Контакт из Telegram (если бриф открыт в боте/Mini App).
  const v = initData ? validateInitData(initData) : null;
  const tg = v?.user?.id ? { id: v.user.id, username: v.user.username, name: v.user.firstName } : undefined;
  const ok = await submitBrief(token, projectType, payload, tg);
  if (!ok) return { error: "save failed" };
  const contact = tg ? `${tg.name || ""}${tg.username ? ` (@${tg.username})` : ""}` : (brief.label || "лид");
  await notifyAdmin(`📋 <b>Бриф заполнен</b> · ${contact} · тип: ${projectType}`).catch(() => {});
  return { ok: true };
}
