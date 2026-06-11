"use server";

import { requireAdmin } from "@/lib/principal";
import { getProjectFull } from "@/lib/db";
import { previewDelivery, deliverDevToClient, approveClientDeploy, clientDeployStatus, type DeliveryPreview, type DeployStatus } from "@/lib/deliver";

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
): Promise<{ result?: DeliverResultUI; error?: string }> {
  try {
    await requireAdmin();
    const proj = await getProjectFull(key);
    if (!proj) return { error: "Проект не найден" };

    const preview = await previewDelivery({ devGit: proj.meta.devGit, clientGit: proj.meta.clientGit });
    if (preview.schemaChanges.length > 0 && !schemaConfirmed) {
      return { error: `Схема БД изменилась (${preview.schemaChanges.length}). Накати миграцию на клиентскую БД и подтверди.` };
    }

    const res = await deliverDevToClient({
      devGit: proj.meta.devGit,
      clientGit: proj.meta.clientGit,
      targetBranch: targetBranch || preview.clientDefaultBranch,
      message: `Lambertain delivery — ${new Date().toISOString().slice(0, 10)}`,
    });

    let deploy: DeployStatus | null = null;
    if (res.toDefault && proj.meta.clientDeploy?.railwayToken) {
      // Дать Railway секунду создать деплой из пуша, затем апрув + мониторинг.
      await new Promise((r) => setTimeout(r, 4000));
      deploy = await approveClientDeploy(proj.meta.clientDeploy).catch(() => null);
    }

    return { result: { ...res, deploy } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/** Текущий статус клиентского деплоя (для повторной проверки). */
export async function checkClientDeploy(key: string): Promise<{ deploy?: DeployStatus | null; error?: string }> {
  try {
    await requireAdmin();
    const proj = await getProjectFull(key);
    if (!proj?.meta.clientDeploy) return { error: "Клиентский Railway не настроен" };
    return { deploy: await clientDeployStatus(proj.meta.clientDeploy) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}
