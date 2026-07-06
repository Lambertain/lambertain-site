/**
 * Автодоставка dev→client при приёмке задачи (meta.autoDeliver).
 * Единая точка для обоих триггеров: ручная приёмка постановщиком (reviewTask) и авто-готово
 * доверенного разраба (/api/dev/status). Доставляет по всем парам репо (autoDeliverIfConfigured),
 * при прямой доставке в main публикует проект в прод и уведомляет супер-админа.
 *
 * Вызывать в фоне через after() — не блокировать ответ/экшен.
 */
import { autoDeliverIfConfigured, isDeployPublished } from "./deliver";
import { deliverGitflow } from "./sync-client";
import { publishProjectToProd } from "./deploy-stage";
import { setTaskPr } from "./db";
import { notifyAdmin, taskTag } from "./notify";
import { reportTaskError } from "./task-error";
import type { ProjectMeta } from "./tasks/types";

/**
 * gitflow-доставка по задаче: пушит feature-ветку разработчика в клиентский репо и открывает PR в develop,
 * ПРИВЯЗЫВАЕТ PR к задаче (стадия 'pr') — дальше поллер сам ведёт стадию pr→dev (мерж в develop)→prod
 * (merge доехал до main клиента), без ручного /api/dev/pr. Затем уведомляет команду (PR-ссылка;
 * предупреждение, если develop ушёл вперёд или ничего не доставлено). Вызывать в фоне через after().
 */
export async function deliverGitflowAndNotify(projectKey: string, meta: ProjectMeta, branch: string, taskId: string): Promise<void> {
  try {
    const results = await deliverGitflow(meta, branch, "develop", `${taskId}: ${branch}`, `Lambertain · задача ${taskId} · гілка ${branch}`);
    const delivered = results.filter((r) => r.prUrl);
    if (delivered.length) {
      // Автопривязка ВСЕХ открытых PR к задаче (мультирепо: backend+app → несколько PR) → поллер
      // deploy-sync двигает стадию, когда ВСЕ смержены/опубликованы, и зеркалит ревью по каждому.
      // Сбой привязки тоже виден на портале, а не молчит.
      for (const d of delivered) {
        await setTaskPr(taskId, d.prUrl!).catch((e) => reportTaskError(taskId, `прив'язка PR до задачі (${d.clientRepo || "?"})`, e));
      }
      const lines = delivered.map((r) => `• ${r.clientRepo}: PR ${r.created ? "відкрито" : "оновлено"}${r.upToDate === false ? " ⚠️ develop пішов вперед — потрібен ребейз" : ""}`).join("\n");
      await notifyAdmin(`🚀 <b>Gitflow-доставка</b> · ${await taskTag(taskId)} · гілка <code>${branch}</code>\n${lines}`, { text: "Pull Request", url: delivered[0].prUrl! }).catch(() => {});
    } else {
      const err = results.map((r) => r.error || r.prError).filter(Boolean).join("; ") || "гілку не знайдено в жодному форку";
      await reportTaskError(taskId, `gitflow-доставка гілки ${branch}`, err);
    }
  } catch (e) {
    await reportTaskError(taskId, "gitflow-доставка", e);
  }
}

export async function autoDeliverAndNotify(projectKey: string, meta: ProjectMeta, taskId: string): Promise<void> {
  try {
    const ds = await autoDeliverIfConfigured(meta);
    if (!ds || !ds.length) return;
    // toDefault только в прямом режиме (squash в main) → публикация в прод. В PR-режиме — ждём мержа дева клиента.
    if (ds.some((d) => d.toDefault)) await publishProjectToProd(projectKey).catch(() => {});
    // Деплой «живой» = SUCCESS и задеплоен именно наш коммит. Иначе — явное предупреждение (не глотаем).
    const live = (d: (typeof ds)[number]) => !d.deploy || (isDeployPublished(d.deploy.status) && d.deploy.matched !== false);
    const lines = ds
      .map((d) => {
        const dep = d.deploy;
        const depTxt = !dep
          ? ""
          : isDeployPublished(dep.status) && dep.matched !== false
            ? " · деплой: ✓ опубліковано"
            : ` · ⚠️ деплой: ${dep.status}${dep.matched === false ? " (НЕ той коміт!)" : ""}${dep.note ? " — " + dep.note : ""}`;
        return `• ${d.clientRepo} (${d.branch})${d.prUrl ? " — PR" : ""}, файлів: ${d.files}${depTxt}`;
      })
      .join("\n");
    const first = ds[0];
    const btn = first.prUrl ? { text: "Pull Request", url: first.prUrl } : { text: "Коммит", url: first.commitUrl };
    const header = ds.every(live) ? "🚀 <b>Авто-доставка</b>" : "⚠️ <b>Авто-доставка — деплой НЕ опубліковано, перевір</b>";
    await notifyAdmin(`${header} · ${await taskTag(taskId)}\n${lines}`, btn).catch(() => {});
  } catch (e) {
    await reportTaskError(taskId, "авто-доставка", e);
  }
}
