"use client";

import { useState, useTransition } from "react";
import { updateTaskStatus, markTaskRead } from "./tasks-actions";
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

function Row({ task, locale, canEditStatus }: { task: BoardTask; locale: Locale; canEditStatus: boolean }) {
  const [status, setStatus] = useState(task.status);
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(!!task.unread);
  const [, start] = useTransition();

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
      </div>

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

export function TaskBoard({ tasks, locale, canEditStatus, empty }: { tasks: BoardTask[]; locale: Locale; canEditStatus: boolean; empty: string }) {
  if (!tasks.length) return <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 16 }}>{empty}</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
      {tasks.map((tk) => (
        <Row key={tk.id} task={tk} locale={locale} canEditStatus={canEditStatus} />
      ))}
    </div>
  );
}
