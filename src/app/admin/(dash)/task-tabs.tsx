"use client";

import { useMemo, useState, useTransition } from "react";
import { updateTaskStatus, markTaskRead, deleteTask, moveToReview } from "./tasks-actions";
import { STATUSES, statusColor, statusBucket, BUCKET_ORDER, BUCKET_LABEL, type Bucket } from "@/lib/statuses";
import { t, type Locale } from "@/lib/i18n";
import { Markdown } from "./markdown";
import { ui } from "../ui-styles";

export type BoardTask = {
  id: string;
  projectKey: string;
  summary: string;
  status: string;
  description?: string;
  created?: number;
  updated?: number;
  commentCount?: number;
  assignee?: string | null;
  unread?: boolean;
  /** Задача заблокирована незавершёнными зависимостями (derived). */
  blocked?: boolean;
  blockers?: { id: string; summary: string }[];
};

const DATE_LOC: Record<Locale, string> = { uk: "uk-UA", ru: "ru-RU", en: "en-US" };
function fmt(ms: number | undefined, locale: Locale): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString(DATE_LOC[locale], { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Row({
  task,
  locale,
  canEditStatus,
  canDelete,
  mode,
}: {
  task: BoardTask;
  locale: Locale;
  canEditStatus: boolean;
  canDelete: boolean;
  /** "start" — клик по названию берёт задачу в работу; "expand" — раскрывает описание. */
  mode: "start" | "expand";
}) {
  const [status, setStatus] = useState(task.status);
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(!!task.unread);
  const [confirm, setConfirm] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [reviewRef, setReviewRef] = useState<string | null>(null); // не null → показываем форму ссылки
  const [, start] = useTransition();

  if (deleted) return null;

  function pick(s: string) {
    setMenu(false);
    if (statusBucket(s) === "review") {
      setReviewRef(""); // открыть форму ссылки, статус сменим после подтверждения
      return;
    }
    setStatus(s);
    start(() => { updateTaskStatus(task.id, s); });
  }
  function submitReview() {
    const ref = reviewRef ?? "";
    setReviewRef(null);
    setStatus("Review");
    start(() => { moveToReview(task.id, ref); });
  }
  function startWork() {
    setStatus("In Progress");
    start(() => { updateTaskStatus(task.id, "In Progress"); });
  }
  function onTitle() {
    if (mode === "start") { startWork(); return; }
    setOpen((v) => !v);
    if (!open && unread) {
      setUnread(false);
      start(() => { markTaskRead(task.id); });
    }
  }

  return (
    <div style={{ ...ui.card, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {/* статус */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => canEditStatus && setMenu((v) => !v)}
            style={{ ...ui.monoLabel, padding: "4px 10px", border: `1px solid ${statusColor(status)}`, color: statusColor(status), background: "transparent", cursor: canEditStatus ? "pointer" : "default" }}
          >
            {status}
          </button>
          {menu && (
            <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: "var(--surface-2)", border: "1px solid var(--border-2)", zIndex: 20, minWidth: 130 }}>
              {STATUSES.map((s) => (
                <button key={s} onClick={() => pick(s)} style={{ ...ui.monoLabel, display: "block", width: "100%", textAlign: "left", padding: "8px 10px", background: "transparent", border: "none", color: statusColor(s), cursor: "pointer" }}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* название */}
        <button onClick={onTitle} title={mode === "start" ? t(locale, "tab.startHint") : undefined} style={{ flex: 1, textAlign: "left", background: "transparent", border: "none", color: "var(--text)", cursor: "pointer", fontSize: 15, fontWeight: 600, padding: 0 }}>
          {task.summary}
        </button>
        {unread && <span className="blink" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />}
        {canDelete && (
          <button onClick={() => setConfirm(true)} title={t(locale, "common.delete")} style={{ display: "flex", background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", padding: 4 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          </button>
        )}
      </div>

      {/* форма ссылки на код при переводе в «Ревью» */}
      {reviewRef !== null && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ ...ui.monoLabel, textTransform: "none" }}>{t(locale, "review.refLabel")}</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              autoFocus
              value={reviewRef}
              onChange={(e) => setReviewRef(e.target.value)}
              placeholder={t(locale, "review.refPlaceholder")}
              style={{ ...ui.input, flex: 1, minWidth: 200 }}
            />
            <button onClick={submitReview} style={ui.btnAccent}>{t(locale, "review.send")}</button>
            <button onClick={() => setReviewRef(null)} style={ui.btn}>{t(locale, "common.cancel")}</button>
          </div>
        </div>
      )}

      {confirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", padding: 20 }} onClick={() => setConfirm(false)}>
          <div style={{ ...ui.card, maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
            <p style={{ fontSize: 14, marginTop: 0 }}>{t(locale, "task.deleteConfirm")}</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
              <button onClick={() => setConfirm(false)} style={ui.btn}>{t(locale, "common.cancel")}</button>
              <button onClick={() => { setConfirm(false); start(async () => { const r = await deleteTask(task.id); if (!r.error) setDeleted(true); }); }} style={{ ...ui.btnAccent, background: "#ff5b5b", borderColor: "#ff5b5b", color: "#fff" }}>
                {t(locale, "common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* мета */}
      <div style={{ display: "flex", gap: 14, ...ui.monoLabel, textTransform: "none", marginTop: 8, flexWrap: "wrap" }}>
        {task.created && <span>{fmt(task.created, locale)}</span>}
        {task.assignee && <span>→ {task.assignee}</span>}
        <span>{t(locale, "task.comments")}: {task.commentCount ?? 0}</span>
      </div>

      {task.blocked && task.blockers && task.blockers.length > 0 && (
        <div style={{ ...ui.monoLabel, textTransform: "none", color: "#ff5b5b", marginTop: 8 }}>
          {t(locale, "deps.blockedBy")} {task.blockers.map((b) => b.id).join(", ")}
        </div>
      )}

      {open && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          {task.description?.trim() ? (
            <Markdown>{task.description}</Markdown>
          ) : (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{t(locale, "task.noDescription")}</div>
          )}
          <a href={`/admin/tasks/${task.id}`} style={{ ...ui.btn, display: "inline-block", marginTop: 12, textDecoration: "none" }}>
            {t(locale, "task.comments")} →
          </a>
        </div>
      )}
    </div>
  );
}

const TabBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    style={{
      ...ui.monoLabel,
      padding: "7px 12px",
      background: active ? "var(--accent)" : "transparent",
      color: active ? "#000" : "var(--muted)",
      border: `1px solid ${active ? "var(--accent)" : "var(--border-2)"}`,
      cursor: "pointer",
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </button>
);

export function TaskTabs({
  tasks,
  projects,
  locale,
  canEditStatus,
  canDelete,
  canStart,
  empty,
}: {
  tasks: BoardTask[];
  projects: { key: string; name: string }[];
  locale: Locale;
  canEditStatus: boolean;
  canDelete: boolean;
  /** Может ли роль брать не начатые задачи в работу (контрибьютор/админ). */
  canStart: boolean;
  empty: string;
}) {
  const projectKeys = projects.map((p) => p.key);
  const [activeProject, setActiveProject] = useState<string>(projectKeys[0] ?? "");

  // Задачи активного проекта (если проектов нет в списке — показываем все).
  const projTasks = useMemo(
    () => (projectKeys.length ? tasks.filter((tk) => tk.projectKey === activeProject) : tasks),
    [tasks, activeProject, projectKeys.length],
  );

  // Раскладка по корзинам + счётчики.
  const byBucket = useMemo(() => {
    const m: Record<Bucket, BoardTask[]> = { inProgress: [], review: [], done: [], notStarted: [], blocked: [] };
    // Заблокированная зависимостями задача попадает в «Заблок.» поверх своего статуса.
    for (const tk of projTasks) m[tk.blocked ? "blocked" : statusBucket(tk.status)].push(tk);
    return m;
  }, [projTasks]);

  // Дефолтная корзина: «В работе»; если там пусто — «Не начатые».
  const defaultBucket: Bucket = byBucket.inProgress.length ? "inProgress" : "notStarted";
  const [bucket, setBucket] = useState<Bucket | null>(null);
  const activeBucket = bucket ?? defaultBucket;
  const rows = byBucket[activeBucket];

  return (
    <div style={{ marginTop: 16 }}>
      {/* табы проектов (скрыты, если проект один) */}
      {projects.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {projects.map((p) => (
            <TabBtn key={p.key} active={p.key === activeProject} onClick={() => { setActiveProject(p.key); setBucket(null); }}>
              {p.name}
            </TabBtn>
          ))}
        </div>
      )}

      {/* табы статусов */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, overflowX: "auto" }}>
        {BUCKET_ORDER.map((b) => (
          <TabBtn key={b} active={b === activeBucket} onClick={() => setBucket(b)}>
            {t(locale, BUCKET_LABEL[b])} · {byBucket[b].length}
          </TabBtn>
        ))}
      </div>

      {rows.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 14 }}>{empty}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((tk) => (
            <Row
              key={tk.id}
              task={tk}
              locale={locale}
              canEditStatus={canEditStatus}
              canDelete={canDelete}
              mode={activeBucket === "notStarted" && canStart ? "start" : "expand"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
