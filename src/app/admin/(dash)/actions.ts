"use server";

import { getPrincipal } from "@/lib/principal";
import { createRequestTaskCore, structureDraftCore, createFromDraftCore } from "@/lib/task-intake";
import type { ReqBlock } from "@/lib/db";
import type { DraftTask } from "@/lib/tasks/types";

/**
 * Создать задачу из сырого запроса (текст + скрины). Логика — в lib/task-intake (общая с API-роутом
 * /api/portal/create-task, который и используется клиентом: fetch переживает деплой, UI не дёргается).
 */
export async function createRequestTask(
  projectKey: string,
  title: string,
  blocks: ReqBlock[],
  recipient?: "admin" | "client" | "self" | "from_client",
  internal?: boolean,
): Promise<{ id?: string; url?: string; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  return createRequestTaskCore(me, projectKey, title, blocks, recipient, internal);
}

/** Структурировать произвольный текст в черновик задачи (превью перед созданием). */
export async function structureDraft(
  text: string,
  preset?: { projectKey?: string; assigneeLogin?: string },
): Promise<{ draft?: DraftTask; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  return structureDraftCore(me, text, preset);
}

/** Создать задачу из (возможно отредактированного) черновика. */
export async function createFromDraft(
  draft: DraftTask,
): Promise<{ id?: string; url?: string; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  return createFromDraftCore(me, draft);
}
