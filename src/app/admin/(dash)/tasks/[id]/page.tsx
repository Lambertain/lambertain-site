import Link from "next/link";
import { redirect } from "next/navigation";
import { getBackend } from "@/lib/tasks";
import { getPrincipal } from "@/lib/principal";
import { getTaskDeps, getReads } from "@/lib/db";
import { statusBucket } from "@/lib/statuses";
import { getLocale } from "@/lib/i18n-server";
import { t, type Locale } from "@/lib/i18n";
import { CommentBox } from "./comment-box";
import { ClientReply } from "./client-reply";
import { CommentsView, type ViewComment } from "./comments-view";
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

  const isAdmin = me.realRole === "admin";
  const backHref = isAdmin ? "/admin/tasks" : "/admin";

  let task, comments, deps, reads;
  const readKey = me.youtrackLogin || me.fullName || "admin";
  try {
    [task, comments, deps, reads] = await Promise.all([be.getTask(id), be.getComments(id), getTaskDeps(id), getReads(readKey)]);
  } catch (e) {
    return (
      <div>
        <Link href={backHref} style={{ ...ui.monoLabel, color: "var(--muted)", textDecoration: "none" }}>
          {t(locale, "task.back")}
        </Link>
        <p style={{ color: "#ff5b5b", fontSize: 14, marginTop: 16 }}>{e instanceof Error ? e.message : "—"}</p>
      </div>
    );
  }

  const canReview = isAdmin || me.role === "contributor";
  const blockers = deps.filter((d) => statusBucket(d.status) !== "done");
  // Новые комменты — появившиеся после последнего открытия задачи.
  const prevRead = reads.get(id) ?? 0;
  const viewComments: ViewComment[] = comments.map((c) => ({
    id: c.id,
    text: c.text,
    created: c.created,
    authorName: c.author.fullName,
    authorRole: c.author.role,
    visibility: c.visibility,
    isNew: c.created > prevRead,
  }));
  const shownCount = me.role === "client" ? viewComments.filter((c) => c.visibility !== "internal").length : viewComments.length;

  return (
    <div>
      <Link href={backHref} style={{ ...ui.monoLabel, color: "var(--muted)", textDecoration: "none" }}>
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

      {isAdmin && <TaskTools id={task.id} locale={locale} />}

      <div style={{ marginTop: 24 }}>
        <div style={ui.monoLabel}>
          {t(locale, "task.comments")} · {shownCount}
        </div>
        <CommentsView taskId={task.id} comments={viewComments} isClient={me.role === "client"} locale={locale} />
        {canReview && <ClientReply id={task.id} locale={locale} />}
        <CommentBox id={task.id} locale={locale} canChooseVisibility={me.role !== "client"} />
      </div>
    </div>
  );
}
