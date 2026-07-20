import type { Task } from "@/lib/tasks/types";
import { t, type Locale } from "@/lib/i18n";
import { CopySlug } from "./copy-slug";
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

// Кружок давности делегирования (клиенту): число дней «висения» задачи у сотрудника, цвет по возрасту.
// green — первые сутки, amber — вторые, red — третьи и далее. При выполнении — зелёный ✓ (отсчёт заморожен).
const DELEG_COLOR = (days: number): string => (days <= 1 ? "#3fb950" : days === 2 ? "#e8b339" : "#ff5b5b");
function DelegDot({ days, done, locale }: { days: number; done: boolean; locale: Locale }) {
  const bg = done ? "#3fb950" : DELEG_COLOR(days);
  return (
    <span
      title={done ? t(locale, "delegate.status.title") : t(locale, "card.daysN", { n: days })}
      style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 22, height: 22, padding: "0 6px", borderRadius: 999, background: bg, color: "#000", fontSize: 12, fontWeight: 700 }}
    >
      {done ? "✓" : days}
    </span>
  );
}

export function TaskCard({ task, locale, unread, hideWorkers, deleg }: { task: Task; locale: Locale; unread?: boolean; hideWorkers?: boolean; deleg?: { days: number; done: boolean } }) {
  const stale = daysSince(task.updated);
  const isStale = task.resolved == null && stale != null && stale >= 5;
  // Клиент не видит разработчиков; сотрудник и клиент-репортёр — видны.
  const showReporter = task.reporter && (!hideWorkers || task.reporter.role === "client" || task.reporter.role === "employee");
  return (
    <a
      href={task.url}
      style={{ ...ui.card, display: "block", textDecoration: "none", color: "var(--text)", padding: 18, borderColor: unread ? "var(--accent-line)" : "var(--border)" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        {unread && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />}
        <CopySlug id={task.id} locale={locale} />
        {task.state && <span style={ui.monoLabel}>{task.state}</span>}
        {task.priority && <span style={ui.monoLabel}>· {task.priority}</span>}
        {isStale && (
          <span style={{ ...ui.monoLabel, color: "#e8b339", marginLeft: isStale && !deleg ? "auto" : undefined }}>
            {t(locale, "card.stale", { n: stale! })}
          </span>
        )}
        {deleg && <DelegDot days={deleg.days} done={deleg.done} locale={locale} />}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{task.summary}</div>
      <div style={{ display: "flex", gap: 16, ...ui.monoLabel, textTransform: "none" }}>
        {!hideWorkers && <span>{task.assignee ? `→ ${task.assignee.fullName}` : t(locale, "card.unassigned")}</span>}
        {showReporter && (
          <span>
            {t(locale, "card.from", { name: task.reporter!.fullName })}
            {task.reporter!.role === "client" ? t(locale, "card.clientTag") : ""}
          </span>
        )}
        {task.updated && (
          <span style={{ marginLeft: "auto" }}>{t(locale, "card.updated", { date: fmtDate(task.updated, locale) })}</span>
        )}
      </div>
    </a>
  );
}

export function TaskList({ tasks, empty, locale, unreadIds, hideWorkers, deleg }: { tasks: Task[]; empty: string; locale: Locale; unreadIds?: Set<string>; hideWorkers?: boolean; deleg?: Map<string, { days: number; done: boolean }> }) {
  if (!tasks.length) {
    return <p style={{ color: "var(--muted)", fontSize: 14 }}>{empty}</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
      {tasks.map((t) => (
        <TaskCard key={t.id} task={t} locale={locale} unread={unreadIds?.has(t.id)} hideWorkers={hideWorkers} deleg={deleg?.get(t.id)} />
      ))}
    </div>
  );
}
