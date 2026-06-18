"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { updateTaskStatus, markProjectOpened, deleteTask, moveToReview } from "./tasks-actions";
import { STATUSES, statusColor, statusBucket, BUCKET_ORDER, BUCKET_LABEL, type Bucket } from "@/lib/statuses";
import { t, type Locale } from "@/lib/i18n";
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
  isNew?: boolean;
  newComments?: number;
  blocked?: boolean;
  blockers?: { id: string; summary: string }[];
};

type Proj = { key: string; name: string; hasNew?: boolean };

// На задаче бейдж = число НОВЫХ комментов; если задача ещё не відкривалась і комментів нема — просто «NEW».
const TaskBadge = ({ newComments, isNew }: { newComments?: number; isNew?: boolean }) => {
  if (newComments && newComments > 0)
    return <span style={{ ...ui.monoLabel, color: "#000", background: "var(--accent)", padding: "1px 6px", borderRadius: 3, fontWeight: 600 }}>{newComments} 💬</span>;
  if (isNew)
    return <span style={{ ...ui.monoLabel, color: "#000", background: "var(--accent)", padding: "1px 6px", borderRadius: 3, fontWeight: 600 }}>NEW</span>;
  return null;
};

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
  /** "start" — клик берёт задачу в работу; "open" — переход на страницу задачи. */
  mode: "start" | "open";
}) {
  const [status, setStatus] = useState(task.status);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [reviewRef, setReviewRef] = useState<string | null>(null);
  const [, start] = useTransition();

  if (deleted) return null;

  function pick(s: string) {
    setMenu(false);
    if (statusBucket(s) === "review") { setReviewRef(""); return; }
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
        {/* слаг задачи (HH-62) — виден во всех табах, не только при открытии */}
        <span style={{ ...ui.monoLabel, color: "var(--accent)", flexShrink: 0, alignSelf: "center" }}>{task.id}</span>
        {/* название: переход в задачу (или старт в «Не начатых») */}
        {mode === "start" ? (
          <button onClick={startWork} title={t(locale, "tab.startHint")} style={{ flex: 1, textAlign: "left", background: "transparent", border: "none", color: "var(--text)", cursor: "pointer", fontSize: 15, fontWeight: 600, padding: 0 }}>
            {task.summary}
          </button>
        ) : (
          <a href={`/admin/tasks/${task.id}`} style={{ flex: 1, color: "var(--text)", fontSize: 15, fontWeight: 600, textDecoration: "none" }}>
            {task.summary}
          </a>
        )}
        <TaskBadge newComments={task.newComments} isNew={task.isNew} />
        {canDelete && (
          <button onClick={() => setConfirm(true)} title={t(locale, "common.delete")} style={{ display: "flex", background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", padding: 4 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          </button>
        )}
      </div>

      {reviewRef !== null && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ ...ui.monoLabel, textTransform: "none" }}>{t(locale, "review.refLabel")}</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input autoFocus value={reviewRef} onChange={(e) => setReviewRef(e.target.value)} placeholder={t(locale, "review.refPlaceholder")} style={{ ...ui.input, flex: 1, minWidth: 200 }} />
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

      <div style={{ display: "flex", gap: 14, ...ui.monoLabel, textTransform: "none", marginTop: 8, flexWrap: "wrap" }}>
        {task.assignee && <span>→ {task.assignee}</span>}
        <span>{t(locale, "task.comments")}: {task.commentCount ?? 0}</span>
      </div>

      {task.blocked && task.blockers && task.blockers.length > 0 && (
        <div style={{ ...ui.monoLabel, textTransform: "none", color: "#ff5b5b", marginTop: 8 }}>
          {t(locale, "deps.blockedBy")} {task.blockers.map((b) => b.id).join(", ")}
        </div>
      )}
    </div>
  );
}

const TabBtn = ({ active, hasNew, onClick, variant = "project", children }: { active: boolean; hasNew?: boolean; onClick: () => void; variant?: "project" | "status"; children: React.ReactNode }) => {
  // project — заполненные «таблетки» (верхний уровень); status — «подчёркнутые вкладки» (нижний уровень).
  const style: React.CSSProperties =
    variant === "project"
      ? {
          ...ui.monoLabel,
          padding: "7px 12px",
          background: active ? "var(--accent)" : "transparent",
          color: active ? "#000" : "var(--muted)",
          border: `1px solid ${active ? "var(--accent)" : "var(--border-2)"}`,
        }
      : {
          ...ui.monoLabel,
          padding: "6px 4px",
          background: "transparent",
          color: active ? "var(--accent)" : "var(--muted)",
          border: "none",
          borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
          borderRadius: 0,
        };
  return (
    <button onClick={onClick} style={{ position: "relative", cursor: "pointer", whiteSpace: "nowrap", ...style }}>
      {children}
      {hasNew && !active && (
        <span style={{ position: "absolute", top: -4, right: -4, width: 9, height: 9, borderRadius: "50%", background: "var(--accent)", border: "1px solid var(--bg)" }} />
      )}
    </button>
  );
};

export function TaskTabs({
  tasks,
  projects,
  locale,
  canEditStatus,
  canDelete,
  canStart,
  empty,
  feedbackKey,
  initialProject,
  initialBucket,
  activeProject: controlledProject,
  onProjectChange,
}: {
  tasks: BoardTask[];
  projects: Proj[];
  locale: Locale;
  canEditStatus: boolean;
  canDelete: boolean;
  canStart: boolean;
  empty: string;
  feedbackKey?: string;
  /** Начальные проект/корзина из URL (?project=&tab=) — для дип-линка из карточки проекта. */
  initialProject?: string;
  initialBucket?: Bucket;
  /** Контролируемый режим: выбранный проект задаёт родитель (чтобы синхронить с карточкой проекта сверху). */
  activeProject?: string;
  onProjectChange?: (key: string) => void;
}) {
  const projectKeys = projects.map((p) => p.key);
  const [internalProject, setInternalProject] = useState<string>(
    initialProject && projectKeys.includes(initialProject) ? initialProject : projectKeys[0] ?? "",
  );
  // Контролируемый проект (от родителя) приоритетнее внутреннего — так карточка сверху и табы синхронны.
  const activeProject = controlledProject !== undefined ? controlledProject : internalProject;
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [, startSeen] = useTransition();

  function openProject(key: string) {
    if (onProjectChange) onProjectChange(key); else setInternalProject(key);
    setBucket(null);
    if (!opened.has(key)) {
      setOpened((s) => new Set(s).add(key));
      startSeen(() => { markProjectOpened(key); });
    }
  }

  // Открытие апки = просмотр активного проекта (снимаем его метку New).
  useEffect(() => {
    if (activeProject && !opened.has(activeProject)) {
      setOpened((s) => new Set(s).add(activeProject));
      startSeen(() => { markProjectOpened(activeProject); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const projTasks = useMemo(
    () => (projectKeys.length ? tasks.filter((tk) => tk.projectKey === activeProject) : tasks),
    [tasks, activeProject, projectKeys.length],
  );

  const byBucket = useMemo(() => {
    const m: Record<Bucket, BoardTask[]> = { inProgress: [], review: [], rework: [], done: [], notStarted: [], blocked: [] };
    for (const tk of projTasks) m[tk.blocked ? "blocked" : statusBucket(tk.status)].push(tk);
    return m;
  }, [projTasks]);

  // По умолчанию «В работе»; если пусто — «Не начатые». Пустой экран = всё выполнено, ждём новые задачи.
  const defaultBucket: Bucket = byBucket.inProgress.length ? "inProgress" : "notStarted";
  const [bucket, setBucket] = useState<Bucket | null>(initialBucket ?? null);
  const activeBucket = bucket ?? defaultBucket;
  const rows = byBucket[activeBucket];

  return (
    <div style={{ marginTop: 16 }}>
      {projects.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {projects.map((p) => (
            <TabBtn key={p.key} active={p.key === activeProject} hasNew={p.hasNew && !opened.has(p.key)} onClick={() => openProject(p.key)}>
              {p.name}
            </TabBtn>
          ))}
        </div>
      )}

      {feedbackKey && activeProject === feedbackKey && (
        <div style={{ ...ui.card, padding: 14, marginBottom: 12, borderColor: "var(--accent-line)", background: "rgba(185,255,75,0.06)" }}>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>{t(locale, "feedback.intro")}</p>
        </div>
      )}

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 16, overflowX: "auto", borderBottom: "1px solid var(--border)", paddingBottom: 2 }}>
        {BUCKET_ORDER.map((b) => (
          <TabBtn key={b} variant="status" active={b === activeBucket} onClick={() => setBucket(b)}>
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
              mode={activeBucket === "notStarted" && canStart ? "start" : "open"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
