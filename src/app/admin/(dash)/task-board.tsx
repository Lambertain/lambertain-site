"use client";

import { useState, useTransition } from "react";
import { updateTaskStatus, markTaskRead, deleteTask } from "./tasks-actions";
import { STATUSES, statusColor } from "@/lib/statuses";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

export type BoardTask = {
  id: string;
  summary: string;
  status: string;
  description?: string;
  created?: number;
  updated?: number;
  commentCount?: number;
  assignee?: string | null;
  unread?: boolean;
};

const DATE_LOC: Record<Locale, string> = { uk: "uk-UA", ru: "ru-RU", en: "en-US" };
function fmt(ms: number | undefined, locale: Locale): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString(DATE_LOC[locale], { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Row({ task, locale, canEditStatus, canDelete }: { task: BoardTask; locale: Locale; canEditStatus: boolean; canDelete: boolean }) {
  const [status, setStatus] = useState(task.status);
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(!!task.unread);
  const [confirm, setConfirm] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [, start] = useTransition();

  if (deleted) return null;

  function pick(s: string) {
    setStatus(s);
    setMenu(false);
    start(() => { updateTaskStatus(task.id, s); });
  }
  function toggle() {
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
        {/* название (раскрытие) */}
        <button onClick={toggle} style={{ flex: 1, textAlign: "left", background: "transparent", border: "none", color: "var(--text)", cursor: "pointer", fontSize: 15, fontWeight: 600, padding: 0 }}>
          {task.summary}
        </button>
        {unread && <span className="blink" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />}
        {canDelete && (
          <button onClick={() => setConfirm(true)} title={t(locale, "common.delete")} style={{ display: "flex", background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", padding: 4 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          </button>
        )}
      </div>

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

      {open && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.55, color: "var(--text)" }}>
            {task.description?.trim() || t(locale, "task.noDescription")}
          </div>
          <a href={`/admin/tasks/${task.id}`} style={{ ...ui.btn, display: "inline-block", marginTop: 12, textDecoration: "none" }}>
            {t(locale, "task.comments")} →
          </a>
        </div>
      )}
    </div>
  );
}

export function TaskBoard({ tasks, locale, canEditStatus, canDelete, empty }: { tasks: BoardTask[]; locale: Locale; canEditStatus: boolean; canDelete: boolean; empty: string }) {
  if (!tasks.length) return <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 16 }}>{empty}</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
      {tasks.map((tk) => (
        <Row key={tk.id} task={tk} locale={locale} canEditStatus={canEditStatus} canDelete={canDelete} />
      ))}
    </div>
  );
}
