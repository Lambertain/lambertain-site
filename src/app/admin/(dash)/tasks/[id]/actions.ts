"use server";

import { getPrincipal, isSuperAdmin } from "@/lib/principal";
import { getBackend } from "@/lib/tasks";
import { draftClientMessage } from "@/lib/replies";
import { submitForModeration, approveModeratedComment, editModeratedComment, rejectToInternal, editOwnPending, editOwnPublished, deleteOwnPublished, discardOwnPending, deleteCommentAny, editCommentAny, makeCommentClientVisible } from "@/lib/moderation";
import { PORTAL_BASE } from "@/lib/dev-protocol";
import { updateTaskFields, saveAttachment, setOwnerAction, setClientAction, upsertSecret, getProjectFull, getProjectEmployees, assignTask, projectHasClient, getDevCommentForTask, enableProjectFieldValue } from "@/lib/db";
import { notifyLogins, notifyProjectClients, notifyAdmin, attachmentIdsIn, taskTag } from "@/lib/notify";
import { statusBucket } from "@/lib/statuses";
import { clientStepFromAction, generateGuide } from "@/lib/handoff-classify";
import { autoDeliverAndNotify } from "@/lib/auto-deliver";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

/**
 * Переназначить ops-шаг задачи на КЛИЕНТА (супер-админ). Случай: задачу/эскалацию завели, когда клиента ещё не было,
 * и шаг ушёл владельцу (owner_action), хотя часть — клиентская (зарегистрировать сервис/прислать токен).
 * Извлекает клиентскую часть простым языком + гайд из каталога + поле для данных, шлёт клиенту, снимает owner-флаг.
 */
export async function handStepToClient(taskId: string): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!isSuperAdmin(me)) return { error: "Нет прав" };
  try {
    const be = getBackend();
    const task = await be.getTask(taskId);
    const source = (task.ownerAction || task.clientAction || "").trim();
    if (!source) return { error: "Нет шага для передачи клиенту" };
    if (!(await projectHasClient(task.projectKey))) return { error: "В проекте нет клиента" };
    const proj = await getProjectFull(task.projectKey).catch(() => null);
    const { short, text, guideId } = await clientStepFromAction(source, { summary: task.summary, projectSpec: proj?.meta.spec });
    const gid = guideId ?? (await generateGuide(short).catch(() => null));
    await setClientAction(taskId, text, gid);
    await setOwnerAction(taskId, null); // снять owner-флаг — теперь это действие клиента
    await be.addComment(taskId, `🔑 <b>Потрібно зареєструвати / надати доступ:</b> ${short}\n\nІнструкція та поле для даних — під заголовком задачі. Після реєстрації впишіть дані та натисніть «Готово».`, "client", undefined, true, false).catch(() => {});
    await notifyProjectClients(task.projectKey, `🔑 <b>Потрібна ваша дія</b> · ${await taskTag(taskId)}\nПотрібно зареєструвати: ${short}\nВідкрийте задачу — там покрокова інструкція і поле для даних.`, [], { text: "Відкрити задачу", url: `${PORTAL_BASE}/admin/tasks/${taskId}` }).catch(() => {});
    revalidatePath(`/admin/tasks/${taskId}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

export async function addTaskComment(
  id: string,
  text: string,
  visibleToClient?: boolean,
  attachments?: { localId: string; mime: string; data: string; name: string; image: boolean }[],
): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  if (!text.trim() && !attachments?.length) return { error: "Пустой комментарий" };
  // Клиент всегда пишет клиент-видимый коммент. Сотрудник в проекте БЕЗ клиента приравнивается к клиенту
  // (он — пользователь/постановщик, фидбечит; не на стороне разраба) → его коммент тоже клиент-видимый, без модерации.
  // Остальная команда (разраб/админ) выбирает: по умолчанию внутренний.
  const clientSide = me.role === "client" || (me.role === "employee" && !(await projectHasClient(id.split("-")[0])));
  const visibility: "client" | "internal" = clientSide ? "client" : visibleToClient ? "client" : "internal";
  try {
    // Сохраняем вложения и подставляем реальные ссылки вместо маркеров att:<localId>.
    let body = text;
    for (const a of attachments ?? []) {
      const aid = await saveAttachment(id, a.mime, a.data, a.name);
      if (aid) body = body.replaceAll(`att:${a.localId}`, `/api/files/${aid}`);
    }
    // Модерация: клиент-видимый коммент от команды (кроме супер-админа) → полиш в агентский голос + pending,
    // клиент не видит и без пуша до апрува Никиты.
    if (!clientSide && visibility === "client" && !isSuperAdmin(me)) {
      try {
        const [task, history] = await Promise.all([getBackend().getTask(id), getBackend().getComments(id)]);
        const polished = (await draftClientMessage(task, body, history)) || body;
        await submitForModeration(id, polished, { authorLogin: me.youtrackLogin, taskSummary: task.summary });
      } catch {
        await submitForModeration(id, body, { authorLogin: me.youtrackLogin });
      }
      revalidatePath(`/admin/tasks/${id}`);
      return { ok: true };
    }
    // Автор коммента = текущий член (по логину); супер-админ без логина → Lambertain. Клиент видит команду как «Lambertain» (маскируется при выводе).
    await getBackend().addComment(id, body, visibility, me.youtrackLogin);
    revalidatePath(`/admin/tasks/${id}`);
    // Клиент (или сотрудник-как-клиент) ответил → вернуть задачу в работу, если она была заблокирована
    // (ответ на эскалацию) ИЛИ уже завершена (DEV-19: новый коммент на Done — задача не должна висеть закрытой).
    if (clientSide) {
      try {
        const t = await getBackend().getTask(id);
        const bucket = statusBucket(t.state);
        if (bucket === "blocked" || bucket === "done") await getBackend().updateStatus(id, "In Progress");
      } catch { /* best-effort */ }
    }
    // Уведомления (best-effort): адресно по ролям + картинки задачи.
    try {
      const task = await getBackend().getTask(id);
      const imgs = attachmentIdsIn(body, task.description);
      const projName = (await getBackend().listProjects().catch(() => [])).find((p) => p.key === task.projectKey)?.name || task.projectKey;
      const openBtn = { text: "Відкрити задачу", url: `${PORTAL_BASE}/admin/tasks/${id}` };
      // me.tgId — автор: ему не шлём пуш о СВОЁМ комменте (ни одним из каналов).
      const authorTg = me.tgId;
      if (clientSide) {
        // Клиент (или сотрудник-как-клиент) написал → ответственному разработчику + админу.
        await notifyLogins(task.assignee?.login ? [task.assignee.login] : [], `💬 <b>Клиент</b> · ${projName} · ${id}: ${task.summary}\n${body.slice(0, 400)}`, imgs, openBtn, authorTg);
        await notifyAdmin(`💬 <b>Вопрос клиента</b> · ${projName} · ${id}: ${task.summary}`, openBtn, authorTg);
      } else if (visibility === "client") {
        // Команда ответила клиенту → клиенту/сотруднику проекта.
        await notifyProjectClients(task.projectKey, `💬 <b>${projName} · ${id}</b>: ${task.summary}\n${body.slice(0, 400)}`, imgs, openBtn, authorTg);
      } else if (task.assignee?.login && task.assignee.login !== me.youtrackLogin) {
        // Внутренний коммент → ответственному разработчику.
        await notifyLogins([task.assignee.login], `📝 <b>${projName} · ${id}</b> (внутр.): ${body.slice(0, 300)}`, imgs, openBtn, authorTg);
      }
    } catch {
      // уведомления не должны валить коммент
    }
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/** Автор (разработчик/команда) правит СВОЙ коммент, пока он на модерации (до публикации). */
export async function editPendingComment(commentId: string, taskId: string, text: string): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me || me.role === "client") return { error: "Нет прав" };
  const r = await editOwnPending(commentId, me.youtrackLogin || "", text);
  revalidatePath(`/admin/tasks/${taskId}`);
  return "error" in r ? { error: r.error } : { ok: true };
}

/** Клиент (или админ) подтверждает действие по client_action: данные → секреты, задача возвращается разработчику. */
export async function markClientActionDone(taskId: string, data: string): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me || (me.role !== "client" && me.realRole !== "admin")) return { error: "Нет прав" };
  const be = getBackend();
  const task = await be.getTask(taskId);
  if (!task.clientAction) return { error: "Действие уже выполнено" };
  const projectKey = taskId.split("-")[0];
  const proj = await getProjectFull(projectKey);
  const value = (data || "").trim();
  // Данные (токен/логины), которые ввёл клиент → деву (видит админ + Claude-код в /api/dev/secrets).
  if (value) {
    const fk = task.clientActionField; // "fieldKey.subKey" — если задан, кладём в structured-поле каталога
    if (fk && fk.includes(".")) {
      const [k, s] = fk.split(".");
      await enableProjectFieldValue(projectKey, k, s, value);
    } else {
      await upsertSecret(projectKey, { name: `Реєстрація · ${taskId}`, value, note: task.clientAction.slice(0, 300), filledBy: "client" });
    }
  }
  await setClientAction(taskId, null, null, null);
  await be.addComment(taskId, `✅ <b>Клієнт виконав реєстрацію.</b>${value ? " Дані надано." : ""}`, "client").catch(() => {});
  // Возвращаем разработчику: уведомляем ответственного, он продолжает (данные — в /api/dev/secrets).
  const dev = proj?.meta.defaultAssignee;
  if (dev) await notifyLogins([dev], `🔑 <b>Клієнт надав дані</b> · ${await taskTag(taskId)}: ${task.summary}\nПродовжуй — секрети в /api/dev/secrets.`).catch(() => {});
  await notifyAdmin(`✅ <b>Клиент выполнил регистрацию</b> · ${await taskTag(taskId)}: ${task.summary}`).catch(() => {});
  revalidatePath(`/admin/tasks/${taskId}`);
  return { ok: true };
}

/** Клиент делегирует задачу одному из сотрудников своего проекта (assignee + уведомление). */
export async function delegateTask(taskId: string, employeeLogin: string): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me || me.role !== "client") return { error: "Нет прав" };
  const projectKey = taskId.split("-")[0];
  const emps = await getProjectEmployees(projectKey);
  const emp = emps.find((e) => e.login === employeeLogin);
  if (!emp) return { error: "Сотрудник не найден в проекте" };
  await assignTask(taskId, employeeLogin);
  const be = getBackend();
  const task = await be.getTask(taskId).catch(() => null);
  await notifyLogins([employeeLogin], `📋 <b>Вам делеговано задачу</b> · ${await taskTag(taskId)}: ${task?.summary ?? ""}\n${PORTAL_BASE}/admin/tasks/${taskId}`).catch(() => {});
  await be.addComment(taskId, `➡️ <i>Делеговано співробітнику: ${emp.fullName}.</i>`, "internal").catch(() => {});
  revalidatePath(`/admin/tasks/${taskId}`);
  return { ok: true };
}

/** Автор правит СВОЙ опубликованный коммент, пока на него не ответили (клиент тоже может). */
export async function editPublishedComment(commentId: string, taskId: string, text: string): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me || !me.youtrackLogin) return { error: "Нет прав" };
  const r = await editOwnPublished(commentId, me.youtrackLogin, text);
  revalidatePath(`/admin/tasks/${taskId}`);
  return "error" in r ? { error: r.error } : { ok: true };
}

/** Автор удаляет СВОЙ опубликованный коммент, пока на него не ответили. */
export async function deletePublishedComment(commentId: string, taskId: string): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me || !me.youtrackLogin) return { error: "Нет прав" };
  const r = await deleteOwnPublished(commentId, me.youtrackLogin);
  revalidatePath(`/admin/tasks/${taskId}`);
  return "error" in r ? { error: r.error } : { ok: true };
}

/** Автор удаляет СВОЙ коммент, пока он на модерации. */
export async function discardPendingComment(commentId: string, taskId: string): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me || me.role === "client") return { error: "Нет прав" };
  const r = await discardOwnPending(commentId, me.youtrackLogin || "");
  revalidatePath(`/admin/tasks/${taskId}`);
  return "error" in r ? { error: r.error } : { ok: true };
}

/** Владелец выполнил ops-шаг (деплой/регистрация/токен) → снять флаг и продвинуть задачу (Done если autoDone, иначе Review). */
export async function markOwnerActionDone(taskId: string): Promise<{ ok?: boolean; error?: string }> {
  if (!isSuperAdmin(await getPrincipal())) return { error: "Нет прав" };
  await setOwnerAction(taskId, null);
  const task = await getBackend().getTask(taskId).catch(() => null);
  await getBackend().updateStatus(taskId, task?.autoDone ? "Done" : "Review").catch(() => {});
  revalidatePath(`/admin/tasks/${taskId}`);
  return { ok: true };
}

/** Супер-админ удаляет любой коммент (опубликованный или на модерации). */
export async function superDeleteComment(commentId: string, taskId: string): Promise<{ ok?: boolean; error?: string }> {
  if (!isSuperAdmin(await getPrincipal())) return { error: "Нет прав" };
  await deleteCommentAny(commentId);
  revalidatePath(`/admin/tasks/${taskId}`);
  return { ok: true };
}

/** Супер-админ редактирует любой коммент (в т.ч. свой — у него нет member-логина для «правки своего»). */
export async function superEditComment(commentId: string, taskId: string, text: string, visibleToClient?: boolean): Promise<{ ok?: boolean; error?: string }> {
  if (!isSuperAdmin(await getPrincipal())) return { error: "Нет прав" };
  // visibleToClient — перевести внутренний коммент в видимый клиенту (опубликовать + уведомить); иначе просто правка текста.
  const r = visibleToClient ? await makeCommentClientVisible(commentId, text) : await editCommentAny(commentId, text);
  revalidatePath(`/admin/tasks/${taskId}`);
  return "error" in r ? { error: r.error } : { ok: true };
}

/**
 * DEV-7: правка/удаление комментов Клода (dev_authored) разработчиком/админом из вебинтерфейса.
 * Доступ: супер-админ, админ или контрибутор-ответственный этого проекта (defaultAssignee).
 */
async function canManageDevComment(me: NonNullable<Awaited<ReturnType<typeof getPrincipal>>>, projectKey: string): Promise<boolean> {
  if (isSuperAdmin(me) || me.role === "admin") return true;
  if (me.role === "contributor" && me.youtrackLogin) {
    const proj = await getProjectFull(projectKey).catch(() => null);
    return proj?.meta.defaultAssignee === me.youtrackLogin;
  }
  return false;
}

export async function devEditComment(commentId: string, taskId: string, text: string): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Нет прав" };
  if (!text.trim()) return { error: "Пусто" };
  const meta = await getDevCommentForTask(Number(commentId), taskId);
  if (!meta) return { error: "Это не коммент Клода" };
  if (!(await canManageDevComment(me, meta.projectKey))) return { error: "Нет прав" };
  const r = await editCommentAny(commentId, text);
  revalidatePath(`/admin/tasks/${taskId}`);
  return "error" in r ? { error: r.error } : { ok: true };
}

export async function devDeleteComment(commentId: string, taskId: string): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Нет прав" };
  const meta = await getDevCommentForTask(Number(commentId), taskId);
  if (!meta) return { error: "Это не коммент Клода" };
  if (!(await canManageDevComment(me, meta.projectKey))) return { error: "Нет прав" };
  await deleteCommentAny(commentId);
  revalidatePath(`/admin/tasks/${taskId}`);
  return { ok: true };
}

/** Модерация (супер-админ): одобрить pending-коммент → публикуется клиенту + пуш. */
export async function moderateApprove(commentId: string, taskId: string): Promise<{ ok?: boolean; error?: string }> {
  if (!isSuperAdmin(await getPrincipal())) return { error: "Нет прав" };
  const r = await approveModeratedComment(commentId);
  revalidatePath(`/admin/tasks/${taskId}`);
  return "error" in r ? r : { ok: true };
}

/** Модерация (супер-админ): отредактировать и сразу одобрить. */
export async function moderateEdit(commentId: string, taskId: string, text: string): Promise<{ ok?: boolean; error?: string }> {
  if (!isSuperAdmin(await getPrincipal())) return { error: "Нет прав" };
  const r = await editModeratedComment(commentId, text);
  revalidatePath(`/admin/tasks/${taskId}`);
  return "error" in r ? r : { ok: true };
}

/** Модерация (супер-админ): отклонить клиент-facing коммент, оставив его ВНУТРЕННИМ (текст остаётся в треде, клиент не видит). */
export async function moderateReject(commentId: string, taskId: string): Promise<{ ok?: boolean; error?: string }> {
  if (!isSuperAdmin(await getPrincipal())) return { error: "Нет прав" };
  await rejectToInternal(commentId);
  revalidatePath(`/admin/tasks/${taskId}`);
  return { ok: true };
}

/**
 * Постановщик проверил задачу в «Ревью»: принять (→ Готово) или вернуть на доработку (→ Доработка).
 * Право: автор задачи (reporter) или админ.
 */
export async function reviewTask(id: string, accept: boolean, note?: string): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  const be = getBackend();
  try {
    const task = await be.getTask(id);
    const isReporter = !!me.youtrackLogin && task.reporter?.login === me.youtrackLogin;
    if (me.realRole !== "admin" && !isReporter) return { error: "Нет прав" };
    if (accept) {
      await be.updateStatus(id, "Done");
      if (task.assignee?.login) await notifyLogins([task.assignee.login], `✅ <b>Принято</b> · ${await taskTag(id)}: ${task.summary}`).catch(() => {});
      // Автодоставка dev→client при приёмке (если включён флаг проекта). Фоном — не блокируем экшен.
      const proj = await getProjectFull(task.projectKey).catch(() => null);
      if (proj?.meta?.autoDeliver) {
        const meta = proj.meta;
        after(() => autoDeliverAndNotify(task.projectKey, meta, id));
      }
    } else {
      await be.updateStatus(id, "Rework");
      if (note?.trim()) await be.addComment(id, `🔧 <b>На доработку:</b>\n\n${note.trim()}`, "internal");
      if (task.assignee?.login) await notifyLogins([task.assignee.login], `🔧 <b>На доработку</b> · ${await taskTag(id)}: ${task.summary}${note?.trim() ? `\n${note.trim().slice(0, 300)}` : ""}`).catch(() => {});
    }
    revalidatePath(`/admin/tasks/${id}`);
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

/** Редактировать задачу (admin): заголовок, текст запроса, исполнитель, приоритет. */
export async function editTask(
  id: string,
  fields: { summary?: string; description?: string; assigneeLogin?: string | null; priority?: string | null },
): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me || me.realRole !== "admin") return { error: "Нет прав" };
  try {
    await updateTaskFields(id, {
      title: fields.summary,
      description: fields.description,
      assigneeLogin: fields.assigneeLogin,
      priority: fields.priority,
    });
    revalidatePath(`/admin/tasks/${id}`);
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}


