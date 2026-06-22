/**
 * Управление деплой-стадией задачи + понятное клиенту пояснение комментом при смене стадии.
 * Решает путаницу «не бачу змін на сайті»: клиенту прямо пишут, что зроблено, але ще на тестовій версії
 * (на робочому сайті зʼявиться після публікації) → і окремо, коли опубліковано. Server-side only.
 */
import { getBackend } from "./tasks";
import { setDeployStage, listProjectDevStageTasks, projectHasClient } from "./db";
import { notifyProjectClients, taskTag } from "./notify";
import { PORTAL_BASE } from "./dev-protocol";

// Текст-пояснение клиенту при достижении стадии (укр., простыми словами). 'pr' — без коммента (просто «в роботі»).
const NOTE: Record<string, string> = {
  dev: "✅ <b>Зроблено.</b> Зміни вже готові, але поки що НЕ на вашому робочому сайті — спершу вони на тестовій версії. На робочому сайті зʼявляться після публікації (статус зміниться на «Опубліковано», ми повідомимо). Тож якщо на сайті поки нічого не змінилось — це нормально, зачекайте на публікацію.",
  prod: "🚀 <b>Опубліковано.</b> Зміни вже на вашому робочому сайті — можна перевіряти.",
};

/**
 * Поставить деплой-стадию задачи и, если она реально изменилась, дослать клиенту понятный коммент
 * (тільки для клієнтських проєктів і не для внутрішніх задач). 'pr' — без коммента.
 */
export async function advanceStage(taskId: string, stage: "pr" | "dev" | "prod"): Promise<void> {
  const changed = await setDeployStage(taskId, stage);
  if (!changed) return;
  const note = NOTE[stage];
  if (!note) return;
  const be = getBackend();
  const task = await be.getTask(taskId).catch(() => null);
  if (!task || task.internal) return;
  if (!(await projectHasClient(task.projectKey).catch(() => false))) return; // только клиентские проекты
  const link = { text: "Відкрити задачу", url: `${PORTAL_BASE}/admin/tasks/${taskId}` };
  await be.addComment(taskId, note, "client", undefined, true, false).catch(() => {});
  await notifyProjectClients(task.projectKey, `${stage === "prod" ? "🚀" : "✅"} <b>${await taskTag(taskId)}</b>: ${note.replace(/<\/?b>/g, "")}`, [], link).catch(() => {});
}

/** Доставка в прод → все 'dev'-задачи проекта публикуем (стадия 'prod' + коммент клиенту). Возвращает число. */
export async function publishProjectToProd(projectKey: string): Promise<number> {
  const ids = await listProjectDevStageTasks(projectKey);
  for (const id of ids) await advanceStage(id, "prod");
  return ids.length;
}
