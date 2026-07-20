"use server";

import { after } from "next/server";
import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/principal";
import { setProjectToken, createProject, generateProjectKey, setProjectMeta, setProjectArchived, getProjectFull, reassignNullReporterToClient, createNotification, devRecipientsForProject } from "@/lib/db";
import { layProtocol, layProtocolAll } from "@/lib/protocol-deploy";
import { notifyLogins, sendTo } from "@/lib/notify";
import { PUBLIC_SITE } from "@/lib/dev-protocol";
import { t, type Locale } from "@/lib/i18n";
import { fieldVisible } from "@/lib/field-visibility";
import { getFieldDef, PROJECT_FIELD_DEFS } from "@/lib/project-fields";
import type { ProjectMeta } from "@/lib/tasks/types";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/** Поля настроек проекта, видимые разработчику; при добавлении контента в них шлём ему уведомление.
 *  Возвращает список изменённых dev-видимых полей с их локализуемыми названиями. */
function devVisibleAdditions(prev: ProjectMeta, next: ProjectMeta): { label: (l: Locale) => string }[] {
  const vis = next.fieldVisibility;
  const norm = (v: unknown): string => (v == null || v === "" ? "" : JSON.stringify(v));
  type Mon = { key: string; prev: unknown; next: unknown; label: (l: Locale) => string };
  const tl = (k: string) => (l: Locale) => t(l, k);
  const mons: Mon[] = [
    { key: "devInfo", prev: prev.devInfo, next: next.devInfo, label: tl("proj.devInfo") },
    { key: "spec", prev: prev.spec, next: next.spec, label: tl("projects.spec") },
    { key: "design", prev: prev.design, next: next.design, label: tl("projects.design") },
    { key: "devUrl", prev: prev.apps?.dev?.url, next: next.apps?.dev?.url, label: tl("projects.devUrl") },
    { key: "prodUrl", prev: prev.apps?.prod?.url, next: next.apps?.prod?.url, label: tl("projects.prodUrl") },
    { key: "devAccounts", prev: prev.devAccounts, next: next.devAccounts, label: tl("proj.accountsDev") },
    { key: "prodAccounts", prev: prev.prodAccounts, next: next.prodAccounts, label: tl("proj.accountsProd") },
    { key: "railway", prev: prev.clientDeploy, next: next.clientDeploy, label: (l) => getFieldDef("railway")?.label[l] ?? "Railway" },
    { key: "vercel", prev: prev.clientVercel, next: next.clientVercel, label: (l) => getFieldDef("vercel")?.label[l] ?? "Vercel" },
  ];
  // Поля каталога (telegram/aiKeys/objectStorage/соцсети…), включённые в проекте.
  for (const def of PROJECT_FIELD_DEFS) {
    if (def.backed) continue; // railway/vercel уже учтены выше
    if (!(next.enabledFields ?? []).includes(def.key)) continue;
    mons.push({ key: def.key, prev: prev.customFields?.[def.key], next: next.customFields?.[def.key], label: (l) => def.label[l] });
  }
  return mons.filter((m) => {
    if (!fieldVisible(vis, m.key, true)) return false; // не видно разрабу — не уведомляем
    const nv = norm(m.next);
    return nv !== "" && nv !== norm(m.prev); // появилось/изменилось содержимое
  });
}

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

/** Тип проекта (наш/клиентский) — переключатель на строке с названием. ON=наш(mine), OFF=клиентский(client). */
export async function setProjectKind(key: string, mine: boolean): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requireAdmin();
    const prev = await getProjectFull(key);
    if (!prev) return { error: "Проект не найден" };
    await setProjectMeta(key, prev.name, { ...prev.meta, projectType: mine ? "mine" : "client" });
    // Стал клиентским → задачи, поставленные мной, переводим на клиента постановщиком.
    if (!mine) await reassignNullReporterToClient(key).catch(() => {});
    revalidatePath(`/admin/projects/${key}`);
    revalidatePath("/admin");
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
    // Тип проекта управляется отдельным переключателем (setProjectKind), форма его НЕ трогает — сохраняем как есть.
    meta.projectType = prev?.meta.projectType;
    // Деплой-креды (Railway/Vercel) форма лишь ОТРАЖАЕТ (проекция customFields.railway/vercel → clientDeploy/clientVercel),
    // а задаются они через deploy-config API/панель. Если форма открыта ДО того, как креды задали out-of-band, её
    // снапшот пустой и автосейв затирал clientDeploy/clientVercel (баг FINE spirit: пропадала автодоставка). Защита:
    // ПУСТАЯ проекция формы НЕ перетирает уже сохранённые креды; непустая (админ реально ввёл) — перезаписывает.
    if (!meta.clientDeploy?.railwayToken && prev?.meta.clientDeploy?.railwayToken) meta.clientDeploy = prev.meta.clientDeploy;
    if (!meta.clientVercel?.token && prev?.meta.clientVercel?.token) meta.clientVercel = prev.meta.clientVercel;
    await setProjectMeta(key, name, meta);
    // Привязали/обновили наш dev-репо → автоматически разложить туда протокол (новые репо подхватываются сами).
    if (meta.devGit) after(() => layProtocol(key));
    // Назначили нового ответственного разработчика → уведомить его.
    if (meta.defaultAssignee && meta.defaultAssignee !== prev?.meta.defaultAssignee) {
      await notifyLogins([meta.defaultAssignee], `📋 <b>Вас назначили ответственным на проект</b> «${name}».\nОткройте портал — детали, доступы и задачи там.`).catch(() => {});
    }
    // Добавили/изменили в настройках поле, видимое разработчику (devInfo, доступы, токены, спека…) — уведомить разрабов
    // проекта НА ИХ ЛОКАЛИ, указав какое поле какого проекта обновилось. Не блокирует сохранение (after()).
    const additions = devVisibleAdditions(prev?.meta ?? {}, meta);
    if (additions.length) {
      after(async () => {
        const recipients = await devRecipientsForProject(key, meta.defaultAssignee ? [meta.defaultAssignee] : []).catch(() => []);
        const link = `${PUBLIC_SITE}/admin/projects/${key}`;
        for (const r of recipients) {
          const loc: Locale = r.lang === "ru" || r.lang === "en" ? r.lang : "uk";
          const fields = additions.map((a) => a.label(loc)).join(", ");
          const title = t(loc, "notif.devFieldAdded", { project: name, fields });
          await createNotification(r.tgId, { projectKey: key, title, link }).catch(() => {});
          await sendTo(r.tgId, title, { text: name, url: link }).catch(() => {});
        }
      });
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
