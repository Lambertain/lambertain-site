"use client";

import { useState, useTransition } from "react";
import { editTask } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { Markdown } from "../../markdown";
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

  // Свёрнуто — компактная иконка-карандаш (её родитель ставит в правый верхний угол задачи).
  const pencil = (
    <button onClick={() => setOpen(true)} title={t(locale, "taskedit.edit")} aria-label={t(locale, "taskedit.edit")}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, background: "transparent", border: "1px solid var(--border-2)", color: "var(--muted)", cursor: "pointer", borderRadius: 6 }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
    </button>
  );
  if (!open) return pencil;

  // Открыто — форма в модалке поверх (триггер может стоять где угодно, форма всегда по центру).
  return (
    <>
      {pencil}
      <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", padding: 16 }}>
        <div onClick={(e) => e.stopPropagation()} style={{ ...ui.card, padding: 16, width: "min(640px, 100%)", maxHeight: "90dvh", overflowY: "auto", textAlign: "left" }}>
          <div style={{ ...ui.monoLabel, color: "var(--accent)", marginBottom: 10 }}>{t(locale, "taskedit.title")}</div>

      <label style={ui.fieldLabel}>{t(locale, "taskedit.summary")}</label>
      <input value={s} onChange={(e) => { setS(e.target.value); setSaved(false); }} style={{ ...ui.input, width: "100%", fontWeight: 600 }} />

      <label style={{ ...ui.fieldLabel, marginTop: 12 }}>{t(locale, "taskedit.description")}</label>
      <textarea value={d} onChange={(e) => { setD(e.target.value); setSaved(false); }} rows={Math.min(20, Math.max(6, d.split("\n").length + 1))} style={{ ...ui.input, width: "100%", resize: "vertical", lineHeight: 1.5, fontFamily: "var(--font-mono)", fontSize: 13 }} />
      {/* Живой предпросмотр: картинки/форматирование на своём месте (в поле — сырой markdown). */}
      {d.trim() && (
        <div style={{ marginTop: 8 }}>
          <div style={{ ...ui.monoLabel, color: "var(--muted)" }}>{t(locale, "common.preview")}</div>
          <div style={{ border: "1px solid var(--border-2)", borderRadius: 6, padding: 12, marginTop: 6, maxHeight: 340, overflowY: "auto" }}>
            <Markdown>{d}</Markdown>
          </div>
        </div>
      )}

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
      </div>
    </>
  );
}
