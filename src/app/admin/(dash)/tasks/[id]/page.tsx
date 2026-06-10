import Link from "next/link";
import { redirect } from "next/navigation";
import { getBackend } from "@/lib/tasks";
import { getPrincipal } from "@/lib/principal";
import { getLocale } from "@/lib/i18n-server";
import { t, type Locale } from "@/lib/i18n";
import { CommentBox } from "./comment-box";
import { ui } from "../../../ui-styles";

export const dynamic = "force-dynamic";

const DATE_LOC: Record<Locale, string> = { uk: "uk-UA", ru: "ru-RU", en: "en-US" };
function fmt(ms: number | undefined, locale: Locale): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString(DATE_LOC[locale], { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getPrincipal();
  if (!me) redirect("/admin/login");
  const { id } = await params;
  const locale = await getLocale();
  const be = getBackend();

  let task, comments;
  try {
    [task, comments] = await Promise.all([be.getTask(id), be.getComments(id)]);
  } catch (e) {
    return (
      <div>
        <Link href="/admin/tasks" style={{ ...ui.monoLabel, color: "var(--muted)", textDecoration: "none" }}>
          {t(locale, "task.back")}
        </Link>
        <p style={{ color: "#ff5b5b", fontSize: 14, marginTop: 16 }}>{e instanceof Error ? e.message : "—"}</p>
      </div>
    );
  }

  // Клиент видит только клиентский поток (скрытая команда — внутренние комментарии прячем позже).
  return (
    <div>
      <Link href="/admin/tasks" style={{ ...ui.monoLabel, color: "var(--muted)", textDecoration: "none" }}>
        {t(locale, "task.back")}
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{task.id}</span>
        {task.state && <span style={ui.monoLabel}>{task.state}</span>}
        {task.priority && <span style={ui.monoLabel}>· {task.priority}</span>}
      </div>
      <h1 style={{ ...ui.h1, fontSize: "clamp(22px,5vw,32px)", marginTop: 10 }}>{task.summary}</h1>

      <div style={{ display: "flex", gap: 16, ...ui.monoLabel, textTransform: "none", marginTop: 10, flexWrap: "wrap" }}>
        {me.role !== "client" && task.assignee && <span>→ {task.assignee.fullName}</span>}
        {task.reporter && <span>{t(locale, "card.from", { name: task.reporter.fullName })}</span>}
        {task.updated && <span>{fmt(task.updated, locale)}</span>}
      </div>

      <div style={{ ...ui.card, marginTop: 20 }}>
        <div style={ui.fieldLabel}>{t(locale, "task.description")}</div>
        <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>
          {task.description?.trim() || t(locale, "task.noDescription")}
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={ui.monoLabel}>
          {t(locale, "task.comments")} · {comments.length}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {comments.length === 0 && <p style={{ color: "var(--muted)", fontSize: 14 }}>{t(locale, "task.noComments")}</p>}
          {comments.map((c) => (
            <div key={c.id} style={{ ...ui.card, padding: 14 }}>
              <div style={{ display: "flex", gap: 10, ...ui.monoLabel, textTransform: "none", marginBottom: 6 }}>
                <span style={{ color: c.author.role === "client" ? "#e8b339" : "var(--accent)" }}>
                  {me.role === "client" && c.author.role !== "client" ? "Lambertain" : c.author.fullName}
                </span>
                <span style={{ marginLeft: "auto" }}>{fmt(c.created, locale)}</span>
              </div>
              <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.55 }}>{c.text}</div>
            </div>
          ))}
        </div>
        <CommentBox id={task.id} locale={locale} />
      </div>
    </div>
  );
}
