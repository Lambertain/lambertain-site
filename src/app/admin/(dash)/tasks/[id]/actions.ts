"use server";

import { getPrincipal, isSuperAdmin } from "@/lib/principal";
import { getBackend } from "@/lib/tasks";
import { draftClientMessage } from "@/lib/replies";
import { submitForModeration, approveModeratedComment, editModeratedComment, rejectToInternal, editOwnPending, editOwnPublished, deleteOwnPublished, discardOwnPending, deleteCommentAny, editCommentAny, makeCommentClientVisible } from "@/lib/moderation";
import { PORTAL_BASE } from "@/lib/dev-protocol";
import { updateTaskFields, saveAttachment, setOwnerAction, setClientAction, upsertSecret, getProjectFull, getProjectEmployees, getAdmins, assignTask, projectHasClient, getDevCommentForTask, enableProjectFieldValue, reopenDeployStage } from "@/lib/db";
import { notifyLogins, notifyProjectClients, notifyAdmin, attachmentIdsIn, taskTag } from "@/lib/notify";
import { statusBucket } from "@/lib/statuses";
import { clientStepFromAction, generateGuide } from "@/lib/handoff-classify";
import { autoDeliverAndNotify } from "@/lib/auto-deliver";
import { syncTaskToTrello, mirrorCommentToTrello } from "@/lib/trello";
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

/**
 * DEV-47: чистая благодарность/подтверждение (без запроса правок)? Коммент замовника под ПРИНЯТОЙ
 * (Done) задачей не должен авто-возвращать её в работу, если это просто «дякую / працює як треба».
 * Консервативно: ack = есть маркер благодарности/подтверждения И нет маркера запроса/проблемы/вопроса
 * И коротко И без вложений (скрин обычно = свидетельство проблемы). Default (не распознали) = НЕ ack →
 * прежнее поведение (вернуть в работу), чтобы реальные правки НЕ терялись. uk/ru/en, стемы + токены.
 */
function isAcknowledgement(text: string, hasAttachments: boolean): boolean {
  if (hasAttachments) return false;
  const t = text.replace(/<[^>]+>/g, " ").replace(/\/api\/files\/\d+/g, " ").replace(/att:[\w-]+/g, " ").trim().toLowerCase();
  if (!t || t.length > 250) return false;
  if (t.includes("?")) return false;
  // Явные маркеры запроса/проблемы (фразы + токены). НЕ включаем модальные треба/потрібно/нужно/надо —
  // они амбивалентны («працює як потрібно» = подтверждение, а не запрос).
  if (/(не працює|не работает|не пашет|перестал|does ?n'?t|not work)/i.test(t)) return false;
  const words = new Set(t.split(/[^a-zа-яёіїєґ0-9]+/iu).filter(Boolean));
  const REQ = ["але", "однак", "проте", "но", "однако", "ще", "еще", "також", "также",
    "добав", "добавь", "додай", "додати", "дороби", "доробити", "зроби", "зробіть", "зробити",
    "сделай", "сделать", "виправ", "виправте", "виправити", "исправь", "исправить", "поправ", "поправь", "поправити",
    "переробити", "переделай", "перероби", "помилка", "помилки", "помилку", "ошибка", "ошибки", "ошибку",
    "баг", "баги", "bug", "bugs", "error", "issue", "проблема", "проблеми", "проблему", "проблемы",
    "fix", "add", "change", "змінити", "изменить", "чому", "почему"];
  if (REQ.some((w) => words.has(w))) return false;
  const GRAT = ["дякую", "дяки", "дякуємо", "дякуючи", "спасибо", "спасибі", "вдячний", "вдячна", "вдячні",
    "thanks", "thank", "thx", "супер", "чудово", "класно", "відмінно", "отлично", "прекрасно", "прекрасно",
    "працює", "запрацювало", "запрацював", "заработало", "работает", "works", "прийнято", "принято",
    "нарешті", "наконец", "ок", "окей", "ok", "okay"];
  const gratWord = GRAT.some((w) => words.has(w));
  const gratEmoji = /[👍🙏❤✅🔥😊🙂]|все ок|всё ок|все добре|все гаразд|все супер|как треба|як треба|як потрібно/i.test(t);
  return gratWord || gratEmoji;
}

export async function addTaskComment(
  id: string,
  text: string,
  visibleToClient?: boolean,
  attachments?: { localId: string; mime: string; data: string; name: string; image: boolean }[],
  hideFromDev?: boolean,
): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  if (!text.trim() && !attachments?.length) return { error: "Пустой комментарий" };
  // Клиент всегда пишет клиент-видимый коммент. Сотрудник в проекте БЕЗ клиента приравнивается к клиенту
  // (он — пользователь/постановщик, фидбечит; не на стороне разраба) → его коммент тоже клиент-видимый, без модерации.
  // Остальная команда (разраб/админ) выбирает: по умолчанию внутренний.
  // client_nodev — комментарий супер-админа КЛИЕНТУ, но СКРЫТЫЙ от разработчика (фин-вопросы мимо дева).
  const clientSide = me.role === "client" || (me.role === "employee" && !(await projectHasClient(id.split("-")[0])));
  const visibility: "client" | "internal" | "client_nodev" = clientSide
    ? "client"
    : hideFromDev && isSuperAdmin(me)
      ? "client_nodev"
      : visibleToClient
        ? "client"
        : "internal";
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
    // Портал → Trello: клиент-видимый коммент (клиент/сотрудник-как-клиент или супер-админ клиенту) зеркалим на карточку.
    // client_nodev тоже клиент-видимый (Trello — клиентская доска, разраб её не видит) → зеркалим.
    if (visibility === "client" || visibility === "client_nodev") await mirrorCommentToTrello(id, body).catch(() => {});
    revalidatePath(`/admin/tasks/${id}`);
    // DEV-47: благодарность/подтверждение под ПРИНЯТОЙ задачей — не «правки». Считаем один раз и для
    // возврата в работу, и для сброса deploy-стадии (thank-you не должен переоткрывать задачу/стадию).
    const isAck = isAcknowledgement(body, (attachments?.length ?? 0) > 0);
    // Коммент от «замовника» задачи (клиент/сотрудник-как-клиент, постановщик-член ИЛИ супер-админ как владелец)
    // при закрытой/ожидающей задаче возвращает её в работу:
    // - blocked (ответ на эскалацию), review (DEV-24: приёмку «всё ок» постановщик делает кнопкой «Готово», а коммент = нужны правки → в работу),
    // - done (DEV-19: новый коммент на Done — не висеть закрытой), НО DEV-47: пропускаем, если это чистая благодарность/подтверждение.
    try {
      const t = await getBackend().getTask(id);
      const bucket = statusBucket(t.state);
      // Автор — постановщик этой задачи? Клиент/член по логину, ИЛИ супер-админ, когда постановщика нет/он сам.
      const meIsReporter =
        (!!me.youtrackLogin && t.reporter?.login === me.youtrackLogin) ||
        (isSuperAdmin(me) && (!t.reporter?.login || t.reporter.role === "admin"));
      const shouldReopen = bucket === "blocked" || bucket === "review" || (bucket === "done" && !isAck);
      if ((clientSide || meIsReporter) && visibility !== "client_nodev" && shouldReopen) {
        await getBackend().updateStatus(id, "In Progress", { actorLogin: me.youtrackLogin ?? null, actorRole: clientSide ? "client" : "admin", trigger: "постановник написав коментар — повернуто в роботу" });
      }
    } catch { /* best-effort */ }
    if (clientSide && !isAck) {
      // DEV-39: клиент пишет (новые правки) по опубликованной задаче → сбрасываем стадию,
      // чтобы следующая доставка снова уведомила клиента «Опубліковано» (иначе залипает на prod).
      // Self-guarded (сработает только если стадия = prod). DEV-47: чистую благодарность стадией не трогаем.
      await reopenDeployStage(id, { actorRole: "system", trigger: "клієнт написав нові правки по опублікованій задачі" }).catch(() => {});
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
      } else if (visibility === "client" || visibility === "client_nodev") {
        // Команда/супер-админ ответили клиенту → клиенту/сотруднику проекта (client_nodev — тоже клиенту, но разработчику НЕ шлём).
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
  const projectKey = taskId.split("-")[0];
  // Виконати дію може клієнт, адмін АБО співробітник цього проєкту (клієнт делегував йому задачу,
  // що потребує дії — реєстрація/доступ; делегований співробітник її і виконує).
  const isProjectMember = (me?.role === "client" || me?.role === "employee") && (me?.projectKey === projectKey || (me?.projectKeys?.includes(projectKey) ?? false));
  if (!me || (!isProjectMember && me.realRole !== "admin")) return { error: "Нет прав" };
  const be = getBackend();
  const task = await be.getTask(taskId);
  if (!task.clientAction) return { error: "Действие уже выполнено" };
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
  // Дані надано → повертаємо задачу в роботу: вона чекала на клієнта (Blocked) або висіла в ревʼю.
  // Без цього задача лишалась «Blocked» навіть після виконання дії (як коли клієнт відповідає коментарем).
  try {
    const bucket = statusBucket(task.state);
    if (bucket === "blocked" || bucket === "review") await be.updateStatus(taskId, "In Progress");
  } catch { /* best-effort, статус вторинний до збереження даних */ }
  // Нейтральний текст: дію міг виконати і делегований співробітник, не лише клієнт.
  await be.addComment(taskId, `✅ <b>Реєстрацію виконано.</b>${value ? " Дані надано." : ""}`, "client").catch(() => {});
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
  await assignTask(taskId, employeeLogin, { actorLogin: me.youtrackLogin ?? null, actorRole: me.role, trigger: "клієнт делегував співробітнику" });
  const be = getBackend();
  const task = await be.getTask(taskId).catch(() => null);
  await notifyLogins([employeeLogin], `📋 <b>Вам делеговано задачу</b> · ${await taskTag(taskId)}: ${task?.summary ?? ""}\n${PORTAL_BASE}/admin/tasks/${taskId}`).catch(() => {});
  await be.addComment(taskId, `➡️ <i>Делеговано співробітнику: ${emp.fullName}.</i>`, "internal").catch(() => {});
  revalidatePath(`/admin/tasks/${taskId}`);
  return { ok: true };
}

/** DEV-30: разработчик передаёт задачу выбранному админу/супер-админу (когда нужны права вне его доступа). */
export async function delegateToAdmin(taskId: string, adminLogin: string): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me || me.role !== "contributor") return { error: "Нет прав" };
  const admin = (await getAdmins()).find((a) => a.login === adminLogin);
  if (!admin) return { error: "Адмін не знайдений" };
  await assignTask(taskId, adminLogin, { actorLogin: me.youtrackLogin ?? null, actorRole: me.role, trigger: "розробник передав адміну (права поза доступом)" });
  const be = getBackend();
  const task = await be.getTask(taskId).catch(() => null);
  await notifyLogins([adminLogin], `📋 <b>Вам передано задачу</b> · ${await taskTag(taskId)}: ${task?.summary ?? ""}\n${PORTAL_BASE}/admin/tasks/${taskId}`).catch(() => {});
  await be.addComment(taskId, `➡️ <i>Передано адміну: ${admin.fullName} (потрібні права поза доступом розробника).</i>`, "internal").catch(() => {});
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
export async function reviewTask(
  id: string,
  accept: boolean,
  note?: string,
  attachments?: { localId: string; mime: string; data: string; name: string; image: boolean }[],
): Promise<{ ok?: boolean; error?: string }> {
  const me = await getPrincipal();
  if (!me) return { error: "Не авторизован" };
  const be = getBackend();
  try {
    const task = await be.getTask(id);
    const isReporter = !!me.youtrackLogin && task.reporter?.login === me.youtrackLogin;
    // Приймати/повертати може будь-який клієнт/співробітник цього проєкту, не лише точний постановник.
    const taskKey = id.split("-")[0];
    const isProjectClientSide = (me.role === "client" || me.role === "employee") && (me.projectKey === taskKey || (me.projectKeys?.includes(taskKey) ?? false));
    if (me.realRole !== "admin" && !isReporter && !isProjectClientSide) return { error: "Нет прав" };
    // DEV-32: актор приёмки/возврата — текущий постановщик/клиент/админ.
    const evt = { actorLogin: me.youtrackLogin ?? null, actorRole: me.role ?? "admin" };
    if (accept) {
      await be.updateStatus(id, "Done", { ...evt, trigger: "постановник прийняв задачу" });
      after(() => syncTaskToTrello(id, "Done")); // Trello: карточку → «Виконано»
      if (task.assignee?.login) await notifyLogins([task.assignee.login], `✅ <b>Принято</b> · ${await taskTag(id)}: ${task.summary}`).catch(() => {});
      // Автодоставка dev→client при приёмке (если включён флаг проекта). Фоном — не блокируем экшен.
      const proj = await getProjectFull(task.projectKey).catch(() => null);
      if (proj?.meta?.autoDeliver) {
        const meta = proj.meta;
        after(() => autoDeliverAndNotify(task.projectKey, meta, id));
      }
    } else {
      await be.updateStatus(id, "Rework", { ...evt, trigger: "постановник повернув на доопрацювання" });
      // DEV-39: повернення опублікованої задачі на доопрацювання = новий круг → скидаємо стадію,
      // щоб після повторної доставки клієнт знову отримав «Опубліковано» (forwardOnly інакше тримає prod).
      await reopenDeployStage(id, { actorRole: me.role ?? "admin", actorLogin: me.youtrackLogin ?? null, trigger: "повернуто на доопрацювання" }).catch(() => {});
      after(() => syncTaskToTrello(id, "Rework")); // Trello: карточку → назад в работу
      // Заметка «на доработку» со вложениями (скрины) — сохраняем и подставляем ссылки вместо att:<localId>, как в комментариях.
      let body = (note ?? "").trim();
      for (const a of attachments ?? []) {
        const aid = await saveAttachment(id, a.mime, a.data, a.name);
        if (aid) body = body.replaceAll(`att:${a.localId}`, `/api/files/${aid}`);
      }
      const imgs = attachmentIdsIn(body);
      if (body) await be.addComment(id, `🔧 <b>На доработку:</b>\n\n${body}`, "internal");
      if (task.assignee?.login) await notifyLogins([task.assignee.login], `🔧 <b>На доработку</b> · ${await taskTag(id)}: ${task.summary}${body ? `\n${body.slice(0, 300)}` : ""}`, imgs).catch(() => {});
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


