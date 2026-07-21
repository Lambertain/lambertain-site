import Link from "next/link";
import { redirect } from "next/navigation";
import { getBackend } from "@/lib/tasks";
import type { TaskFilter } from "@/lib/tasks/types";
import { getPrincipal, isSuperAdmin } from "@/lib/principal";
import { visibleProjects } from "@/lib/scope";
import { mergeFeedback } from "@/lib/feedback";
import { getReads, getProjectReads, listProjectsWithMeta, taskCountsByProject, doneCountsByProjectDay, getDepsFor, commentTimesByTasks, getDelegationsFor } from "@/lib/db";
import { segmentDayNumber } from "@/lib/status-timer";
import { getProjectRepoSync } from "@/lib/repo-sync";
import { statusBucket, type Bucket } from "@/lib/statuses";
import { ProjectInfoCard } from "./project-info-card";
import { addMonth } from "./project-timeline";
import { nowMs } from "@/lib/now";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { ChatModal } from "./chat-modal";
import { NewProjectButton } from "./new-project-button";
import { type BoardTask } from "./task-tabs";
import { ClientBoard } from "./client-board";
import { DevDashboard, type DashProject } from "./dev-dashboard";
import { ui } from "../ui-styles";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const me = await getPrincipal();
  if (!me) redirect("/admin/login");
  const locale = await getLocale();
  const be = getBackend();

  // —— Админ: дашборд загрузки разработчиков ——
  if (me.realRole === "admin" && me.role === "admin") {
    let projects, counts, users, doneDaily;
    try {
      [projects, counts, users, doneDaily] = await Promise.all([listProjectsWithMeta(), taskCountsByProject(), be.listUsers(), doneCountsByProjectDay(7)]);
    } catch (e) {
      return <p style={{ color: "#ff5b5b", fontSize: 14 }}>{e instanceof Error ? e.message : "—"}</p>;
    }
    // 7 календарних днів (Київ TZ), від старого до сьогодні — підписи для недільного графіка.
    const nowDash = nowMs();
    const days = Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(nowDash - (6 - i) * 86400000)),
    );
    const countMap = new Map(counts.map((c) => [c.projectKey, c]));
    const dash: DashProject[] = projects
      .filter((p) => !p.archived)
      .map((p) => {
        const c = countMap.get(p.key);
        return { key: p.key, name: p.name, meta: p.meta, createdAt: p.createdAt, total: c?.total ?? 0, done: c?.done ?? 0 };
      });
    // Статус синка dev↔client репо на карточку (параллельно, с кэшем в памяти 5 мин).
    const syncs = await Promise.all(dash.map((p) => getProjectRepoSync(p.key, p.meta)));
    dash.forEach((p, i) => { p.sync = syncs[i]; });
    const devNames: Record<string, string> = Object.fromEntries(users.map((u) => [u.login, u.alias || u.fullName]));
    // Селект создания задачи: фидбек-проект (Lamb.dev) — последним, не дефолтом.
    const chatProjects = dash
      .map((p) => ({ key: p.key, name: p.name, fb: !!p.meta.feedback }))
      .sort((a, b) => (a.fb ? 1 : 0) - (b.fb ? 1 : 0))
      .map((p) => ({ key: p.key, name: p.name }));

    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={ui.monoLabel}>{t(locale, "dash.kicker")}</div>
            <h1 style={{ ...ui.h1, marginTop: 8 }}>{t(locale, "nav.projects")}</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Link href="/admin/projects" style={{ ...ui.monoLabel, color: "var(--muted)", textDecoration: "none" }}>{t(locale, "projects.manage")}</Link>
            <NewProjectButton locale={locale} />
            <ChatModal projects={chatProjects} locale={locale} isAdmin={isSuperAdmin(me)} role={me.role} feedbackKey={projects.find((p) => p.meta.feedback)?.key} />
          </div>
        </div>
        <DevDashboard projects={dash} devNames={devNames} now={nowDash} locale={locale} days={days} doneDaily={doneDaily} />
      </div>
    );
  }

  // —— Контрибьютор/клиент/сотрудник: задачи с табами проект→статус ——
  const all = await be.listProjects();
  const visible = visibleProjects(me, all);
  // Фидбек-проект (Lamb.dev) — всегда ПОСЛЕДНИМ в списках и НЕ дефолтом в селекте создания задачи,
  // иначе клиент по невнимательности создаёт задачи своего проекта в Lamb.dev.
  const fbSet = new Set(all.filter((p) => p.meta.feedback).map((p) => p.key));
  const byFeedbackLast = (a: { key: string }, b: { key: string }) => (fbSet.has(a.key) ? 1 : 0) - (fbSet.has(b.key) ? 1 : 0);
  // DEV-41: гарантийный период внесения правок = сдача (deadline) + 1 месяц. Если истёк — клиенту в форме
  // создания задачи покажем предупреждение с контактом. Флаг считаем для всех, показываем только клиенту.
  const nowW = nowMs();
  const projects = visible.map((p) => {
    const dl = p.meta.deadline ? new Date(p.meta.deadline).getTime() : null;
    return { key: p.key, name: p.name, warrantyExpired: dl != null && nowW > addMonth(dl) };
  }).sort(byFeedbackLast);
  const visibleKeys = new Set(visible.map((p) => p.key));

  let tasks, reads, projectSeen;
  const readKey = me.youtrackLogin || me.fullName || "admin";
  try {
    // Разработчик/сотрудник/клиент — ВСЕ задачи их проектов (включая исторические/выполненные, а не только
    // назначенные лично — новый участник проекта должен видеть всю историю). Клиент может быть в нескольких проектах.
    let filter: TaskFilter = { order: "updated_desc", limit: 300 };
    if (me.role === "client" || me.role === "contributor" || me.role === "employee") {
      filter = { projectKeys: [...visibleKeys], order: "updated_desc", limit: 300 };
    }
    [tasks, reads, projectSeen] = await Promise.all([be.listTasks(filter), getReads(readKey), getProjectReads(readKey)]);
  } catch (e) {
    return <p style={{ color: "#ff5b5b", fontSize: 14 }}>{e instanceof Error ? e.message : "—"}</p>;
  }

  const visibleFiltered = tasks.filter((tk) => (me.role === "admin" ? true : visibleKeys.has(tk.projectKey)));
  // Фидбек-проект: убрать чужие фидбек-задачи, подмешать свои; клиенту — скрыть внутренние (разработчик→админ).
  const merged = await mergeFeedback(me, all, visibleFiltered);
  // Видимость internal: клиент — никаких internal; админ/супер — всё; разработчик/сотрудник — только internal,
  // адресованные деву (created_by_role admin/super), но НЕ личные само-задачи супер-админа (created_by_role null).
  const filtered =
    me.role === "client"
      ? merged.filter((tk) => !tk.internal)
      : me.realRole === "admin"
        ? merged
        : merged.filter((tk) => !tk.internal || tk.createdByRole === "admin" || tk.createdByRole === "super");
  const depMap = await getDepsFor(filtered.map((tk) => tk.id));
  const commentTimes = await commentTimesByTasks(filtered.map((tk) => tk.id));
  // Клиенту — давность делегированных сотруднику задач (кружок green/amber/red, ✓ при выполнении).
  const nowDeleg = nowMs();
  const delegRaw = me.role === "client" ? await getDelegationsFor(filtered.map((tk) => tk.id)) : new Map<string, { at: number; doneAt: number | null }>();
  const board: BoardTask[] = filtered.map((tk) => {
    const dlg = delegRaw.get(tk.id);
    const blockers = (depMap.get(tk.id) ?? []).filter((d) => statusBucket(d.status) !== "done");
    const lastRead = reads.get(tk.id) ?? 0;
    // Новая задача — ещё не открытая (created позже последнего просмотра).
    const isNew = (tk.created ?? 0) > lastRead;
    // Число новых комментов — опубликованных позже последнего просмотра задачи.
    const newComments = (commentTimes.get(tk.id) ?? []).filter((ms) => ms > lastRead).length;
    const hasNewComments = newComments > 0;
    return {
      id: tk.id,
      projectKey: tk.projectKey,
      summary: tk.summary,
      status: tk.state || "Open",
      description: tk.description,
      created: tk.created,
      updated: tk.updated,
      commentCount: tk.commentCount,
      assignee: me.role === "client" ? null : tk.assignee?.fullName ?? null,
      unread: isNew || hasNewComments,
      isNew,
      newComments,
      // Завершённая задача НЕ блокируется незакрытыми зависимостями (её работа уже сделана) — иначе Done-задача
      // с висящим блокером (напр. авто-принятая раньше зависимости) падала в «Не начато» с плашкой блокера.
      blocked: statusBucket(tk.state) !== "done" && blockers.length > 0,
      blockers: statusBucket(tk.state) === "done" ? [] : blockers.map((b) => ({ id: b.id, summary: b.summary })),
      // Клиенту ops-шаг агентства (ownerAction) не показываем; его собственное действие (clientAction) — показываем.
      ownerAction: me.role === "client" ? null : tk.ownerAction,
      // reporterAction — вопрос разработчика ПОСТАНОВЩИКУ (агентству), внутренняя коммуникация dev↔агентство.
      // Клиенту её не показываем (иначе внутренние заметки «не клиенту» светятся в его доске).
      reporterAction: me.role === "client" ? null : tk.reporterAction,
      awaitingMyAnswer: me.role !== "client" && !!tk.reporterAction && !!me.youtrackLogin && tk.reporter?.login === me.youtrackLogin,
      clientAction: tk.clientAction,
      // DEV-42: клиенту нужно действие — задача готова к приёмке (review), либо ждёт его ответа/регистрации
      // (clientAction) либо вопрос-эскалация (blocked). Для мини-секции «Потребує вашої дії» вверху доски.
      clientAttention: me.role === "client" && (statusBucket(tk.state) === "review" || !!tk.clientAction || statusBucket(tk.state) === "blocked"),
      deployStage: tk.deployStage,
      delegDot: dlg ? { days: segmentDayNumber(dlg.at, dlg.doneAt ?? nowDeleg), done: dlg.doneAt != null } : undefined,
      // Клиенту разрешаем удалять задачу только пока она НЕ взята в работу (Open/notStarted); в работе/на приёмке/
      // выполненную — нельзя (корзину скрываем). Для остальных ролей ограничение не задаём.
      deletable: me.role === "client" ? statusBucket(tk.state) === "notStarted" : undefined,
    };
  });

  // Метка New на проекте: активность задач позже последнего открытия проекта.
  // Фидбек-проект (Lamb.dev) — всегда последним табом; первым — основной проект пользователя.
  const projectsWithNew = projects
    .map((p) => {
      const seen = projectSeen.get(p.key) ?? 0;
      const hasNew = filtered.some(
        (tk) => tk.projectKey === p.key && Math.max(tk.created ?? 0, tk.lastCommentAt ?? 0) > seen,
      );
      return { key: p.key, name: p.name, hasNew };
    })
    .sort(byFeedbackLast);

  const canEditStatus = me.realRole === "admin" || me.role === "contributor";
  const canDelete = me.realRole === "admin" || me.role === "client";
  // «Взять в работу по клику» (Open → In Progress) — только исполнитель-разработчик (кому задача адресована).
  // Админ/супер-админ просматривает всё, но его клик НЕ меняет статус (открывает задачу).
  const canStart = me.role === "contributor";
  const feedbackKey = all.find((p) => p.meta.feedback)?.key;
  const now = nowMs();

  // Счётчики задач по корзинам + новые для проекта (из доски).
  const projCounts = (k: string) => {
    const c: Record<string, number> = { inProgress: 0, review: 0, rework: 0, done: 0, notStarted: 0, blocked: 0 };
    for (const b of board) {
      if (b.projectKey !== k) continue;
      // DEV-43: нет отдельного таба «Заблоковано» — заблокированные считаем в «Не начато».
      const bk = b.blocked ? "blocked" : statusBucket(b.status);
      c[bk === "blocked" ? "notStarted" : bk]++;
    }
    // DEV-49: NEW на проекте — активность (нова задача АБО новий коментар) позже последнего ОТКРИТТЯ ПРОЕКТУ,
    // серед активних (Done не рахуємо). Раніше рахувалось по per-task reads (created > lastRead), тож плашка
    // «N NEW» не знімалась при відкритті проекту — лише коли відкриєш КОЖНУ задачу окремо (звідси «все переглянуто,
    // а плашка висить»). Тепер консистентно з hasNew: скидається відкриттям проекту (markProjectOpened → projectSeen).
    const seen = projectSeen.get(k) ?? 0;
    let nw = 0;
    for (const tk of filtered) {
      if (tk.projectKey !== k || statusBucket(tk.state) === "done") continue;
      if (Math.max(tk.created ?? 0, tk.lastCommentAt ?? 0) > seen) nw++;
    }
    return { counts: c as Record<Bucket, number>, newCount: nw };
  };

  // —— Разработчик: дашборд своих проектов (инфо, прогресс, счётчики, доступы) ——
  if (me.role === "contributor") {
    const myProjects = visible.filter((p) => !p.meta.feedback);
    // Lamb.dev (фидбек) — последней карточкой, как и у остальных участников (без доступов/прод-ссылки).
    const fbProject = visible.find((p) => p.meta.feedback);
    // Статус синка dev↔client репо — чтобы разработчик сам видел, всё ли доставлено клиенту (не спрашивал админа).
    const devSyncs = await Promise.all(myProjects.map((p) => getProjectRepoSync(p.key, p.meta)));
    const devSyncByKey = new Map(myProjects.map((p, i) => [p.key, devSyncs[i]]));
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ ...ui.h1, fontSize: "clamp(22px,5vw,30px)" }}>{t(locale, "proj.myProjects")}</h1>
          <span style={{ marginLeft: "auto" }}>
            <ChatModal projects={projects} locale={locale} isContributor role={me.role} feedbackKey={feedbackKey} />
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18 }}>
          {myProjects.length === 0 && !fbProject ? (
            <p style={{ color: "var(--muted)", fontSize: 14 }}>{t(locale, "dash.empty")}</p>
          ) : (
            <>
              {myProjects.map((p) => {
                const { counts, newCount } = projCounts(p.key);
                return <ProjectInfoCard key={p.key} project={p} canEdit showDevLink counts={counts} newCount={newCount} now={now} locale={locale} sync={devSyncByKey.get(p.key)} />;
              })}
              {fbProject && (() => {
                const { counts, newCount } = projCounts(fbProject.key);
                return <ProjectInfoCard key={fbProject.key} project={fbProject} counts={counts} newCount={newCount} now={now} locale={locale} />;
              })()}
            </>
          )}
        </div>
      </div>
    );
  }

  // —— Клиент: инфо своего проекта + задачи (инструкции приходят задачами в «Потрібна ваша дія», не пассивным блоком) ——
  const myProject = me.role === "client" ? visible.find((p) => p.key === me.projectKey) : undefined;
  const instructionSetToken = me.role === "client" ? myProject?.meta.onboardingSetToken : undefined;
  // Карточки всех клиентских проектов (кроме feedback) — по ключу; ClientBoard покажет карточку ВЫБРАННОГО проекта.
  const clientProjects = me.role === "client" ? visible.filter((p) => !p.meta.feedback) : [];
  const projectCards: Record<string, React.ReactNode> = Object.fromEntries(
    clientProjects.map((p) => [p.key, <ProjectInfoCard key={p.key} project={p} now={now} locale={locale} />]),
  );

  return (
    <div>
      {instructionSetToken && (
        <a href={`/i/${instructionSetToken}`} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", marginBottom: 18, borderRadius: 10, border: "1px solid var(--accent-line)", background: "rgba(185,255,75,0.06)", textDecoration: "none", color: "var(--text)" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
          <span style={{ fontSize: 14, flex: 1 }}>{t(locale, "onb.banner")}</span>
          <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{t(locale, "onb.bannerCta")}</span>
        </a>
      )}
      <ClientBoard
        projectCards={projectCards}
        header={
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h1 style={{ ...ui.h1, fontSize: "clamp(22px,5vw,30px)" }}>{t(locale, "nav.tasks")}</h1>
            <span style={{ marginLeft: "auto" }}>
              <ChatModal projects={projects} locale={locale} role={me.role} feedbackKey={feedbackKey} />
            </span>
          </div>
        }
        tasks={board}
        projects={projectsWithNew}
        locale={locale}
        canEditStatus={canEditStatus}
        canDelete={canDelete}
        canStart={canStart}
        empty={t(locale, "tasks.empty")}
        feedbackKey={feedbackKey}
      />
    </div>
  );
}
