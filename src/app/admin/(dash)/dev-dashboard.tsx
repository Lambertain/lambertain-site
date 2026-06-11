import Link from "next/link";
import type { ProjectMeta } from "@/lib/tasks/types";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

export type DashProject = {
  key: string;
  name: string;
  meta: ProjectMeta;
  createdAt: string | null;
  total: number;
  done: number;
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
  const timePct =
    startedMs != null && deadlineMs != null && deadlineMs > startedMs
      ? Math.min(100, Math.max(0, Math.round(((now - startedMs) / (deadlineMs - startedMs)) * 100)))
      : null;
  const taskPct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
  return { daysRunning, daysLeft, timePct, taskPct };
}

function Bar({ pct, label, danger }: { pct: number; label: string; danger?: boolean }) {
  const color = danger ? "#ff5b5b" : "var(--accent)";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", ...ui.monoLabel, textTransform: "none", marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color }}>{pct}%</span>
      </div>
      <div style={{ height: 6, background: "var(--surface-2)", border: "1px solid var(--border-2)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}

function money(cost: number | undefined, currency: string | undefined): string | null {
  if (cost == null || !Number.isFinite(cost)) return null;
  return `${cost.toLocaleString()} ${currency || "₴"}`;
}

/** Оплата проекта: общая сумма, части, сколько оплачено/осталось. */
function payment(meta: ProjectMeta) {
  const cost = Number.isFinite(meta.cost) ? (meta.cost as number) : 0;
  const parts = meta.parts && meta.parts >= 1 ? Math.floor(meta.parts) : 1;
  const paidParts = Math.min(Math.max(Math.floor(meta.paidParts ?? 0), 0), parts);
  const paid = cost > 0 ? Math.round((cost * paidParts) / parts) : 0;
  const unpaid = Math.max(0, cost - paid);
  return { cost, currency: meta.currency || "₴", parts, paidParts, paid, unpaid, isClient: cost > 0 };
}

function ProjectCard({ p, now, locale }: { p: DashProject; now: number; locale: Locale }) {
  const m = metrics(p, now);
  const cost = money(p.meta.cost, p.meta.currency);
  const pay = payment(p.meta);
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
        {/* Стоимость — только на админском дашборде (исполнитель/клиент сюда доступа не имеют). */}
        {cost && <span style={{ ...ui.monoLabel, color: "var(--text)", fontSize: 12 }}>{cost}</span>}
      </div>

      {pay.isClient && (
        <div style={{ display: "flex", gap: 14, ...ui.monoLabel, textTransform: "none", marginTop: 8, flexWrap: "wrap" }}>
          <span style={{ color: "var(--accent)" }}>{t(locale, "dash.paid")}: {pay.paid.toLocaleString()} {pay.currency}</span>
          <span style={{ color: pay.unpaid > 0 ? "#e8b339" : "var(--muted)" }}>{t(locale, "dash.unpaid")}: {pay.unpaid.toLocaleString()} {pay.currency}</span>
          <span style={{ color: "var(--muted)" }}>{pay.paidParts}/{pay.parts} {t(locale, "dash.parts")}</span>
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

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {m.timePct != null && <Bar pct={m.timePct} label={t(locale, "dash.byTime")} danger={m.daysLeft != null && m.daysLeft < 0} />}
        <Bar pct={m.taskPct} label={t(locale, "dash.byTasks")} />
      </div>
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
  const client = projects.filter((p) => (p.meta.cost ?? 0) > 0);
  const personal = projects.length - client.length;
  const currency = client.find((p) => p.meta.currency)?.meta.currency || "₴";
  let total = 0, received = 0, notReceived = 0;
  for (const p of client) {
    const pay = payment(p.meta);
    total += pay.cost;
    received += pay.paid;
    notReceived += pay.unpaid;
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
}: {
  title: string;
  projects: DashProject[];
  now: number;
  locale: Locale;
}) {
  const currency = projects.find((p) => p.meta.currency)?.meta.currency || "₴";
  const totalCost = projects.reduce((s, p) => s + (Number.isFinite(p.meta.cost) ? (p.meta.cost as number) : 0), 0);
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
}: {
  projects: DashProject[];
  /** login → отображаемое имя разработчика. */
  devNames: Record<string, string>;
  now: number;
  locale: Locale;
}) {
  if (!projects.length) {
    return <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 16 }}>{t(locale, "dash.empty")}</p>;
  }

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
        <DevBlock key={login} title={devNames[login] || login} projects={groups.get(login)!} now={now} locale={locale} />
      ))}
      {unassigned.length > 0 && (
        <DevBlock title={t(locale, "dash.unassigned")} projects={unassigned} now={now} locale={locale} />
      )}
    </div>
  );
}
