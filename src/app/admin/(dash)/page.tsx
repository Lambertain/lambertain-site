import Link from "next/link";
import { redirect } from "next/navigation";
import { getBackend } from "@/lib/tasks";
import type { TaskFilter } from "@/lib/tasks/types";
import { getPrincipal, isSuperAdmin } from "@/lib/principal";
import { visibleProjects } from "@/lib/scope";
import { mergeFeedback } from "@/lib/feedback";
import { getReads, getProjectReads, listProjectsWithMeta, taskCountsByProject, getDepsFor, getEnabledGuides, guideText, commentTimesByTasks } from "@/lib/db";
import { ClientGuides } from "./client-guides";
import { statusBucket, type Bucket } from "@/lib/statuses";
import { ProjectInfoCard } from "./project-info-card";
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
    let projects, counts, users;
    try {
      [projects, counts, users] = await Promise.all([listProjectsWithMeta(), taskCountsByProject(), be.listUsers()]);
    } catch (e) {
      return <p style={{ color: "#ff5b5b", fontSize: 14 }}>{e instanceof Error ? e.message : "—"}</p>;
    }
    const countMap = new Map(counts.map((c) => [c.projectKey, c]));
    const dash: DashProject[] = projects
      .filter((p) => !p.archived)
      .map((p) => {
        const c = countMap.get(p.key);
        return { key: p.key, name: p.name, meta: p.meta, createdAt: p.createdAt, total: c?.total ?? 0, done: c?.done ?? 0 };
      });
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
        <DevDashboard projects={dash} devNames={devNames} now={nowMs()} locale={locale} />
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
  const projects = visible.map((p) => ({ key: p.key, name: p.name })).sort(byFeedbackLast);
  const visibleKeys = new Set(visible.map((p) => p.key));

  let tasks, reads, projectSeen;
  const readKey = me.youtrackLogin || me.fullName || "admin";
  try {
    // Разработчик/сотрудник — ВСЕ задачи их проектов (включая исторические/выполненные, а не только назначенные
    // ему лично — новый участник проекта должен видеть всю историю); клиент — его единственный проект.
    let filter: TaskFilter = { order: "updated_desc", limit: 300 };
    if (me.role === "client" && me.projectKey) {
      filter = { projectKey: me.projectKey, order: "updated_desc", limit: 300 };
    } else if (me.role === "contributor" || me.role === "employee") {
      filter = { projectKeys: [...visibleKeys], order: "updated_desc", limit: 300 };
    }
    [tasks, reads, projectSeen] = await Promise.all([be.listTasks(filter), getReads(readKey), getProjectReads(readKey)]);
  } catch (e) {
    return <p style={{ color: "#ff5b5b", fontSize: 14 }}>{e instanceof Error ? e.message : "—"}</p>;
  }

  const visibleFiltered = tasks.filter((tk) => (me.role === "admin" ? true : visibleKeys.has(tk.projectKey)));
  // Фидбек-проект: убрать чужие фидбек-задачи, подмешать свои; клиенту — скрыть внутренние (разработчик→админ).
  const merged = await mergeFeedback(me, all, visibleFiltered);
  const filtered = me.role === "client" ? merged.filter((tk) => !tk.internal) : merged;
  const depMap = await getDepsFor(filtered.map((tk) => tk.id));
  const commentTimes = await commentTimesByTasks(filtered.map((tk) => tk.id));
  const board: BoardTask[] = filtered.map((tk) => {
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
      blocked: blockers.length > 0,
      blockers: blockers.map((b) => ({ id: b.id, summary: b.summary })),
      // Клиенту ops-шаг агентства (ownerAction) не показываем; его собственное действие (clientAction) — показываем.
      ownerAction: me.role === "client" ? null : tk.ownerAction,
      clientAction: tk.clientAction,
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
    let nw = 0;
    for (const b of board) {
      if (b.projectKey !== k) continue;
      c[b.blocked ? "blocked" : statusBucket(b.status)]++;
      // NEW на проекте — кол-во НОВЫХ задач (ещё не открытых), среди активных (Done не считаем).
      if (b.isNew && statusBucket(b.status) !== "done") nw++;
    }
    return { counts: c as Record<Bucket, number>, newCount: nw };
  };

  // —— Разработчик: дашборд своих проектов (инфо, прогресс, счётчики, доступы) ——
  if (me.role === "contributor") {
    const myProjects = visible.filter((p) => !p.meta.feedback);
    // Lamb.dev (фидбек) — последней карточкой, как и у остальных участников (без доступов/прод-ссылки).
    const fbProject = visible.find((p) => p.meta.feedback);
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
                return <ProjectInfoCard key={p.key} project={p} canEdit showDevLink counts={counts} newCount={newCount} now={now} locale={locale} />;
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

  // —— Клиент: онбординг-баннер + «Подготовка» (гайды) + инфо своего проекта + задачи ——
  const myProject = me.role === "client" ? visible.find((p) => p.key === me.projectKey) : undefined;
  const showOnboarding = me.role === "client" && !!myProject?.meta.showOnboarding;
  const instructionSetToken = me.role === "client" ? myProject?.meta.onboardingSetToken : undefined;
  // Карточки всех клиентских проектов (кроме feedback) — по ключу; ClientBoard покажет карточку ВЫБРАННОГО проекта.
  const clientProjects = me.role === "client" ? visible.filter((p) => !p.meta.feedback) : [];
  const projectCards: Record<string, React.ReactNode> = Object.fromEntries(
    clientProjects.map((p) => [p.key, <ProjectInfoCard key={p.key} project={p} now={now} locale={locale} />]),
  );
  const clientGuides = me.role === "client" && me.projectKey ? await getEnabledGuides(me.projectKey) : [];

  return (
    <div>
      <ClientGuides guides={clientGuides.map((g) => ({ id: g.id, ...guideText(g, locale) }))} locale={locale} />
      {showOnboarding && (
        <Link href="/onboarding" style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", marginBottom: 18, borderRadius: 10, border: "1px solid var(--accent-line)", background: "rgba(185,255,75,0.06)", textDecoration: "none", color: "var(--text)" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
          <span style={{ fontSize: 14, flex: 1 }}>{t(locale, "onb.banner")}</span>
          <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{t(locale, "onb.bannerCta")}</span>
        </Link>
      )}
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
