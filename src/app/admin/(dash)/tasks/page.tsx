import { getBackend } from "@/lib/tasks";
import type { TaskFilter } from "@/lib/tasks/types";
import { getPrincipal, isSuperAdmin } from "@/lib/principal";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { getReads, getProjectReads, getDepsFor, getStatusHistoryFor, projectQueueTasks, getDelegationsFor } from "@/lib/db";
import { statusDotRows, segmentDayNumber } from "@/lib/status-timer";
import { mergeFeedback } from "@/lib/feedback";
import { visibleProjects } from "@/lib/scope";
import { statusBucket, BUCKET_ORDER, type Bucket } from "@/lib/statuses";
import { taskAddressee } from "@/lib/task-addressee";
import { TaskList } from "../task-card";
import { TaskTabs, type BoardTask } from "../task-tabs";
import { nowMs } from "@/lib/now";
import { ui } from "../../ui-styles";

export const dynamic = "force-dynamic";

const STALE_DAYS = 5;

/**
 * «Голова очереди» по каждому проекту — задача, у которой показываем тикающий Open-кружок (сигнал разработчику
 * «эту бери в работу»). Это первая (по номеру KEY-N) незакрытая незаблокированная Open-задача проекта, и только
 * когда по проекту НЕТ активной работы (нет задач в In Progress/Rework): пока разработчик кодит одну задачу,
 * остальной бэклог не должен «просрочиваться». У всех прочих Open-задач отсчёт стартует лишь при взятии в работу.
 */
function queueHeadIds(
  tasks: Array<{ id: string; projectKey: string; state?: string | null; ownerAction?: string | null; clientAction?: string | null }>,
): Set<string> {
  const num = (id: string) => { const m = id.match(/(\d+)\s*$/); return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER; };
  const byProj = new Map<string, typeof tasks>();
  for (const tk of tasks) { const a = byProj.get(tk.projectKey); if (a) a.push(tk); else byProj.set(tk.projectKey, [tk]); }
  const heads = new Set<string>();
  for (const list of byProj.values()) {
    const busy = list.some((tk) => { const b = statusBucket(tk.state); return b === "inProgress" || b === "rework"; });
    if (busy) continue;
    const head = list
      .filter((tk) => statusBucket(tk.state) === "notStarted" && !tk.ownerAction && !tk.clientAction)
      .sort((a, b) => num(a.id) - num(b.id))[0];
    if (head) heads.add(head.id);
  }
  return heads;
}

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
    const [depMap, histMap, headInfo] = await Promise.all([getDepsFor(tasks.map((tk) => tk.id)), getStatusHistoryFor(tasks.map((tk) => tk.id)), projectQueueTasks(projectsList.map((p) => p.key))]);
    const now = nowMs();
    // «Голова очереди» считается по ПОЛНОМУ набору задач проекта (headInfo), а не по limit-окну доски — иначе
    // при пагинации кружок «бери в работу» вылезал на случайной задаче (не первой в очереди).
    const heads = queueHeadIds(headInfo);
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
        ownerAction: tk.ownerAction,
        reporterAction: tk.reporterAction,
        awaitingMyAnswer: !!tk.reporterAction && !!me.youtrackLogin && tk.reporter?.login === me.youtrackLogin,
        clientAction: tk.clientAction,
        deployStage: tk.deployStage,
        addressee: taskAddressee(tk),
        statusRows: statusDotRows({ createdMs: tk.created ?? now, resolvedMs: tk.resolved, currentStatus: tk.state || "Open", events: histMap.get(tk.id) ?? [], nowMs: now, suppressCurrentOpen: statusBucket(tk.state) === "notStarted" && !heads.has(tk.id) }),
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
          initialProject={typeof sp.project === "string" ? sp.project : undefined}
          initialBucket={(BUCKET_ORDER as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Bucket) : undefined}
          allowAll
          searchable
        />
      </div>
    );
  }

  // —— Разработчик/сотрудник: задачи попроектно (табы проект→статус), дип-линк из карточки проекта (?project=&tab=).
  // Видят ВСЕ задачи своих проектов (включая исторические/выполненные), а не только назначенные лично —
  // новый участник проекта должен видеть всю историю. ——
  if (me.role === "contributor" || me.role === "employee") {
    const sp = await searchParams;
    const all = await be.listProjects();
    const visible = visibleProjects(me, all);
    const fbSet = new Set(all.filter((p) => p.meta.feedback).map((p) => p.key));
    const byFbLast = (a: { key: string }, b: { key: string }) => (fbSet.has(a.key) ? 1 : 0) - (fbSet.has(b.key) ? 1 : 0);
    const filter: TaskFilter = { projectKeys: visible.map((p) => p.key), order: "updated_desc", limit: 300 };
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
    const merged0 = await mergeFeedback(me, all, raw);
    // Разработчик/сотрудник видит internal только адресованные деву (admin/super), но НЕ личные само-задачи супер-админа.
    const merged = me.realRole === "admin" ? merged0 : merged0.filter((tk) => !tk.internal || tk.createdByRole === "admin" || tk.createdByRole === "super");
    const [depMap, histMap, headInfo] = await Promise.all([getDepsFor(merged.map((tk) => tk.id)), getStatusHistoryFor(merged.map((tk) => tk.id)), projectQueueTasks(visible.map((p) => p.key))]);
    const now = nowMs();
    // «Голова очереди» — по ПОЛНОМУ набору задач видимых проектов (не по limit-окну доски).
    const heads = queueHeadIds(headInfo);
    const board: BoardTask[] = merged.map((tk) => {
      const blockers = (depMap.get(tk.id) ?? []).filter((d) => statusBucket(d.status) !== "done");
      const lastRead = reads.get(tk.id) ?? 0;
      const unread = (tk.lastCommentAt ?? 0) > lastRead || (tk.created ?? 0) > lastRead;
      return {
        id: tk.id, projectKey: tk.projectKey, summary: tk.summary, status: tk.state || "Open",
        description: tk.description, created: tk.created, updated: tk.updated, commentCount: tk.commentCount,
        assignee: tk.assignee?.fullName ?? null, unread,
        blocked: blockers.length > 0, blockers: blockers.map((b) => ({ id: b.id, summary: b.summary })),
        ownerAction: tk.ownerAction, reporterAction: tk.reporterAction,
        awaitingMyAnswer: !!tk.reporterAction && !!me.youtrackLogin && tk.reporter?.login === me.youtrackLogin,
        clientAction: tk.clientAction, deployStage: tk.deployStage,
        addressee: taskAddressee(tk),
        statusRows: statusDotRows({ createdMs: tk.created ?? now, resolvedMs: tk.resolved, currentStatus: tk.state || "Open", events: histMap.get(tk.id) ?? [], nowMs: now, suppressCurrentOpen: statusBucket(tk.state) === "notStarted" && !heads.has(tk.id) }),
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
          canEditStatus={me.role === "contributor"}
          canDelete={false}
          canStart={me.role === "contributor"}
          empty={t(locale, "tasks.empty")}
          feedbackKey={all.find((p) => p.meta.feedback)?.key}
          initialProject={initialProject}
          initialBucket={initialBucket}
          allowAll
          searchable
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

  // Кружки давности делегирования — только клиенту: сколько «висит» задача у его сотрудника
  // (green<24ч / amber<48ч / red≥48ч). При выполнении отсчёт замораживается (зелёный ✓).
  const now = nowMs();
  const delegRaw = me.role === "client" ? await getDelegationsFor(tasks.map((x) => x.id)) : new Map<string, { at: number; doneAt: number | null }>();
  const delegDots = new Map<string, { days: number; done: boolean }>();
  for (const [id, d] of delegRaw) delegDots.set(id, { days: segmentDayNumber(d.at, d.doneAt ?? now), done: d.doneAt != null });

  return (
    <div>
      <div style={ui.monoLabel}>{kicker}</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>{title}</h1>

      {stale.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ ...ui.monoLabel, color: "#e8b339" }}>
            {t(locale, "overdue.title")} · {stale.length}
          </div>
          <TaskList tasks={stale} empty="" locale={locale} hideWorkers={me.role === "client"} deleg={delegDots} />
        </div>
      )}

      <TaskList tasks={fresh} empty={t(locale, "tasks.empty")} locale={locale} hideWorkers={me.role === "client"} deleg={delegDots} />
    </div>
  );
}
