import Link from "next/link";
import type { ProjectMeta } from "@/lib/tasks/types";
import { projectFinance } from "@/lib/finance";
import { type RepoSyncStatus } from "@/lib/repo-sync";
import { t, type Locale } from "@/lib/i18n";
import { DevActivityChart } from "./dev-activity-chart";
import { SyncBadge } from "./sync-badge";
import { ProjectTimeline } from "./project-timeline";
import { ui } from "../ui-styles";

export type DashProject = {
  key: string;
  name: string;
  meta: ProjectMeta;
  createdAt: string | null;
  total: number;
  done: number;
  /** Статус синка dev↔client репо (только для админского дашборда). */
  sync?: RepoSyncStatus;
};

const DAY = 86400000;
function daysBetween(from: number, to: number): number {
  return Math.round((to - from) / DAY);
}

/** Вычисленные метрики проекта для карточки. */
function metrics(p: DashProject, now: number) {
  const startedMs = p.meta.startedAt ? new Date(p.meta.startedAt).getTime() : p.createdAt ? new Date(p.createdAt).getTime() : null;
  const deadlineMs = p.meta.deadline ? new Date(p.meta.deadline).getTime() : null;
  const daysRunning = startedMs != null ? Math.max(0, daysBetween(startedMs, now)) : null;
  const daysLeft = deadlineMs != null ? daysBetween(now, deadlineMs) : null; // <0 → просрочка
  return { startedMs, deadlineMs, daysRunning, daysLeft };
}

function money(cost: number | undefined, currency: string | undefined): string | null {
  if (cost == null || !Number.isFinite(cost)) return null;
  return `${cost.toLocaleString()} ${currency || "₴"}`;
}

function ProjectCard({ p, now, locale }: { p: DashProject; now: number; locale: Locale }) {
  const m = metrics(p, now);
  const pay = projectFinance(p.meta);
  const cost = pay.isClient ? money(pay.effectiveCost, pay.currency) : null;
  return (
    <Link
      href={`/admin/projects/${p.key}`}
      className="pm-dash-card"
      style={{ display: "block", border: "1px solid var(--border)", padding: 14, background: "var(--surface-2)", color: "inherit", textDecoration: "none" }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{p.key}</span>
          <strong style={{ fontSize: 15 }}>{p.name}</strong>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* Синхронизация dev↔client репо (доставлено ли всё клиенту). */}
          <SyncBadge s={p.sync} locale={locale} />
          {/* Стоимость — только на админском дашборде (исполнитель/клиент сюда доступа не имеют). */}
          {cost && <span style={{ ...ui.monoLabel, color: "var(--text)", fontSize: 12 }}>{cost}</span>}
        </div>
      </div>

      {pay.isClient && (
        <div style={{ display: "flex", gap: 14, ...ui.monoLabel, textTransform: "none", marginTop: 8, flexWrap: "wrap" }}>
          <span style={{ color: "var(--accent)" }}>{t(locale, "dash.paid")}: {pay.paid.toLocaleString()} {pay.currency}</span>
          <span style={{ color: pay.remaining > 0 ? "#e8b339" : "var(--muted)" }}>{t(locale, "dash.unpaid")}: {pay.remaining.toLocaleString()} {pay.currency}</span>
          {pay.payments.length > 0 && <span style={{ color: "var(--muted)" }}>{pay.payments.length} {t(locale, "fin.paymentsN")}</span>}
        </div>
      )}

      <div style={{ display: "flex", gap: 16, ...ui.monoLabel, textTransform: "none", marginTop: 10, flexWrap: "wrap" }}>
        {m.daysRunning != null && <span>{m.daysRunning} {t(locale, "dash.daysRunning")}</span>}
        {m.daysLeft != null ? (
          m.daysLeft >= 0 ? (
            <span>{m.daysLeft} {t(locale, "dash.daysLeft")}</span>
          ) : (
            <span style={{ color: "#ff5b5b" }}>{-m.daysLeft} {t(locale, "dash.overdueDays")}</span>
          )
        ) : (
          <span style={{ color: "var(--muted)" }}>{t(locale, "dash.noDeadline")}</span>
        )}
        <span>
          {t(locale, "dash.tasks")}: {p.done}/{p.total}
        </span>
      </div>

      <ProjectTimeline startedMs={m.startedMs} deadlineMs={m.deadlineMs} now={now} locale={locale} />
    </Link>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div style={{ minWidth: 100 }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 24, letterSpacing: "0.02em", color: color || "var(--text)" }}>{value}</div>
      <div style={{ ...ui.monoLabel, textTransform: "none", marginTop: 4 }}>{label}</div>
    </div>
  );
}

/** Финансовый блок: проекты (всего/личные/клиентские) и деньги (всего/получено/осталось). */
function FinBlock({ projects, locale }: { projects: DashProject[]; locale: Locale }) {
  const client = projects.filter((p) => projectFinance(p.meta).isClient);
  const personal = projects.length - client.length;
  const currency = client.find((p) => p.meta.currency)?.meta.currency || "₴";
  let total = 0, received = 0, notReceived = 0;
  for (const p of client) {
    const pay = projectFinance(p.meta);
    total += pay.effectiveCost;
    received += pay.paid;
    notReceived += pay.remaining;
  }
  const fmt = (n: number) => `${n.toLocaleString()} ${currency}`;

  return (
    <div style={{ ...ui.card, marginTop: 16 }}>
      <div style={ui.monoLabel}>{t(locale, "fin.kicker")}</div>
      <h2 style={{ ...ui.h1, fontSize: 22, margin: "8px 0 0" }}>{t(locale, "fin.title")}</h2>
      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginTop: 16 }}>
        <Stat value={String(projects.length)} label={t(locale, "fin.projectsInWork")} />
        <Stat value={String(personal)} label={t(locale, "fin.personal")} />
        <Stat value={String(client.length)} label={t(locale, "fin.client")} />
        <Stat value={fmt(total)} label={t(locale, "fin.total")} color="var(--accent)" />
        <Stat value={fmt(received)} label={t(locale, "fin.received")} color="var(--accent)" />
        <Stat value={fmt(notReceived)} label={t(locale, "fin.notReceived")} color={notReceived > 0 ? "#e8b339" : "var(--muted)"} />
      </div>
    </div>
  );
}

function DevBlock({
  title,
  projects,
  now,
  locale,
  days,
  doneMap,
}: {
  title: string;
  projects: DashProject[];
  now: number;
  locale: Locale;
  days: string[];
  doneMap: Record<string, Record<string, number>>;
}) {
  const currency = projects.find((p) => p.meta.currency)?.meta.currency || "₴";
  const totalCost = projects.reduce((s, p) => s + projectFinance(p.meta).effectiveCost, 0);
  const openTasks = projects.reduce((s, p) => s + (p.total - p.done), 0);

  return (
    <div style={{ ...ui.card, marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ ...ui.h1, fontSize: 22, margin: 0 }}>{title}</h2>
        <div style={{ display: "flex", gap: 16, ...ui.monoLabel, textTransform: "none" }}>
          <span>
            {projects.length} {t(locale, "dash.projectsCount")}
          </span>
          <span>
            {openTasks} {t(locale, "dash.openTasks")}
          </span>
          {totalCost > 0 && (
            <span style={{ color: "var(--accent)" }}>
              {t(locale, "dash.totalCost")}: {totalCost.toLocaleString()} {currency}
            </span>
          )}
        </div>
      </div>
      <DevActivityChart projects={projects.map((p) => ({ key: p.key, name: p.name }))} days={days} doneMap={doneMap} locale={locale} />
      <div className="pm-grid-2" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, marginTop: 14 }}>
        {projects.map((p) => (
          <ProjectCard key={p.key} p={p} now={now} locale={locale} />
        ))}
      </div>
    </div>
  );
}

export function DevDashboard({
  projects,
  devNames,
  now,
  locale,
  days,
  doneDaily,
}: {
  projects: DashProject[];
  /** login → отображаемое имя разработчика. */
  devNames: Record<string, string>;
  now: number;
  locale: Locale;
  /** 7 дат YYYY-MM-DD (Київ TZ), от старой к новой — для недельного графика активности. */
  days: string[];
  /** Выполнено задач по проекту и дню (история из task_events). */
  doneDaily: { projectKey: string; day: string; count: number }[];
}) {
  if (!projects.length) {
    return <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 16 }}>{t(locale, "dash.empty")}</p>;
  }

  // projectKey → (день → кол-во выполненных) — для графика по каждому разработчику.
  const doneMap: Record<string, Record<string, number>> = {};
  for (const r of doneDaily) (doneMap[r.projectKey] ??= {})[r.day] = r.count;

  // Группировка по ответственному разработчику.
  const groups = new Map<string, DashProject[]>();
  const unassigned: DashProject[] = [];
  for (const p of projects) {
    const dev = p.meta.defaultAssignee;
    if (dev) {
      const arr = groups.get(dev) ?? [];
      arr.push(p);
      groups.set(dev, arr);
    } else {
      unassigned.push(p);
    }
  }
  const devLogins = [...groups.keys()].sort((a, b) => (devNames[a] || a).localeCompare(devNames[b] || b));

  return (
    <div>
      <FinBlock projects={projects} locale={locale} />
      {devLogins.map((login) => (
        <DevBlock key={login} title={devNames[login] || login} projects={groups.get(login)!} now={now} locale={locale} days={days} doneMap={doneMap} />
      ))}
      {unassigned.length > 0 && (
        <DevBlock title={t(locale, "dash.unassigned")} projects={unassigned} now={now} locale={locale} days={days} doneMap={doneMap} />
      )}
    </div>
  );
}
