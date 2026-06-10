import type { Task } from "@/lib/tasks/types";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

const DATE_LOC: Record<Locale, string> = { uk: "uk-UA", ru: "ru-RU", en: "en-US" };

function fmtDate(ms: number | null | undefined, locale: Locale): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString(DATE_LOC[locale], { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function daysSince(ms?: number | null): number | null {
  if (!ms) return null;
  return Math.floor((Date.now() - ms) / 86400000);
}

export function TaskCard({ task, locale }: { task: Task; locale: Locale }) {
  const stale = daysSince(task.updated);
  const isStale = task.resolved == null && stale != null && stale >= 5;
  return (
    <a
      href={task.url}
      target="_blank"
      rel="noreferrer"
      style={{ ...ui.card, display: "block", textDecoration: "none", color: "var(--text)", padding: 18 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{task.id}</span>
        {task.state && <span style={ui.monoLabel}>{task.state}</span>}
        {task.priority && <span style={ui.monoLabel}>· {task.priority}</span>}
        {isStale && (
          <span style={{ ...ui.monoLabel, color: "#e8b339", marginLeft: "auto" }}>
            {t(locale, "card.stale", { n: stale! })}
          </span>
        )}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{task.summary}</div>
      <div style={{ display: "flex", gap: 16, ...ui.monoLabel, textTransform: "none" }}>
        <span>{task.assignee ? `→ ${task.assignee.fullName}` : t(locale, "card.unassigned")}</span>
        {task.reporter && (
          <span>
            {t(locale, "card.from", { name: task.reporter.fullName })}
            {task.reporter.role === "client" ? t(locale, "card.clientTag") : ""}
          </span>
        )}
        {task.updated && (
          <span style={{ marginLeft: "auto" }}>{t(locale, "card.updated", { date: fmtDate(task.updated, locale) })}</span>
        )}
      </div>
    </a>
  );
}

export function TaskList({ tasks, empty, locale }: { tasks: Task[]; empty: string; locale: Locale }) {
  if (!tasks.length) {
    return <p style={{ color: "var(--muted)", fontSize: 14 }}>{empty}</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
      {tasks.map((t) => (
        <TaskCard key={t.id} task={t} locale={locale} />
      ))}
    </div>
  );
}
