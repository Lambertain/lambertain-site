/**
 * Автодоставка dev→client при приёмке задачи (meta.autoDeliver).
 * Единая точка для обоих триггеров: ручная приёмка постановщиком (reviewTask) и авто-готово
 * доверенного разраба (/api/dev/status). Доставляет по всем парам репо (autoDeliverIfConfigured),
 * при прямой доставке в main публикует проект в прод и уведомляет супер-админа.
 *
 * Вызывать в фоне через after() — не блокировать ответ/экшен.
 */
import { autoDeliverIfConfigured } from "./deliver";
import { deliverGitflow } from "./sync-client";
import { publishProjectToProd } from "./deploy-stage";
import { notifyAdmin, taskTag } from "./notify";
import { PORTAL_BASE } from "./dev-protocol";
import type { ProjectMeta } from "./tasks/types";

/**
 * gitflow-доставка по задаче: пушит feature-ветку разработчика в клиентский репо и открывает PR в develop,
 * затем уведомляет команду (PR-ссылка; предупреждение, если develop ушёл вперёд или ничего не доставлено).
 * Вызывать в фоне через after().
 */
export async function deliverGitflowAndNotify(projectKey: string, meta: ProjectMeta, branch: string, taskId: string): Promise<void> {
  const btnTask = { text: "Відкрити задачу", url: `${PORTAL_BASE}/admin/tasks/${taskId}` };
  try {
    const results = await deliverGitflow(meta, branch, "develop", `${taskId}: ${branch}`, `Lambertain · задача ${taskId} · гілка ${branch}`);
    const delivered = results.filter((r) => r.prUrl);
    if (delivered.length) {
      const lines = delivered.map((r) => `• ${r.clientRepo}: PR ${r.created ? "відкрито" : "оновлено"}${r.upToDate === false ? " ⚠️ develop пішов вперед — потрібен ребейз" : ""}`).join("\n");
      await notifyAdmin(`🚀 <b>Gitflow-доставка</b> · ${await taskTag(taskId)} · гілка <code>${branch}</code>\n${lines}`, { text: "Pull Request", url: delivered[0].prUrl! }).catch(() => {});
    } else {
      const err = results.map((r) => r.error || r.prError).filter(Boolean).join("; ");
      await notifyAdmin(`⚠️ <b>Gitflow-доставка не вдалася</b> · ${await taskTag(taskId)} · гілка <code>${branch}</code>: ${err.slice(0, 200) || "гілку не знайдено в жодному форку"}`, btnTask).catch(() => {});
    }
  } catch (e) {
    await notifyAdmin(`⚠️ <b>Gitflow-доставка не вдалася</b> · ${await taskTag(taskId)}: ${e instanceof Error ? e.message : "помилка"}`, btnTask).catch(() => {});
  }
}

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
