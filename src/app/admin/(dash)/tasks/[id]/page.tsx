import Link from "next/link";
import { redirect } from "next/navigation";
import { getBackend } from "@/lib/tasks";
import { getPrincipal, isSuperAdmin } from "@/lib/principal";
import { getTaskDeps, getReads, getTaskTags, getGuide, guideText, getProjectEmployees, getAdmins, memberCard, projectHasClient, getTaskEvents } from "@/lib/db";
import { tgUsernameById } from "@/lib/notify";
import { statusBucket } from "@/lib/statuses";
import { getLocale } from "@/lib/i18n-server";
import { t, type Locale } from "@/lib/i18n";
import { CommentBox } from "./comment-box";
import { ApprovalBar } from "./approval-bar";
import { ReviewActions } from "./review-actions";
import { CommentsView, type ViewComment, type TimelineEvent } from "./comments-view";
import { OwnerActionBar } from "./owner-action-bar";
import { ClientActionBar } from "./client-action-bar";
import { DeleteOwnTask } from "./delete-own-task";
import { DelegateBar } from "./delegate-bar";
import { EscalateBar } from "./escalate-bar";
import { TaskEdit } from "./task-edit";
import { MoveTask } from "./move-task";
import { StatusPicker } from "./status-picker";
import { BackButton } from "./back-button";
import { ScrollTop } from "./scroll-top";
import { ReporterHover } from "./reporter-hover";
import { DeployBadge } from "../../deploy-badge";
import { AddresseeBadge } from "../../addressee-badge";
import { taskAddressee } from "@/lib/task-addressee";
import { Markdown } from "../../markdown";
import { ui } from "../../../ui-styles";

export const dynamic = "force-dynamic";

const DATE_LOC: Record<Locale, string> = { uk: "uk-UA", ru: "ru-RU", en: "en-US" };
function fmt(ms: number | undefined, locale: Locale): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString(DATE_LOC[locale], { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getPrincipal();
  const { id } = await params;
  // DEV-22: не теряем цель — после логина вернёмся на эту задачу (next проносится через Telegram-вход).
  if (!me) redirect(`/admin/login?next=${encodeURIComponent(`/admin/tasks/${id}`)}`);
  const locale = await getLocale();
  const be = getBackend();

  const isAdmin = me.realRole === "admin";
  const canEditStatus = isAdmin || me.role === "contributor";
  const backHref = isAdmin ? "/admin/tasks" : "/admin";
  const taskKey = id.split("-")[0];
  // Приймати/повертати задачу може будь-який клієнт/співробітник ЦЬОГО проєкту, а не лише точний постановник
  // (на боці клієнта буває кілька людей — задачу створив один, перевіряє інший).
  const isProjectClientSide = (me.role === "client" || me.role === "employee") && (me.projectKey === taskKey || (me.projectKeys?.includes(taskKey) ?? false));

  let task, comments, deps, reads, users, tags, projects, events;
  const readKey = me.youtrackLogin || me.fullName || "admin";
  try {
    // DEV-32: журнал событий — только команде (клиенту не тянем и не показываем).
    [task, comments, deps, reads, users, tags, projects, events] = await Promise.all([be.getTask(id), be.getComments(id), getTaskDeps(id), getReads(readKey), isAdmin ? be.listUsers() : Promise.resolve([]), getTaskTags(id), be.listProjects(), me.role === "client" ? Promise.resolve([]) : getTaskEvents(id)]);
  } catch (e) {
    return (
      <div>
        <Link href={backHref} style={{ ...ui.monoLabel, color: "var(--muted)", textDecoration: "none" }}>
          {t(locale, "task.back")}
        </Link>
        <p style={{ color: "#ff5b5b", fontSize: 14, marginTop: 16 }}>{e instanceof Error ? e.message : "—"}</p>
      </div>
    );
  }

  // Внутренняя задача (разработчик → админ) клиенту не видна.
  if (task.internal && me.role === "client") redirect(backHref);

  const blockers = deps.filter((d) => statusBucket(d.status) !== "done");
  // Навигация: имя проекта + ссылка на доску этого проекта (для крошек и корректного «назад»).
  const projectName = projects.find((p) => p.key === task.projectKey)?.name ?? task.projectKey;
  const projectBoardHref = `/admin/tasks?project=${encodeURIComponent(task.projectKey)}`;
  const taskBackHref = me.role === "client" ? "/admin" : projectBoardHref;
  // Гайд-инструкция к действию клиента (как зарегистрировать) — если привязан, на локали пользователя.
  const cg = task.clientActionGuide ? await getGuide(task.clientActionGuide) : null;
  const clientGuide = cg ? guideText(cg, locale) : null;
  // Клиент может делегировать задачу сотруднику своего проекта (если такие есть).
  const employees = me.role === "client" ? await getProjectEmployees(id.split("-")[0]) : [];
  // DEV-30: разработчику — список админов/супер-админов, кому можно передать задачу (нужны права вне его доступа).
  const admins = me.role === "contributor" ? await getAdmins() : [];
  // Сотрудник в проекте БЕЗ клиента приравнивается к клиенту (пользователь/постановщик): пишет клиент-видимые
  // комменты без выбора видимости и без гендер-предупреждения — как клиент.
  const projHasClient = await projectHasClient(id.split("-")[0]);
  const clientSide = me.role === "client" || (me.role === "employee" && !projHasClient);

  // Новые комменты — появившиеся после последнего открытия задачи.
  const prevRead = reads.get(id) ?? 0;
  const myLogin = me.youtrackLogin;
  // Время последнего коммента от ДРУГОГО автора (ответа) — свой коммент правим, только пока ответа нет.
  const lastOtherCreated = comments.reduce((max, c) => (myLogin && c.author.login !== myLogin ? Math.max(max, c.created) : max), 0);
  // Итог разраба ещё на модерации (клиент-facing коммент approved=false): результат клиенту НЕ показан.
  // Пока так — клиент-постановщик НЕ должен видеть блок приёмки (разраб ставит Review сразу, но итог ждёт апрува).
  const pendingClientResult = comments.some((c) => c.visibility === "client" && c.approved === false);
  const viewComments: ViewComment[] = comments.map((c) => ({
    id: c.id,
    text: c.text,
    created: c.created,
    authorName: c.author.fullName,
    authorRole: c.author.role,
    visibility: c.visibility,
    approved: c.approved !== false,
    // Автор может править свой коммент, пока он на модерации (не опубликован).
    canEditOwn: c.approved === false && me.role !== "client" && !!myLogin && c.author.login === myLogin,
    // …или пока опубликованный коммент ещё без ответа другой стороны (доступно и клиенту).
    canEdit: c.approved !== false && !!myLogin && c.author.login === myLogin && c.created > lastOtherCreated,
    devAuthored: c.devAuthored === true,
    isNew: c.created > prevRead,
  }));
  // DEV-32: события журнала → во view-модель ленты (команде; клиенту events уже пуст).
  const viewEvents: TimelineEvent[] = (events ?? []).map((e) => ({
    id: e.id, ts: e.ts, type: e.type, actorName: e.actorName, actorRole: e.actorRole, trigger: e.trigger, from: e.from, to: e.to, details: e.details,
  }));
  // DEV-7: коммент Клода (dev_authored) разработчик/админ может править/удалять из UI (супер-админ — через модерацию).
  const canManageDev = isAdmin || me.role === "contributor";
  // DEV-31: всплывающее окно по постановщику (роль + Telegram + проекты) — только команде, не клиенту.
  const projNames: Record<string, string> = Object.fromEntries((projects ?? []).map((p) => [p.key, p.name]));
  const reporterCard = task.reporter && me.role !== "client" ? await memberCard(task.reporter.login) : null;
  // @ник в БД хранится не всегда (только tg_id) — добиваем через getChat (best-effort).
  const reporterTg = reporterCard ? reporterCard.telegram ?? (await tgUsernameById(reporterCard.tgId)) : null;
  const shownCount = me.role === "client" ? viewComments.filter((c) => c.visibility !== "internal" && c.approved).length : viewComments.length;

  return (
    <div>
      <ScrollTop label={t(locale, "task.scrollTop")} />
      {/* «← к задачам» липкая (DEV-3): остаётся видимой при прокрутке длинной задачи — пилюля с фоном поверх контента. */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, marginBottom: 4, display: "flex" }}>
        <BackButton
          fallbackHref={taskBackHref}
          label={t(locale, "task.backPrev")}
          style={{ ...ui.monoLabel, display: "inline-flex", alignItems: "center", color: "var(--accent)", textDecoration: "none", background: "rgba(8,8,8,0.9)", backdropFilter: "blur(8px)", border: "1px solid var(--accent-line)", borderRadius: 999, padding: "7px 14px", cursor: "pointer", fontWeight: 600 }}
        />
      </div>

      {/* Хлебные крошки (DEV-5): Задачи › <Проект> › <ID>. Проект — кликабелен → доска этого проекта. Клиенту не показываем. */}
      {me.role !== "client" && (
        <div style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          <Link href="/admin/tasks" style={{ color: "var(--muted)", textDecoration: "none" }}>{t(locale, "nav.tasks")}</Link>
          <span>›</span>
          <Link href={projectBoardHref} style={{ color: "var(--accent)", textDecoration: "none" }}>{projectName}</Link>
          <span>›</span>
          <span style={{ color: "var(--text)" }}>{task.id}</span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        {/* Слаг: команде он уже в хлебных крошках выше (не дублируем); клиенту крошек нет — показываем здесь. */}
        {me.role === "client" && <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{task.id}</span>}
        {/* Смена статуса прямо тут — админ/разработчик (не клиент); иначе просто текст статуса. */}
        {task.state && canEditStatus ? (
          <StatusPicker taskId={task.id} status={task.state} locale={locale} />
        ) : (
          task.state && <span style={ui.monoLabel}>{task.state}</span>
        )}
        {task.priority && <span style={ui.monoLabel}>· {task.priority}</span>}
        {/* Кому адресована — только команде (клиенту не показываем). */}
        {me.role !== "client" && <AddresseeBadge addressee={taskAddressee(task)} locale={locale} />}
        <DeployBadge stage={task.deployStage} locale={locale} />
        {/* Редактирование задачи — иконка-карандаш в правом верхнем углу (только админ). */}
        {isAdmin && (
          <span style={{ marginLeft: "auto" }}>
            <TaskEdit
              id={task.id}
              summary={task.summary}
              description={task.description ?? ""}
              priority={task.priority ?? ""}
              assigneeLogin={task.assignee?.login ?? ""}
              assignees={users.filter((u) => (u.role === "contributor" || u.role === "admin") && !u.banned).map((u) => ({ login: u.login, fullName: u.alias || u.fullName }))}
              locale={locale}
              defaultOpen={task.approvalStatus === "pending"}
            />
          </span>
        )}
      </div>
      <h1 style={{ ...ui.h1, fontSize: "clamp(22px,5vw,32px)", marginTop: 10 }}>{task.summary}</h1>

      <div style={{ display: "flex", gap: 16, ...ui.monoLabel, textTransform: "none", marginTop: 10, flexWrap: "wrap" }}>
        {me.role !== "client" && task.assignee && <span>→ {task.assignee.fullName}</span>}
        {/* Постановщик. reporter=null бывает ТОЛЬКО у супер-админа (у всех остальных ролей есть member-логин,
            он и пишется в постановщики). created_by_role при null лишь отражает режим «просмотра как» — не реального
            автора, поэтому для null подписываем «Lambertain» (агентство). Клиенту команду не раскрываем. */}
        {(() => {
          const name = task.reporter ? task.reporter.fullName : "Lambertain";
          const show = task.reporter
            ? me.role !== "client" || task.reporter.role === "client" || task.reporter.role === "employee"
            : me.role !== "client";
          if (!show) return null;
          // DEV-31: команде — постановщик с всплывающим окном (роль/Telegram/проекты); клиенту — обычный текст.
          return reporterCard
            ? <ReporterHover text={t(locale, "card.from", { name })} role={reporterCard.role ?? task.reporter?.role ?? null} projects={reporterCard.projects} telegram={reporterTg} projectNames={projNames} locale={locale} />
            : <span>{t(locale, "card.from", { name })}</span>;
        })()}
        {task.updated && <span>{fmt(task.updated, locale)}</span>}
      </div>

      {/* Нужно действие владельца (деплой/регистрация/токен) — только команде (агентство).
          НЕ показываем стороне клиента: ни клиенту-владельцу, ни его сотруднику (оба — пользователи продукта). */}
      {me.role !== "client" && me.role !== "employee" && task.ownerAction && (
        <OwnerActionBar taskId={task.id} action={task.ownerAction} canResolve={isSuperAdmin(me)} canToClient={isSuperAdmin(me) && projHasClient} locale={locale} />
      )}

      {/* Нужно действие КЛИЕНТА (зарегистрировать/дать доступ): инструкция + поле + «Готово».
          Видно клиенту, админу И сотруднику этого проекта — чтобы клиент мог делегировать сотруднику
          в т.ч. задачи, требующие его действия (регистрация/доступ), а тот их выполнил. */}
      {task.clientAction && (isProjectClientSide || isAdmin) && (
        <ClientActionBar taskId={task.id} action={task.clientAction} guide={clientGuide} />
      )}

      {/* Задача чекає на відповідь КЛІЄНТА (розробник поставив питання → Blocked, без блокувань-залежностей).
          Явний банер, щоб клієнт не пропустив це у статусі «Заблоковано». Відповідь у коментарях знімає блок. */}
      {clientSide && statusBucket(task.state) === "blocked" && blockers.length === 0 && (
        <div style={{ ...ui.card, marginTop: 12, borderColor: "#e8b339", background: "rgba(232,179,57,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, ...ui.monoLabel, color: "#e8b339" }}>
            <span style={{ fontSize: 16 }}>⏳</span>
            <span>{t(locale, "awaitAnswer.title")}</span>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>{t(locale, "awaitAnswer.body")}</p>
        </div>
      )}

      {/* Клиент делегирует задачу своему сотруднику (если в проекте есть сотрудники) */}
      {me.role === "client" && employees.length > 0 && !task.internal && (
        <DelegateBar taskId={task.id} employees={employees} locale={locale} />
      )}

      {/* DEV-30: разработчик передаёт задачу выбранному админу/супер-админу, если нужны права вне его доступа */}
      {me.role === "contributor" && admins.length > 0 && (
        <EscalateBar taskId={task.id} admins={admins} locale={locale} />
      )}

      {/* Теги триажа (тип/сложность/скилы) — команде, не клиенту */}
      {me.role !== "client" && tags && (tags.type || tags.complexity || (tags.skills?.length ?? 0) > 0) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
          {tags.type && <span style={{ ...ui.monoLabel, textTransform: "none", padding: "2px 8px", border: "1px solid var(--border-2)", borderRadius: 3 }}>{tags.type}</span>}
          {tags.complexity && <span style={{ ...ui.monoLabel, textTransform: "none", padding: "2px 8px", border: "1px solid var(--border-2)", borderRadius: 3, color: tags.complexity === "feature" ? "#e8b339" : "var(--muted)" }}>{tags.complexity === "feature" ? "feature" : "small"}</span>}
          {(tags.skills ?? []).map((s) => (
            <span key={s} style={{ ...ui.monoLabel, textTransform: "none", padding: "2px 8px", border: "1px solid var(--accent-line)", borderRadius: 3, color: "var(--accent)" }}>{s}</span>
          ))}
        </div>
      )}

      {/* Автор может удалить свою задачу, пока она ещё НЕ взята в работу (статус Open). */}
      {statusBucket(task.state) === "notStarted" && !!me.youtrackLogin && task.reporter?.login === me.youtrackLogin && (
        <div style={{ marginTop: 12 }}>
          <DeleteOwnTask taskId={task.id} label={t(locale, "task.deleteOwn")} confirmText={t(locale, "task.deleteOwnConfirm")} />
        </div>
      )}

      {/* DEV-13: плашку подтверждения не показываем, если задача уже завершена (авто-Done) — подтверждать нечего. */}
      {task.approvalStatus === "pending" && statusBucket(task.state) !== "done" && (
        <ApprovalBar id={task.id} canApprove={isSuperAdmin(me) || me.role === "client"} creator={task.reporter?.fullName ?? null} locale={locale} />
      )}

      {/* Постановщик (или админ) проверяет результат в «Ревью» → принять/на доработку.
          Клиенту-постановщику показываем ТОЛЬКО когда итог уже одобрен (не висит на модерации) —
          иначе его зовут принимать до того, как агентство опубликовало результат. Админ-модератор видит всегда. */}
      {statusBucket(task.state) === "review" && (isAdmin || ((isProjectClientSide || (!!me.youtrackLogin && task.reporter?.login === me.youtrackLogin)) && !pendingClientResult)) && (
        <ReviewActions id={task.id} locale={locale} />
      )}


      {/* Перенос задачи в другой проект — только супер-админ (если задача села не в тот проект). */}
      {isSuperAdmin(me) && projects.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <MoveTask taskId={task.id} projects={projects.filter((p) => p.key !== task.projectKey).map((p) => ({ key: p.key, name: p.name }))} />
        </div>
      )}

      {blockers.length > 0 && (
        <div style={{ ...ui.card, marginTop: 16, padding: 14, borderColor: "#ff5b5b" }}>
          <div style={{ ...ui.monoLabel, color: "#ff5b5b" }}>{t(locale, "deps.blockedBy")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
            {blockers.map((b) => (
              <Link key={b.id} href={`/admin/tasks/${b.id}`} style={{ fontSize: 13, color: "var(--text)", textDecoration: "none" }}>
                <span style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginRight: 8 }}>{b.id}</span>
                {b.summary}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div style={{ ...ui.card, marginTop: 20 }}>
        <div style={ui.fieldLabel}>{t(locale, "task.description")}</div>
        <div style={{ marginTop: 8 }}>
          {task.description?.trim() ? (
            <Markdown>{task.description}</Markdown>
          ) : (
            <span style={{ fontSize: 14, color: "var(--muted)" }}>{t(locale, "task.noDescription")}</span>
          )}
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={ui.monoLabel}>
          {t(locale, "task.comments")} · {shownCount}
        </div>
        <CommentsView taskId={task.id} comments={viewComments} events={viewEvents} isClient={me.role === "client"} canModerate={isSuperAdmin(me)} canManageDev={canManageDev} locale={locale} />
        <CommentBox id={task.id} locale={locale} canChooseVisibility={!clientSide} />
      </div>
    </div>
  );
}
