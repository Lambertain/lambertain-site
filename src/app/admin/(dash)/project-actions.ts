"use server";

import { getPrincipal } from "@/lib/principal";
import { getProjectFull, setProjectMeta, setTaskTags, setProjectGuides, upsertSecret, deleteSecret, deleteProjectCascade, saveProjectAttachment, projectReporterLogin, getGuide, setClientAction } from "@/lib/db";
import { getBackend } from "@/lib/tasks";
import { decomposeSpec, type KickoffTask } from "@/lib/kickoff";
import { notifyLogins, notifyProjectClients, taskTag } from "@/lib/notify";
import { PORTAL_BASE } from "@/lib/dev-protocol";
import { getSpec, projectSpecText, upsertSpec, removeSpec } from "@/lib/specs";
import { revalidatePath } from "next/cache";

type Cred = { role?: string; env?: string; login?: string; pass?: string };

/** Сохранить аккаунты входа проекта. Право: админ или разработчик-ответственный проекта. */
export async function saveCredentials(projectKey: string, credentials: Cred[]): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  const p = await getProjectFull(projectKey);
  if (!p) return { error: "Проект не найден" };
  const allowed = me.realRole === "admin" || (me.role === "contributor" && p.meta.defaultAssignee === me.youtrackLogin);
  if (!allowed) return { error: "Нет прав" };
  try {
    const clean = credentials
      .map((c) => ({ role: c.role?.trim() || undefined, env: c.env?.trim() || undefined, login: c.login?.trim() || undefined, pass: c.pass?.trim() || undefined }))
      .filter((c) => c.role || c.login || c.pass || c.env);
    await setProjectMeta(projectKey, p.name, { ...p.meta, credentials: clean });
    revalidatePath("/admin");
    revalidatePath(`/admin/projects/${projectKey}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/** Загрузить файл в «Інфо для розробника» (проектное вложение, не привязано к задаче). Возвращает url для markdown. Admin. */
export async function uploadProjectFile(projectKey: string, file: { mime: string; data: string; name: string }): Promise<{ url?: string; name?: string; error?: string }> {
  const me = await getPrincipal();
  if (!me || me.realRole !== "admin") return { error: "Нет прав" };
  if (!file?.data) return { error: "Пустой файл" };
  const id = await saveProjectAttachment(projectKey, file.mime || "application/octet-stream", file.data, file.name || "file");
  if (id == null) return { error: "Проект не найден" };
  return { url: `/api/files/${id}`, name: file.name || "file" };
}

/** Включить клиенту набор гайдов на проекте. Admin. */
export async function saveProjectGuides(projectKey: string, guideIds: number[]): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me || me.realRole !== "admin") return { error: "Нет прав" };
  await setProjectGuides(projectKey, guideIds);
  revalidatePath(`/admin/projects/${projectKey}`);
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Создать клиенту задачу из гайда (в любой момент проекта). Задача попадает в «Потрібна ваша дія» клиента,
 * ему уходит пуш в Telegram. Гайд показывается как инструкция; если гайд собирает данные (collect_field) —
 * под задачей поле ввода, значение сохраняется в настройки проекта (см. markClientActionDone → saveGuideCollectValue).
 * autoDone: при выполнении/«Готово» задача сразу закрывается (это действие клиента, дев-работы нет). Admin.
 */
export async function createGuideTask(projectKey: string, guideId: number, collectField?: string | null): Promise<{ ok?: boolean; taskId?: string; error?: string }> {
  const me = await getPrincipal();
  if (!me || me.realRole !== "admin") return { error: "Нет прав" };
  const proj = await getProjectFull(projectKey);
  if (!proj) return { error: "Проект не найден" };
  const guide = await getGuide(guideId);
  if (!guide) return { error: "Гайд не найден" };
  // Какое поле проекта соберёт клиент: явный выбор в блоке «Гайды клиенту» (может переопределить дефолт гайда),
  // либо (если не передано) — collect_field, заданный в редакторе гайда. Пустая строка = «не собирать».
  const collect = collectField === undefined ? (guide.collect_field ?? null) : (collectField || null);
  const be = getBackend();
  const clientLogin = await projectReporterLogin(projectKey);
  const task = await be.createTask({
    projectKey,
    summary: guide.title,
    description: "",
    assigneeLogin: null,
    reporterLogin: clientLogin,
    approvalStatus: "approved",
    autoDone: true,        // выполнил клиент → сразу Done (нет дев-работы/ревью)
    clientVerifiable: false,
    internal: false,
  });
  const prompt = collect
    ? "Виконайте інструкцію та впишіть дані нижче."
    : "Виконайте інструкцію та натисніть «Готово».";
  await setClientAction(task.id, prompt, guideId, collect);
  await notifyProjectClients(
    projectKey,
    `📋 <b>Потрібна ваша дія</b> · ${await taskTag(task.id)}: ${guide.title}\nВідкрийте задачу — там інструкція${collect ? " і поле для даних" : ""}.`,
    [], { text: "Відкрити задачу", url: `${PORTAL_BASE}/admin/tasks/${task.id}` },
  ).catch(() => {});
  revalidatePath("/admin");
  revalidatePath(`/admin/projects/${projectKey}`);
  return { ok: true, taskId: task.id };
}

/**
 * Старт проекта одной кнопкой: берём СОХРАНЁННУЮ спеку проекта (`meta.spec`), разбиваем на задачи и СРАЗУ создаём
 * (с зависимостями, тегами, assign на ответственного). Без превью/апрува и без второго поля спеки. Admin.
 */
export async function kickoffFromSpec(projectKey: string, specKey?: string): Promise<{ created?: number; error?: string }> {
  const me = await getPrincipal();
  if (!me || me.realRole !== "admin") return { error: "Нет прав" };
  const p = await getProjectFull(projectKey);
  if (!p) return { error: "Проект не найден" };
  // specKey — разбить ОДНУ спеку (модуль/фазу); иначе — всю спеку проекта.
  const one = specKey ? getSpec(p.meta, specKey) : null;
  if (specKey && !one) return { error: "Спека не найдена" };
  const spec = (one ? `# ${one.title}\n\n${one.body}` : projectSpecText(p.meta)).trim();
  if (!spec) return { error: "Сначала добавьте и сохраните спеку." };
  const decompName = one ? `${p.name} — ${one.title}` : p.name;
  const be = getBackend();
  // Первый ли это kickoff проекта: задачи уже есть (следующий модуль) → дизайн-систему заново не создаём
  // (одна на продукт) и повторное «проєкт розбито» не шлём.
  const hadTasks = (await be.listTasks({ projectKey, limit: 1 })).length > 0;
  try {
    const tasks: KickoffTask[] = await decomposeSpec(spec, decompName, { includeDesignSystem: !hadTasks });
    if (!tasks.length) return { error: "Не удалось разбить спеку на задачи" };
    const assignee = p.meta.defaultAssignee || null;
    // Постановщик задач проекта — КЛИЕНТ (его проект, он принимает результат). Нет клиента → null.
    const clientLogin = await projectReporterLogin(projectKey);
    const ids: string[] = [];
    for (const tk of tasks) {
      const task = await be.createTask({
        projectKey,
        summary: tk.summary,
        description: tk.description || "",
        assigneeLogin: assignee,
        reporterLogin: clientLogin,
        approvalStatus: "approved",
        autoDone: false, // клиент-постановщик принимает результат сам
      });
      await setTaskTags(task.id, { type: tk.type, complexity: tk.complexity, skills: (Array.isArray(tk.skills) ? tk.skills : []).filter(Boolean) });
      ids.push(task.id);
    }
    // Блокеры НЕ ставим: задачи созданы в порядке выполнения (по номерам) — разработчик делает их подряд.
    // Уведомление о заведении задач — ОДНО на проект (только при первом kickoff). Дальше — по каждой
    // задаче отдельно, когда её берут в работу (см. dev/status и admin/task-status).
    if (!hadTasks && assignee) await notifyLogins([assignee], `🆕 <b>${p.name}</b>: проєкт розбито на задачі. Бери ПО ПОРЯДКУ (за номерами), не чекай приймання попередньої.`).catch(() => {});
    if (!hadTasks && clientLogin) await notifyProjectClients(projectKey, `🚀 <b>${p.name}</b>: узялися за ваш проєкт — розклали його на задачі. Повідомлятимемо окремо, щойно братимемо кожну задачу в роботу.`).catch(() => {});
    revalidatePath("/admin");
    revalidatePath(`/admin/projects/${projectKey}`);
    return { created: ids.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка декомпозиции/создания" };
  }
}

/** Сохранить (upsert) одну спеку проекта (модуль/фаза) — не дописывается в существующие. Admin. */
export async function saveSpec(projectKey: string, spec: { key?: string; title: string; body: string }): Promise<{ ok?: boolean; key?: string; error?: string }> {
  const me = await getPrincipal();
  if (!me || me.realRole !== "admin") return { error: "Нет прав" };
  const p = await getProjectFull(projectKey);
  if (!p) return { error: "Проект не найден" };
  const title = spec.title.trim();
  if (!title) return { error: "Укажите заголовок спеки" };
  try {
    const meta = upsertSpec(p.meta, { key: spec.key, title, body: spec.body }, new Date().toISOString());
    await setProjectMeta(projectKey, p.name, meta);
    const saved = (meta.specs ?? []).find((s) => s.title === title && s.body === spec.body);
    revalidatePath(`/admin/projects/${projectKey}`);
    return { ok: true, key: saved?.key };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/** Удалить одну спеку проекта по ключу. Admin. */
export async function deleteProjectSpec(projectKey: string, key: string): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me || me.realRole !== "admin") return { error: "Нет прав" };
  const p = await getProjectFull(projectKey);
  if (!p) return { error: "Проект не найден" };
  try {
    await setProjectMeta(projectKey, p.name, removeSpec(p.meta, key));
    revalidatePath(`/admin/projects/${projectKey}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/** Полное удаление проекта (только админ; подтверждается вводом названия на клиенте). */
export async function deleteProject(projectKey: string, confirmName: string): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me || me.realRole !== "admin") return { error: "Нет прав" };
  const p = await getProjectFull(projectKey);
  if (!p) return { error: "Проект не найден" };
  if (confirmName.trim() !== p.name.trim()) return { error: "Название не совпадает" };
  await deleteProjectCascade(projectKey);
  revalidatePath("/admin/projects");
  revalidatePath("/admin");
  return { ok: true };
}

// ——— Секреты проекта (только админ; разработчик-человек не видит) ———
export async function saveSecret(projectKey: string, input: { name: string; value: string; note?: string; env?: string }): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me || me.realRole !== "admin") return { error: "Нет прав" };
  if (!input.name.trim()) return { error: "Назва порожня" };
  await upsertSecret(projectKey, { name: input.name, value: input.value || null, note: input.note || null, env: input.env || null, filledBy: "admin" });
  revalidatePath(`/admin/projects/${projectKey}`);
  return { ok: true };
}
export async function removeSecret(projectKey: string, id: number): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me || me.realRole !== "admin") return { error: "Нет прав" };
  await deleteSecret(id);
  revalidatePath(`/admin/projects/${projectKey}`);
  return { ok: true };
}
