import Link from "next/link";
import { redirect } from "next/navigation";
import { getBackend } from "@/lib/tasks";
import { getPrincipal } from "@/lib/principal";
import { getTaskDeps } from "@/lib/db";
import { statusBucket } from "@/lib/statuses";
import { getLocale } from "@/lib/i18n-server";
import { t, type Locale } from "@/lib/i18n";
import { CommentBox } from "./comment-box";
import { ClientReply } from "./client-reply";
import { TaskTools } from "./task-tools";
import { Markdown } from "../../markdown";
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

  let task, comments, deps;
  try {
    [task, comments, deps] = await Promise.all([be.getTask(id), be.getComments(id), getTaskDeps(id)]);
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

  const canReview = me.realRole === "admin" || me.role === "contributor";
  // Клиент не видит внутренние комментарии команды (код-ревью, координация).
  const visibleComments = me.role === "client" ? comments.filter((c) => c.visibility !== "internal") : comments;
  const blockers = deps.filter((d) => statusBucket(d.status) !== "done");
  let candidates: { id: string; summary: string; status: string | null }[] = [];
  if (canReview) {
    const siblings = await be.listTasks({ projectKey: task.projectKey, limit: 200 });
    candidates = siblings
      .filter((s) => s.id !== task.id)
      .map((s) => ({ id: s.id, summary: s.summary, status: s.state ?? null }));
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
        {task.reporter && (me.role !== "client" || task.reporter.role === "client") && (
          <span>{t(locale, "card.from", { name: task.reporter.fullName })}</span>
        )}
        {task.updated && <span>{fmt(task.updated, locale)}</span>}
      </div>

      {blockers.length > 0 && (
        <div style={{ ...ui.card, marginTop: 16, padding: 14, borderColor: "#ff5b5b" }}>
          <div style={{ ...ui.monoLabel, color: "#ff5b5b" }}>{t(locale, "deps.blockedBy")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
            {blockers.map((b) => (
              <Link key={b.id} href={`/admin/tasks/${b.id}`} style={{ fontSize: 13, color: "var(--text)", textDecoration: "none" }}>
                <span style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginRight: 8 }}>{b.id}</span>
                {b.summary}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div style={{ ...ui.card, marginTop: 20 }}>
        <div style={ui.fieldLabel}>{t(locale, "task.description")}</div>
        <div style={{ marginTop: 8 }}>
          {task.description?.trim() ? (
            <Markdown>{task.description}</Markdown>
          ) : (
            <span style={{ fontSize: 14, color: "var(--muted)" }}>{t(locale, "task.noDescription")}</span>
          )}
        </div>
      </div>

      <TaskTools id={task.id} candidates={candidates} currentDeps={deps.map((d) => d.id)} canReview={canReview} canAiReview={me.realRole === "admin"} locale={locale} />

      <div style={{ marginTop: 24 }}>
        <div style={ui.monoLabel}>
          {t(locale, "task.comments")} · {visibleComments.length}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {visibleComments.length === 0 && <p style={{ color: "var(--muted)", fontSize: 14 }}>{t(locale, "task.noComments")}</p>}
          {visibleComments.map((c) => {
            const internal = c.visibility === "internal";
            return (
              <div key={c.id} style={{ ...ui.card, padding: 14, borderColor: internal ? "var(--border-2)" : "var(--border)", background: internal ? "rgba(255,255,255,0.02)" : undefined }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, ...ui.monoLabel, textTransform: "none", marginBottom: 6 }}>
                  <span style={{ color: c.author.role === "client" ? "#e8b339" : "var(--accent)" }}>
                    {me.role === "client" && c.author.role !== "client" ? "Lambertain" : c.author.fullName}
                  </span>
                  {internal && me.role !== "client" && (
                    <span style={{ ...ui.monoLabel, color: "#e8b339", border: "1px solid #e8b339", padding: "1px 6px" }}>{t(locale, "comment.internalBadge")}</span>
                  )}
                  <span style={{ marginLeft: "auto" }}>{fmt(c.created, locale)}</span>
                </div>
                <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.55 }}>{c.text}</div>
              </div>
            );
          })}
        </div>
        {canReview && <ClientReply id={task.id} locale={locale} />}
        <CommentBox id={task.id} locale={locale} canChooseVisibility={me.role !== "client"} />
      </div>
    </div>
  );
}
