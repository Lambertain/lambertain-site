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
import { enrichDeliveredPRs } from "./pr-enrich";
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
      // Обогащение PR: номер Trello в заголовок + метка «бек+фронт»/pair-link для мультирепо-задач
      // (то, что раньше проставлялось руками; просьба разработчика клиента). Best-effort, сбой не валит доставку.
      await enrichDeliveredPRs(taskId, meta, delivered).catch((e) => reportTaskError(taskId, `оформлення PR (Trello#/мітка)`, e));
      // Админу НИЧЕГО не пушим: PR привязан, поллер ведёт стадию pr→dev→prod сам. Отставание ветки от develop
      // без конфликтов мержится автоматически, а реальный конфликт просто застопорит PR в стадии pr→dev —
      // это видно на портале. Пуш «потрібен ребейз» на любое отставание был чистым шумом.
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
    // no-op доставки (контент уже в проде) пропускаем: публиковать нечего, статус проекта и так актуальный.
    if (ds.some((d) => d.toDefault && !d.noop)) await publishProjectToProd(projectKey).catch(() => {});
    // Проблемный деплой = ТЕРМИНАЛЬНО-плохой: провал сборки или в проде задеплоен НЕ наш коммит.
    // Промежуточные статусы (DEPLOYING/BUILDING/PENDING…) — деплой ещё ИДЁТ, это не ошибка: approveClientDeploy
    // ждёт финал лишь ~150с, а сборка Railway (build+preDeploy-миграция) бывает дольше → раньше на «ещё идёт»
    // слался ложный «деплой НЕ опубліковано, перевір» (шум админу), хотя доставка прошла и деплой докатывался сам.
    // matched:false на НЕтерминальном статусе тоже ложный — наш коммит просто ещё не стал активным.
    const TERMINAL_BAD = new Set(["FAILED", "CRASHED", "ERROR", "REMOVED", "SKIPPED"]);
    const isProblem = (d: (typeof ds)[number]): boolean => {
      const dep = d.deploy;
      if (!dep) return false; // деплой не настроен — доставка кода и так прошла
      if (isDeployPublished(dep.status) && dep.matched !== false) return false; // опубликован именно наш коммит — ок
      if (TERMINAL_BAD.has(dep.status)) return true; // провал сборки/деплоя
      if (dep.matched === false && isDeployPublished(dep.status)) return true; // в проде реально чужой коммит
      return false; // DEPLOYING/BUILDING/PENDING — ещё идёт, не тревожим
    };
    // Пушим ТОЛЬКО реальную проблему деплоя (успех и «ещё идёт» — не шумим админу).
    const problems = ds.filter(isProblem);
    if (problems.length) {
      const lines = problems
        .map((d) => {
          const dep = d.deploy!;
          const depTxt = ` · ⚠️ деплой: ${dep.status}${dep.matched === false ? " (НЕ той коміт!)" : ""}${dep.note ? " — " + dep.note : ""}`;
          return `• ${d.clientRepo} (${d.branch})${d.prUrl ? " — PR" : ""}, файлів: ${d.files}${depTxt}`;
        })
        .join("\n");
      const first = problems[0];
      const btn = first.prUrl ? { text: "Pull Request", url: first.prUrl } : { text: "Коммит", url: first.commitUrl };
      await notifyAdmin(`⚠️ <b>Авто-доставка — деплой не вдався, перевір</b> · ${await taskTag(taskId)}\n${lines}`, btn).catch(() => {});
    }
  } catch (e) {
    await reportTaskError(taskId, "авто-доставка", e);
  }
}
