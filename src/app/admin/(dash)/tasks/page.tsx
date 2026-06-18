import { getBackend } from "@/lib/tasks";
import type { TaskFilter } from "@/lib/tasks/types";
import { getPrincipal, isSuperAdmin } from "@/lib/principal";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { getReads, getProjectReads, getDepsFor } from "@/lib/db";
import { mergeFeedback } from "@/lib/feedback";
import { visibleProjects } from "@/lib/scope";
import { statusBucket, BUCKET_ORDER, type Bucket } from "@/lib/statuses";
import { TaskList } from "../task-card";
import { TaskTabs, type BoardTask } from "../task-tabs";
import { nowMs } from "@/lib/now";
import { ui } from "../../ui-styles";

export const dynamic = "force-dynamic";

const STALE_DAYS = 5;

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ project?: string; tab?: string; mine?: string }> }) {
  const me = await getPrincipal();
  if (!me) redirect("/admin/login");
  const locale = await getLocale();
  const be = getBackend();
  const readKey = me.youtrackLogin || me.fullName || "admin";

  // —— Админ: задачи попроектно (табы проект → статус), как у разработчика ——
  if (me.role === "admin") {
    const sp = await searchParams;
    const superA = isSuperAdmin(me);
    const mine = sp.mine === "1";
    // Оба админа (обычный и супер) видят ВСЕ задачи по умолчанию. Тумблер «Мои задачи» — только те, что
    // поставил текущий пользователь в связке пользователь+роль: супер-админ ставит без member-логина
    // (reporter IS NULL), обычный админ (напр. Настя) — под своим логином (reporter == он).
    const taskFilter: TaskFilter = !mine
      ? { order: "updated_desc", limit: 300 }
      : superA
        ? { reporterIsNull: true, order: "updated_desc", limit: 300 }
        : { reporterLogin: me.youtrackLogin, order: "updated_desc", limit: 300 };
    let projectsList, tasks, reads, projectSeen;
    try {
      [projectsList, tasks, reads, projectSeen] = await Promise.all([
        be.listProjects(),
        be.listTasks(taskFilter),
        getReads(readKey),
        getProjectReads(readKey),
      ]);
    } catch (e) {
      return (
        <div>
          <h1 style={ui.h1}>{t(locale, "tasks.allTitle")}</h1>
          <p style={{ color: "#ff5b5b", fontSize: 14 }}>{t(locale, "error.load")}{e instanceof Error ? e.message : "—"}</p>
        </div>
      );
    }
    // В режиме «Мои задачи» показываем только проекты, где есть мои АКТИВНЫЕ (не выполненные) задачи; на «Все» — все проекты.
    const activeKeys = new Set(tasks.filter((tk) => statusBucket(tk.state) !== "done").map((tk) => tk.projectKey));
    const projects = (mine ? projectsList.filter((p) => activeKeys.has(p.key)) : projectsList).map((p) => ({ key: p.key, name: p.name }));
    const depMap = await getDepsFor(tasks.map((tk) => tk.id));
    const board: BoardTask[] = tasks.map((tk) => {
      const blockers = (depMap.get(tk.id) ?? []).filter((d) => statusBucket(d.status) !== "done");
      const lastRead = reads.get(tk.id) ?? 0;
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
        assignee: tk.assignee?.fullName ?? null,
        unread,
        blocked: blockers.length > 0,
        blockers: blockers.map((b) => ({ id: b.id, summary: b.summary })),
      };
    });
    const fbSet = new Set(projectsList.filter((p) => p.meta.feedback).map((p) => p.key));
    const projectsWithNew = projects
      .map((p) => {
        const seen = projectSeen.get(p.key) ?? 0;
        const hasNew = tasks.some((tk) => tk.projectKey === p.key && Math.max(tk.created ?? 0, tk.lastCommentAt ?? 0) > seen);
        return { key: p.key, name: p.name, hasNew };
      })
      .sort((a, b) => (fbSet.has(a.key) ? 1 : 0) - (fbSet.has(b.key) ? 1 : 0));

    // Тумблер «Все / Мои задачи». Супер-админ переключает всю массу↔свои; обычный админ — свои+назначенные↔только свои.
    const pill = (active: boolean): React.CSSProperties => ({
      ...ui.monoLabel, textDecoration: "none", padding: "6px 12px", borderRadius: 999,
      border: `1px solid ${active ? "var(--accent-line)" : "var(--border-2)"}`,
      color: active ? "var(--accent)" : "var(--muted)", background: active ? "rgba(185,255,75,0.06)" : "transparent",
    });
    return (
      <div>
        <div style={ui.monoLabel}>{t(locale, "tasks.allKicker")}</div>
        <h1 style={{ ...ui.h1, marginTop: 8 }}>{mine ? t(locale, "tasks.mineTitle") : t(locale, "tasks.allTitle")}</h1>
        <div style={{ display: "flex", gap: 8, marginTop: 12, marginBottom: 4 }}>
          <Link href="/admin/tasks" style={pill(!mine)}>{t(locale, "tasks.filterAll")}</Link>
          <Link href="/admin/tasks?mine=1" style={pill(mine)}>{t(locale, "tasks.filterMine")}</Link>
        </div>
        <TaskTabs
          tasks={board}
          projects={projectsWithNew}
          locale={locale}
          canEditStatus={true}
          canDelete={true}
          canStart={false}
          empty={t(locale, "tasks.empty")}
          feedbackKey={projectsList.find((p) => p.meta.feedback)?.key}
          allowAll
        />
      </div>
    );
  }

  // —— Контрибьютор: задачи попроектно (табы проект→статус), дип-линк из карточки проекта (?project=&tab=) ——
  if (me.role === "contributor") {
    const sp = await searchParams;
    const all = await be.listProjects();
    const visible = visibleProjects(me, all);
    const fbSet = new Set(all.filter((p) => p.meta.feedback).map((p) => p.key));
    const byFbLast = (a: { key: string }, b: { key: string }) => (fbSet.has(a.key) ? 1 : 0) - (fbSet.has(b.key) ? 1 : 0);
    const filter: TaskFilter = me.youtrackLogin
      ? { assigneeLogin: me.youtrackLogin, order: "updated_desc", limit: 300 }
      : { order: "updated_desc", limit: 300 };
    let raw, reads, projectSeen;
    try {
      [raw, reads, projectSeen] = await Promise.all([be.listTasks(filter), getReads(readKey), getProjectReads(readKey)]);
    } catch (e) {
      return (
        <div>
          <h1 style={ui.h1}>{t(locale, "tasks.mineTitle")}</h1>
          <p style={{ color: "#ff5b5b", fontSize: 14 }}>{t(locale, "error.load")}{e instanceof Error ? e.message : "—"}</p>
        </div>
      );
    }
    const merged = await mergeFeedback(me, all, raw);
    const depMap = await getDepsFor(merged.map((tk) => tk.id));
    const board: BoardTask[] = merged.map((tk) => {
      const blockers = (depMap.get(tk.id) ?? []).filter((d) => statusBucket(d.status) !== "done");
      const lastRead = reads.get(tk.id) ?? 0;
      const unread = (tk.lastCommentAt ?? 0) > lastRead || (tk.created ?? 0) > lastRead;
      return {
        id: tk.id, projectKey: tk.projectKey, summary: tk.summary, status: tk.state || "Open",
        description: tk.description, created: tk.created, updated: tk.updated, commentCount: tk.commentCount,
        assignee: tk.assignee?.fullName ?? null, unread,
        blocked: blockers.length > 0, blockers: blockers.map((b) => ({ id: b.id, summary: b.summary })),
      };
    });
    const projectsWithNew = visible
      .map((p) => {
        const seen = projectSeen.get(p.key) ?? 0;
        const hasNew = merged.some((tk) => tk.projectKey === p.key && Math.max(tk.created ?? 0, tk.lastCommentAt ?? 0) > seen);
        return { key: p.key, name: p.name, hasNew };
      })
      .sort(byFbLast);
    const initialProject = typeof sp.project === "string" ? sp.project : undefined;
    const initialBucket = (BUCKET_ORDER as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Bucket) : undefined;
    return (
      <div>
        <div style={ui.monoLabel}>{t(locale, "tasks.mineKicker")}</div>
        <h1 style={{ ...ui.h1, marginTop: 8 }}>{t(locale, "tasks.mineTitle")}</h1>
        <TaskTabs
          tasks={board}
          projects={projectsWithNew}
          locale={locale}
          canEditStatus={true}
          canDelete={false}
          canStart={true}
          empty={t(locale, "tasks.empty")}
          feedbackKey={all.find((p) => p.meta.feedback)?.key}
          initialProject={initialProject}
          initialBucket={initialBucket}
          allowAll
        />
      </div>
    );
  }

  // —— Клиент: плоский список своих задач ——
  let filter: TaskFilter = { unresolvedOnly: true, order: "updated_desc" };
  let title = t(locale, "tasks.allTitle");
  let kicker = t(locale, "tasks.allKicker");

  if (me.role === "client" && me.youtrackLogin) {
    filter = { reporterLogin: me.youtrackLogin, order: "updated_desc" };
    title = t(locale, "tasks.clientTitle");
    kicker = t(locale, "tasks.clientKicker");
  }

  let tasks;
  try {
    const [raw, projects] = await Promise.all([be.listTasks(filter), be.listProjects()]);
    tasks = await mergeFeedback(me, projects, raw); // фидбек-проект: только свои задачи
  } catch (e) {
    return (
      <div>
        <h1 style={ui.h1}>{title}</h1>
        <p style={{ color: "#ff5b5b", fontSize: 14 }}>
          {t(locale, "error.load")}
          {e instanceof Error ? e.message : "—"}
        </p>
      </div>
    );
  }

  const threshold = nowMs() - STALE_DAYS * 86400000;
  const stale = tasks.filter((x) => x.resolved == null && x.updated != null && x.updated < threshold);
  const fresh = tasks.filter((x) => !stale.includes(x));

  return (
    <div>
      <div style={ui.monoLabel}>{kicker}</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>{title}</h1>

      {stale.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ ...ui.monoLabel, color: "#e8b339" }}>
            {t(locale, "overdue.title")} · {stale.length}
          </div>
          <TaskList tasks={stale} empty="" locale={locale} hideWorkers={me.role === "client"} />
        </div>
      )}

      <TaskList tasks={fresh} empty={t(locale, "tasks.empty")} locale={locale} hideWorkers={me.role === "client"} />
    </div>
  );
}
