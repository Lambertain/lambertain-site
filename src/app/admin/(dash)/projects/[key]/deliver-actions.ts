"use server";

import { requireAdmin } from "@/lib/principal";
import { getProjectFull } from "@/lib/db";
import { publishProjectToProd } from "@/lib/deploy-stage";
import { previewDelivery, deliverDevToClient, approveClientDeploy, clientDeployStatus, vercelDeployStatus, type DeliveryPreview, type DeployStatus } from "@/lib/deliver";

/** Превью доставки: число файлов + изменения схемы БД + дефолтная ветка клиента. */
export async function previewDeliver(key: string): Promise<{ preview?: DeliveryPreview; error?: string }> {
  try {
    await requireAdmin();
    const proj = await getProjectFull(key);
    if (!proj) return { error: "Проект не найден" };
    const preview = await previewDelivery({ devGit: proj.meta.devGit, clientGit: proj.meta.clientGit });
    return { preview };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

export interface DeliverResultUI {
  clientRepo: string;
  branch: string;
  files: number;
  commitUrl: string;
  toDefault: boolean;
  prUrl?: string;
  deploy?: DeployStatus | null;
}

/**
 * Доставить dev→client одним коммитом в выбранную ветку.
 * Если схема БД менялась — нужен schemaConfirmed (миграцию накатываешь вручную ДО доставки).
 * Если ветка = дефолтная клиента и настроен clientDeploy — апрувим деплой и ждём статус.
 */
export async function runDeliver(
  key: string,
  targetBranch: string,
  schemaConfirmed: boolean,
): Promise<{ results?: DeliverResultUI[]; error?: string }> {
  try {
    await requireAdmin();
    const proj = await getProjectFull(key);
    if (!proj) return { error: "Проект не найден" };

    const asPR = !!proj.meta.clientDeliverPR;
    // Доставляем по ВСЕМ парам репо проекта (основная + extraRepos: backend+frontend тощо).
    const pairs = [{ dev: proj.meta.devGit, client: proj.meta.clientGit }, ...(proj.meta.extraRepos ?? [])]
      .filter((p): p is { dev: string; client: string } => !!p.dev && !!p.client);
    if (!pairs.length) return { error: "Не заданы репозитории проекта (devGit/clientGit)" };

    const date = new Date().toISOString().slice(0, 10);
    const results: DeliverResultUI[] = [];
    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i];
      const preview = await previewDelivery({ devGit: p.dev, clientGit: p.client });
      // Подтверждение схемы не нужно, если деплой сам накатывает миграции или включён clientAutoMigrate.
      if (preview.schemaChanges.length > 0 && !schemaConfirmed && !proj.meta.clientAutoMigrate && !preview.migratesOnDeploy) {
        return { error: `Схема БД изменилась (${p.client}: ${preview.schemaChanges.length}). Накати миграцию и подтверди.` };
      }
      const res = await deliverDevToClient({
        devGit: p.dev,
        clientGit: p.client,
        targetBranch: i === 0 && targetBranch ? targetBranch : preview.clientDefaultBranch,
        message: `Lambertain delivery — ${date}`,
        asPR,
      });
      let deploy: DeployStatus | null = null;
      // Деплой/апрув — только в прямом режиме (push в main). В PR-режиме мержит дев клиента.
      if (!asPR && res.toDefault) {
        if (proj.meta.clientDeploy?.railwayToken) {
          await new Promise((r) => setTimeout(r, 4000));
          deploy = await approveClientDeploy(proj.meta.clientDeploy).catch(() => null);
        } else if (proj.meta.clientVercel?.token) {
          await new Promise((r) => setTimeout(r, 6000));
          deploy = await vercelDeployStatus(proj.meta.clientVercel).catch(() => null);
        }
      }
      results.push({ ...res, deploy });
    }
    // Прямая доставка в main = публикация в прод. В PR-режиме — нет (ждём мержа дева клиента).
    if (results.some((r) => r.toDefault)) await publishProjectToProd(key).catch(() => {});
    return { results };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/** Текущий статус клиентского деплоя (для повторной проверки). */
export async function checkClientDeploy(key: string): Promise<{ deploy?: DeployStatus | null; error?: string }> {
  try {
    await requireAdmin();
    const proj = await getProjectFull(key);
    if (proj?.meta.clientVercel?.token) return { deploy: await vercelDeployStatus(proj.meta.clientVercel, 0) };
    if (!proj?.meta.clientDeploy) return { error: "Клиентский деплой не настроен (Railway/Vercel)" };
    return { deploy: await clientDeployStatus(proj.meta.clientDeploy) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}
