import Link from "next/link";
import { redirect } from "next/navigation";
import { getBackend } from "@/lib/tasks";
import type { TaskFilter } from "@/lib/tasks/types";
import { getPrincipal } from "@/lib/principal";
import { visibleProjects } from "@/lib/scope";
import { mergeFeedback } from "@/lib/feedback";
import { getReads, getProjectReads, listProjectsWithMeta, taskCountsByProject, getDepsFor } from "@/lib/db";
import { statusBucket } from "@/lib/statuses";
import { nowMs } from "@/lib/now";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { ChatModal } from "./chat-modal";
import { TaskTabs, type BoardTask } from "./task-tabs";
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

    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={ui.monoLabel}>{t(locale, "dash.kicker")}</div>
            <h1 style={{ ...ui.h1, marginTop: 8 }}>{t(locale, "nav.projects")}</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Link href="/admin/projects" style={{ ...ui.monoLabel, color: "var(--muted)", textDecoration: "none" }}>{t(locale, "projects.manage")}</Link>
            <ChatModal projects={dash.map((p) => ({ key: p.key, name: p.name }))} locale={locale} feedbackKey={projects.find((p) => p.meta.feedback)?.key} />
          </div>
        </div>
        <DevDashboard projects={dash} devNames={devNames} now={nowMs()} locale={locale} />
      </div>
    );
  }

  // —— Контрибьютор/клиент/сотрудник: задачи с табами проект→статус ——
  const all = await be.listProjects();
  const visible = visibleProjects(me, all);
  const projects = visible.map((p) => ({ key: p.key, name: p.name }));
  const visibleKeys = new Set(visible.map((p) => p.key));

  let tasks, reads, projectSeen;
  const readKey = me.youtrackLogin || me.fullName || "admin";
  try {
    // Контрибьютор — задачи, назначенные ему; клиент — один проект; сотрудник — все свои проекты (фильтр ниже по visibleKeys).
    let filter: TaskFilter = { order: "updated_desc", limit: 300 };
    if (me.role === "contributor" && me.youtrackLogin) {
      filter = { assigneeLogin: me.youtrackLogin, order: "updated_desc", limit: 300 };
    } else if (me.role === "client" && me.projectKey) {
      filter = { projectKey: me.projectKey, order: "updated_desc", limit: 300 };
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
  const board: BoardTask[] = filtered.map((tk) => {
    const blockers = (depMap.get(tk.id) ?? []).filter((d) => statusBucket(d.status) !== "done");
    const lastRead = reads.get(tk.id) ?? 0;
    // New = новый коммент ИЛИ ещё не открытая задача (created позже последнего просмотра).
    const unread = (tk.lastCommentAt ?? 0) > lastRead || (tk.created ?? 0) > lastRead;
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
      unread,
      blocked: blockers.length > 0,
      blockers: blockers.map((b) => ({ id: b.id, summary: b.summary })),
    };
  });

  // Метка New на проекте: активность задач позже последнего открытия проекта.
  // Фидбек-проект (Lamb.dev) — всегда последним табом; первым — основной проект пользователя.
  const fbSet = new Set(all.filter((p) => p.meta.feedback).map((p) => p.key));
  const projectsWithNew = projects
    .map((p) => {
      const seen = projectSeen.get(p.key) ?? 0;
      const hasNew = filtered.some(
        (tk) => tk.projectKey === p.key && Math.max(tk.created ?? 0, tk.lastCommentAt ?? 0) > seen,
      );
      return { key: p.key, name: p.name, hasNew };
    })
    .sort((a, b) => (fbSet.has(a.key) ? 1 : 0) - (fbSet.has(b.key) ? 1 : 0));

  const canEditStatus = me.realRole === "admin" || me.role === "contributor";
  const canDelete = me.realRole === "admin" || me.role === "client";
  const canStart = me.realRole === "admin" || me.role === "contributor";
  // Клиент с незавершённым онбордингом — баннер со ссылкой на инструкцию.
  const showOnboarding = me.role === "client" && !!visible.find((p) => p.key === me.projectKey)?.meta.showOnboarding;

  return (
    <div>
      {showOnboarding && (
        <Link href="/onboarding" style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", marginBottom: 18, borderRadius: 10, border: "1px solid var(--accent-line)", background: "rgba(185,255,75,0.06)", textDecoration: "none", color: "var(--text)" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
          <span style={{ fontSize: 14, flex: 1 }}>{t(locale, "onb.banner")}</span>
          <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{t(locale, "onb.bannerCta")}</span>
        </Link>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ ...ui.h1, fontSize: "clamp(22px,5vw,30px)" }}>{t(locale, me.role === "contributor" ? "nav.myTasks" : "nav.tasks")}</h1>
        {/* Кнопка создания: клиент/сотрудник — заявки; разработчик — фидбек по Lamb.dev + запрос админу/вопрос клиенту. */}
        <span style={{ marginLeft: "auto" }}>
          <ChatModal projects={projects} locale={locale} isContributor={me.role === "contributor"} feedbackKey={all.find((p) => p.meta.feedback)?.key} />
        </span>
      </div>
      <TaskTabs
        tasks={board}
        projects={projectsWithNew}
        locale={locale}
        canEditStatus={canEditStatus}
        canDelete={canDelete}
        canStart={canStart}
        empty={t(locale, "tasks.empty")}
        feedbackKey={all.find((p) => p.meta.feedback)?.key}
      />
    </div>
  );
}
