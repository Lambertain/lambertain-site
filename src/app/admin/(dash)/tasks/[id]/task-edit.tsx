"use client";

import { useState, useTransition } from "react";
import { editTask } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../../ui-styles";

type Assignee = { login: string; fullName: string };

const PRIORITIES = ["", "Critical", "Major", "Normal", "Minor"];

export function TaskEdit({
  id, summary, description, priority, assigneeLogin, assignees, locale, defaultOpen,
}: {
  id: string;
  summary: string;
  description: string;
  priority: string;
  assigneeLogin: string;
  assignees: Assignee[];
  locale: Locale;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [s, setS] = useState(summary);
  const [d, setD] = useState(description);
  const [p, setP] = useState(priority);
  const [a, setA] = useState(assigneeLogin);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const dirty = s !== summary || d !== description || p !== priority || a !== assigneeLogin;

  function save() {
    setErr(null);
    start(async () => {
      const r = await editTask(id, { summary: s, description: d, priority: p, assigneeLogin: a || null });
      if (r.error) setErr(r.error);
      else setSaved(true);
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ ...ui.monoLabel, color: "var(--muted)", background: "transparent", border: "1px solid var(--border-2)", padding: "6px 12px", cursor: "pointer", borderRadius: 2, marginTop: 16, display: "inline-flex", alignItems: "center", gap: 8 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
        {t(locale, "taskedit.edit")}
      </button>
    );
  }

  return (
    <div style={{ ...ui.card, marginTop: 16, padding: 16 }}>
      <div style={{ ...ui.monoLabel, color: "var(--accent)", marginBottom: 10 }}>{t(locale, "taskedit.title")}</div>

      <label style={ui.fieldLabel}>{t(locale, "taskedit.summary")}</label>
      <input value={s} onChange={(e) => { setS(e.target.value); setSaved(false); }} style={{ ...ui.input, width: "100%", fontWeight: 600 }} />

      <label style={{ ...ui.fieldLabel, marginTop: 12 }}>{t(locale, "taskedit.description")}</label>
      <textarea value={d} onChange={(e) => { setD(e.target.value); setSaved(false); }} rows={Math.min(20, Math.max(6, d.split("\n").length + 1))} style={{ ...ui.input, width: "100%", resize: "vertical", lineHeight: 1.5, fontFamily: "var(--font-mono)", fontSize: 13 }} />

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12 }}>
        <div>
          <label style={ui.fieldLabel}>{t(locale, "taskedit.assignee")}</label>
          <select value={a} onChange={(e) => { setA(e.target.value); setSaved(false); }} style={{ ...ui.input, width: "auto", padding: "8px 10px" }}>
            <option value="">{t(locale, "taskedit.noAssignee")}</option>
            {assignees.map((u) => <option key={u.login} value={u.login}>{u.fullName}</option>)}
          </select>
        </div>
        <div>
          <label style={ui.fieldLabel}>{t(locale, "taskedit.priority")}</label>
          <select value={p} onChange={(e) => { setP(e.target.value); setSaved(false); }} style={{ ...ui.input, width: "auto", padding: "8px 10px" }}>
            {PRIORITIES.map((pr) => <option key={pr} value={pr}>{pr || "—"}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
        <button onClick={save} disabled={pending || !dirty} style={{ ...ui.btnAccent, opacity: pending || !dirty ? 0.5 : 1 }}>{pending ? "…" : t(locale, "projects.save")}</button>
        <button onClick={() => setOpen(false)} style={{ ...ui.btn }}>{t(locale, "common.cancel")}</button>
        {saved && !dirty && <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{t(locale, "projects.saved")}</span>}
        {err && <span style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none" }}>{err}</span>}
      </div>
    </div>
  );
}
