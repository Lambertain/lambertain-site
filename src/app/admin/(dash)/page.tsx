import Link from "next/link";
import { redirect } from "next/navigation";
import { getBackend } from "@/lib/tasks";
import type { TaskFilter } from "@/lib/tasks/types";
import { getPrincipal } from "@/lib/principal";
import { visibleProjects } from "@/lib/scope";
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
            <ChatModal projects={dash.map((p) => ({ key: p.key, name: p.name }))} locale={locale} />
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
    // Контрибьютор — задачи, назначенные ему; клиент/сотрудник — задачи своего проекта.
    let filter: TaskFilter = { order: "updated_desc", limit: 300 };
    if (me.role === "contributor" && me.youtrackLogin) {
      filter = { assigneeLogin: me.youtrackLogin, order: "updated_desc", limit: 300 };
    } else if ((me.role === "client" || me.role === "employee") && me.projectKey) {
      filter = { projectKey: me.projectKey, order: "updated_desc", limit: 300 };
    }
    [tasks, reads, projectSeen] = await Promise.all([be.listTasks(filter), getReads(readKey), getProjectReads(readKey)]);
  } catch (e) {
    return <p style={{ color: "#ff5b5b", fontSize: 14 }}>{e instanceof Error ? e.message : "—"}</p>;
  }

  const filtered = tasks.filter((tk) => (me.role === "admin" ? true : visibleKeys.has(tk.projectKey)));
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
  const projectsWithNew = projects.map((p) => {
    const seen = projectSeen.get(p.key) ?? 0;
    const hasNew = filtered.some(
      (tk) => tk.projectKey === p.key && Math.max(tk.created ?? 0, tk.lastCommentAt ?? 0) > seen,
    );
    return { key: p.key, name: p.name, hasNew };
  });

  const canEditStatus = me.realRole === "admin" || me.role === "contributor";
  const canDelete = me.realRole === "admin" || me.role === "client";
  const canStart = me.realRole === "admin" || me.role === "contributor";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ ...ui.h1, fontSize: "clamp(22px,5vw,30px)" }}>{t(locale, me.role === "contributor" ? "nav.myTasks" : "nav.tasks")}</h1>
        {/* Разработчик только выполняет задачи — постановка не его роль. Клиенту чат нужен для заявок. */}
        {me.role !== "contributor" && <ChatModal projects={projects} locale={locale} />}
      </div>
      <TaskTabs
        tasks={board}
        projects={projectsWithNew}
        locale={locale}
        canEditStatus={canEditStatus}
        canDelete={canDelete}
        canStart={canStart}
        empty={t(locale, "tasks.empty")}
      />
    </div>
  );
}
