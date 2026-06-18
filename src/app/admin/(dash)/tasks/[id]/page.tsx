import Link from "next/link";
import { redirect } from "next/navigation";
import { getBackend } from "@/lib/tasks";
import { getPrincipal, isSuperAdmin } from "@/lib/principal";
import { getTaskDeps, getReads, getTaskAiStatus, getTaskTags, getGuide, guideText, getProjectEmployees, projectHasClient } from "@/lib/db";
import { statusBucket } from "@/lib/statuses";
import { getLocale } from "@/lib/i18n-server";
import { t, type Locale } from "@/lib/i18n";
import { CommentBox } from "./comment-box";
import { ApprovalBar } from "./approval-bar";
import { ReviewActions } from "./review-actions";
import { CommentsView, type ViewComment } from "./comments-view";
import { OwnerActionBar } from "./owner-action-bar";
import { ClientActionBar } from "./client-action-bar";
import { DeleteOwnTask } from "./delete-own-task";
import { DelegateBar } from "./delegate-bar";
import { RetryDrafting } from "./retry-drafting";
import { TaskEdit } from "./task-edit";
import { MoveTask } from "./move-task";
import { StatusPicker } from "./status-picker";
import { BackButton } from "./back-button";
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
  if (!me) redirect("/admin/login");
  const { id } = await params;
  const locale = await getLocale();
  const be = getBackend();

  const isAdmin = me.realRole === "admin";
  const canEditStatus = isAdmin || me.role === "contributor";
  const backHref = isAdmin ? "/admin/tasks" : "/admin";

  let task, comments, deps, reads, aiStatus, users, tags, projects;
  const readKey = me.youtrackLogin || me.fullName || "admin";
  try {
    [task, comments, deps, reads, aiStatus, users, tags, projects] = await Promise.all([be.getTask(id), be.getComments(id), getTaskDeps(id), getReads(readKey), getTaskAiStatus(id), isAdmin ? be.listUsers() : Promise.resolve([]), getTaskTags(id), isSuperAdmin(me) ? be.listProjects() : Promise.resolve([])]);
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
  // Гайд-инструкция к действию клиента (как зарегистрировать) — если привязан, на локали пользователя.
  const cg = task.clientActionGuide ? await getGuide(task.clientActionGuide) : null;
  const clientGuide = cg ? guideText(cg, locale) : null;
  // Клиент может делегировать задачу сотруднику своего проекта (если такие есть).
  const employees = me.role === "client" ? await getProjectEmployees(id.split("-")[0]) : [];
  // Сотрудник в проекте БЕЗ клиента приравнивается к клиенту (пользователь/постановщик): пишет клиент-видимые
  // комменты без выбора видимости и без гендер-предупреждения — как клиент.
  const clientSide = me.role === "client" || (me.role === "employee" && !(await projectHasClient(id.split("-")[0])));

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
  // DEV-7: коммент Клода (dev_authored) разработчик/админ может править/удалять из UI (супер-админ — через модерацию).
  const canManageDev = isAdmin || me.role === "contributor";
  const shownCount = me.role === "client" ? viewComments.filter((c) => c.visibility !== "internal" && c.approved).length : viewComments.length;

  return (
    <div>
      {/* «← к задачам» липкая (DEV-3): остаётся видимой при прокрутке длинной задачи — пилюля с фоном поверх контента. */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, marginBottom: 4, display: "flex" }}>
        <BackButton
          fallbackHref={backHref}
          label={t(locale, "task.backPrev")}
          style={{ ...ui.monoLabel, display: "inline-flex", alignItems: "center", color: "var(--muted)", textDecoration: "none", background: "rgba(8,8,8,0.85)", backdropFilter: "blur(8px)", border: "1px solid var(--border-2)", borderRadius: 999, padding: "6px 12px", cursor: "pointer" }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{task.id}</span>
        {/* Смена статуса прямо тут — админ/разработчик (не клиент); иначе просто текст статуса. */}
        {task.state && canEditStatus ? (
          <StatusPicker taskId={task.id} status={task.state} locale={locale} />
        ) : (
          task.state && <span style={ui.monoLabel}>{task.state}</span>
        )}
        {task.priority && <span style={ui.monoLabel}>· {task.priority}</span>}
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
        {/* Сотрудник и клиент-репортёр видны клиенту; разработчик/админ — скрыты (агентство = Lambertain). */}
        {task.reporter && (me.role !== "client" || task.reporter.role === "client" || task.reporter.role === "employee") && (
          <span>{t(locale, "card.from", { name: task.reporter.fullName })}</span>
        )}
        {task.updated && <span>{fmt(task.updated, locale)}</span>}
      </div>

      {/* Нужно действие владельца (деплой/регистрация/токен) — только команде (агентство).
          НЕ показываем стороне клиента: ни клиенту-владельцу, ни его сотруднику (оба — пользователи продукта). */}
      {me.role !== "client" && me.role !== "employee" && task.ownerAction && (
        <OwnerActionBar taskId={task.id} action={task.ownerAction} canResolve={isSuperAdmin(me)} locale={locale} />
      )}

      {/* Нужно действие КЛИЕНТА (зарегистрировать/дать доступ) — клиенту и админу: инструкция + поле + «Готово» */}
      {task.clientAction && (me.role === "client" || isAdmin) && (
        <ClientActionBar taskId={task.id} action={task.clientAction} guide={clientGuide} />
      )}

      {/* Клиент делегирует задачу своему сотруднику (если в проекте есть сотрудники) */}
      {me.role === "client" && employees.length > 0 && !task.internal && (
        <DelegateBar taskId={task.id} employees={employees} locale={locale} />
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

      {(aiStatus === "pending" || aiStatus === "waiting") && (
        <div style={{ ...ui.card, marginTop: 16, padding: 14, borderColor: "var(--accent-line)", background: "rgba(185,255,75,0.06)", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: aiStatus === "waiting" ? "#e8b339" : "var(--accent)", display: "inline-block", flexShrink: 0 }} />
          <span style={{ fontSize: 14 }}>{t(locale, aiStatus === "waiting" ? "ai.waiting" : "ai.drafting")}</span>
          {isAdmin && <RetryDrafting id={task.id} label={t(locale, "ai.retry")} />}
        </div>
      )}

      {/* Автор может удалить свою задачу в окне ДО триажа (пока ai_status=pending). */}
      {aiStatus === "pending" && !!me.youtrackLogin && task.reporter?.login === me.youtrackLogin && (
        <div style={{ marginTop: 12 }}>
          <DeleteOwnTask taskId={task.id} label={t(locale, "task.deleteOwn")} confirmText={t(locale, "task.deleteOwnConfirm")} />
        </div>
      )}

      {task.approvalStatus === "pending" && (
        <ApprovalBar id={task.id} canApprove={isSuperAdmin(me) || me.role === "client"} creator={task.reporter?.fullName ?? null} locale={locale} />
      )}

      {/* Постановщик (или админ) проверяет результат в «Ревью» → принять/на доработку.
          Клиенту-постановщику показываем ТОЛЬКО когда итог уже одобрен (не висит на модерации) —
          иначе его зовут принимать до того, как агентство опубликовало результат. Админ-модератор видит всегда. */}
      {statusBucket(task.state) === "review" && (isAdmin || (!!me.youtrackLogin && task.reporter?.login === me.youtrackLogin && !pendingClientResult)) && (
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
        <CommentsView taskId={task.id} comments={viewComments} isClient={me.role === "client"} canModerate={isSuperAdmin(me)} canManageDev={canManageDev} locale={locale} />
        <CommentBox id={task.id} locale={locale} canChooseVisibility={!clientSide} />
      </div>
    </div>
  );
}
