/**
 * Автодоставка dev→client при приёмке задачи (meta.autoDeliver).
 * Единая точка для обоих триггеров: ручная приёмка постановщиком (reviewTask) и авто-готово
 * доверенного разраба (/api/dev/status). Доставляет по всем парам репо (autoDeliverIfConfigured),
 * при прямой доставке в main публикует проект в прод и уведомляет супер-админа.
 *
 * Вызывать в фоне через after() — не блокировать ответ/экшен.
 */
import { autoDeliverIfConfigured } from "./deliver";
import { publishProjectToProd } from "./deploy-stage";
import { notifyAdmin, taskTag } from "./notify";
import { PORTAL_BASE } from "./dev-protocol";
import type { ProjectMeta } from "./tasks/types";

export async function autoDeliverAndNotify(projectKey: string, meta: ProjectMeta, taskId: string): Promise<void> {
  try {
    const ds = await autoDeliverIfConfigured(meta);
    if (!ds || !ds.length) return;
    // toDefault только в прямом режиме (squash в main) → публикация в прод. В PR-режиме — ждём мержа дева клиента.
    if (ds.some((d) => d.toDefault)) await publishProjectToProd(projectKey).catch(() => {});
    const lines = ds
      .map((d) => `• ${d.clientRepo} (${d.branch})${d.prUrl ? " — PR" : ""}, файлів: ${d.files}${d.deploy ? ` · деплой: ${d.deploy.status}` : ""}`)
      .join("\n");
    const first = ds[0];
    const btn = first.prUrl ? { text: "Pull Request", url: first.prUrl } : { text: "Коммит", url: first.commitUrl };
    await notifyAdmin(`🚀 <b>Авто-доставка</b> · ${await taskTag(taskId)}\n${lines}`, btn).catch(() => {});
  } catch (e) {
    await notifyAdmin(
      `⚠️ <b>Авто-доставка не вдалася</b> · ${await taskTag(taskId)}: ${e instanceof Error ? e.message : "помилка"}`,
      { text: "Відкрити задачу", url: `${PORTAL_BASE}/admin/tasks/${taskId}` },
    ).catch(() => {});
  }
}
