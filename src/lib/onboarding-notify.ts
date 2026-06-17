/**
 * Онбординг-уведомление участнику, ДОБАВЛЕННОМУ в проект, где уже могут быть задачи.
 * - Разработчик (contributor): сколько задач в работе ждёт — чтобы сразу понимал объём и брал по порядку.
 * - Клиент/сотрудник: что по проекту УЖЕ выполнено (если задачи закрыли до его добавления — иначе он этого не увидит).
 * Server-side only. Вызывается из всех путей добавления: redeemInvite, approveAccess, saveUserProjects.
 */
import { getProjectFull } from "./db";
import { getBackend } from "./tasks";
import { notifyLogins } from "./notify";
import { statusBucket } from "./statuses";
import { PORTAL_BASE } from "./dev-protocol";
import type { Role } from "./tasks/types";

const portalBtn = { text: "Открыть портал", url: `${PORTAL_BASE}/admin` };

/** Текст онбординг-уведомления (или null, если проект не найден). Без отправки — для предпросмотра. */
export async function buildProjectOnboarding(role: Role, projectKey: string): Promise<string | null> {
  const proj = await getProjectFull(projectKey).catch(() => null);
  if (!proj) return null;
  const tasks = await getBackend().listTasks({ projectKey }).catch(() => []);

  if (role === "contributor") {
    const open = tasks.filter((t) => statusBucket(t.state) !== "done").length;
    if (!open) return `📋 <b>${proj.name}</b>\nВас призначено відповідальним за проєкт. Наразі відкритих задач немає — щойно з'являться, побачите їх у порталі.`;
    return `📋 <b>${proj.name}</b>\nВас призначено відповідальним за проєкт. Задач у роботі: <b>${open}</b>. Відкрийте портал — починайте з першої (блокери розставлені).`;
  }

  // Клиент / сотрудник — что уже сделано (клиент-видимые, не internal).
  const done = tasks.filter((t) => !t.internal && statusBucket(t.state) === "done");
  if (done.length) {
    const head = done.slice(0, 6).map((t) => `• ${t.summary}`).join("\n");
    const more = done.length > 6 ? `\n…та ще ${done.length - 6}` : "";
    return `✅ <b>${proj.name}</b>\nРаді вітати! По проєкту вже виконано задач: <b>${done.length}</b>:\n${head}${more}\n\nУсі деталі — у порталі.`;
  }
  return `👋 <b>${proj.name}</b>\nРаді вітати! Деталі проєкту та задачі — у порталі.`;
}

/** Отправить онбординг-уведомление участнику по каждому добавленному проекту. */
export async function notifyProjectOnboarding(login: string, role: Role, projectKeys: string[]): Promise<void> {
  for (const key of projectKeys) {
    const text = await buildProjectOnboarding(role, key).catch(() => null);
    if (text) await notifyLogins([login], text, [], portalBtn).catch(() => {});
  }
}
