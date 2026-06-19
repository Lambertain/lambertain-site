"use server";

import { after } from "next/server";
import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/principal";
import { setProjectToken, createProject, generateProjectKey, setProjectMeta, setProjectArchived, getProjectFull, reassignNullReporterToClient } from "@/lib/db";
import { layProtocol, layProtocolAll } from "@/lib/protocol-deploy";
import { notifyLogins } from "@/lib/notify";
import type { ProjectMeta } from "@/lib/tasks/types";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function generateProjectToken(projectKey: string): Promise<{ token?: string; error?: string }> {
  try {
    await requireAdmin();
    if (!projectKey) return { error: "no project" };
    const token = `pk_${randomBytes(20).toString("hex")}`;
    await setProjectToken(projectKey, token);
    revalidatePath(`/admin/projects/${projectKey}`);
    return { token };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

export async function addProject(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Укажите название" };
  const key = await generateProjectKey(name);
  await createProject(key, name);
  redirect(`/admin/projects/${key}`);
}

export async function archiveProject(key: string, archived: boolean): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requireAdmin();
    await setProjectArchived(key, archived);
    revalidatePath("/admin/projects");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

export async function saveMeta(
  key: string,
  name: string,
  meta: ProjectMeta,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requireAdmin();
    const prev = await getProjectFull(key);
    await setProjectMeta(key, name, meta);
    // Привязали/обновили наш dev-репо → автоматически разложить туда протокол (новые репо подхватываются сами).
    if (meta.devGit) after(() => layProtocol(key));
    // Назначили нового ответственного разработчика → уведомить его.
    if (meta.defaultAssignee && meta.defaultAssignee !== prev?.meta.defaultAssignee) {
      await notifyLogins([meta.defaultAssignee], `📋 <b>Вас назначили ответственным на проект</b> «${name}».\nОткройте портал — детали, доступы и задачи там.`).catch(() => {});
    }
    // Отметили проект клиентским (и клиент уже есть) → задачи, поставленные мной, переводим на клиента постановщиком.
    if (meta.projectType === "client") await reassignNullReporterToClient(key).catch(() => {});
    revalidatePath("/admin");
    revalidatePath(`/admin/projects/${key}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/** Обновить протокол во всех наших дев-репо (после изменения текста протокола). Admin. */
export async function redistributeProtocol(): Promise<{ updated?: number; results?: { key: string; status: string; detail?: string }[]; error?: string }> {
  try {
    await requireAdmin();
    const results = await layProtocolAll();
    return { updated: results.filter((r) => r.status === "updated").length, results: results.map((r) => ({ key: r.key, status: r.status, detail: r.detail })) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}
