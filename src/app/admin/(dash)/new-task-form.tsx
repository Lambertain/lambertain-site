"use client";

import { useState, useTransition } from "react";
import { structureDraft, createFromDraft } from "./actions";
import type { DraftTask } from "@/lib/tasks/types";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

type Proj = { key: string; name: string };
type Usr = { login: string; fullName: string; role: string };

export function NewTaskForm({ projects, users, locale }: { projects: Proj[]; users: Usr[]; locale: Locale }) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<DraftTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; url: string } | null>(null);
  const [pending, start] = useTransition();

  function doStructure() {
    setError(null);
    setDone(null);
    start(async () => {
      const res = await structureDraft(text);
      if (res.error) setError(res.error);
      else setDraft(res.draft ?? null);
    });
  }

  function doCreate() {
    if (!draft) return;
    setError(null);
    start(async () => {
      const res = await createFromDraft(draft);
      if (res.error) setError(res.error);
      else if (res.id && res.url) {
        setDone({ id: res.id, url: res.url });
        setDraft(null);
        setText("");
      }
    });
  }

  function upd<K extends keyof DraftTask>(k: K, v: DraftTask[K]) {
    if (draft) setDraft({ ...draft, [k]: v });
  }

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={t(locale, "newtask.placeholder")}
        style={{ ...ui.input, resize: "vertical", marginTop: 20 }}
      />
      <button
        onClick={doStructure}
        disabled={pending || !text.trim()}
        style={{ ...ui.btnAccent, marginTop: 14, opacity: pending || !text.trim() ? 0.5 : 1 }}
      >
        {pending ? t(locale, "common.processing") : t(locale, "newtask.structure")}
      </button>

      {error && (
        <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 14 }}>{error}</p>
      )}

      {done && (
        <div style={{ ...ui.card, marginTop: 16, borderColor: "var(--accent-line)" }}>
          <span style={{ color: "var(--accent)" }}>{t(locale, "newtask.created")}</span>
          <a href={done.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
            {done.id}
          </a>
        </div>
      )}

      {draft && (
        <div style={{ ...ui.card, marginTop: 16 }}>
          {draft.confidence === "low" && (
            <p style={{ ...ui.monoLabel, color: "#e8b339", marginTop: 0, marginBottom: 16 }}>
              {t(locale, "newtask.lowConfidence")}
            </p>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={ui.fieldLabel}>{t(locale, "field.project")}</label>
              <select value={draft.projectKey} onChange={(e) => upd("projectKey", e.target.value)} style={ui.input}>
                {projects.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.key} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={ui.fieldLabel}>{t(locale, "field.assignee")}</label>
              <select
                value={draft.assigneeLogin ?? ""}
                onChange={(e) => upd("assigneeLogin", e.target.value || null)}
                style={ui.input}
              >
                <option value="">{t(locale, "field.unassigned")}</option>
                {users.map((u) => (
                  <option key={u.login} value={u.login}>
                    {u.fullName} ({u.login})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={ui.fieldLabel}>{t(locale, "field.title")}</label>
            <input value={draft.summary} onChange={(e) => upd("summary", e.target.value)} style={ui.input} />
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={ui.fieldLabel}>{t(locale, "field.description")}</label>
            <textarea
              value={draft.description}
              onChange={(e) => upd("description", e.target.value)}
              rows={6}
              style={{ ...ui.input, resize: "vertical" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
            <div>
              <label style={ui.fieldLabel}>{t(locale, "field.priority")}</label>
              <input
                value={draft.priority ?? ""}
                onChange={(e) => upd("priority", e.target.value || null)}
                placeholder="Normal / Major / Critical"
                style={ui.input}
              />
            </div>
            <div>
              <label style={ui.fieldLabel}>{t(locale, "field.due")}</label>
              <input
                value={draft.dueDate ?? ""}
                onChange={(e) => upd("dueDate", e.target.value || null)}
                placeholder="YYYY-MM-DD"
                style={ui.input}
              />
            </div>
          </div>

          <button onClick={doCreate} disabled={pending} style={{ ...ui.btnAccent, marginTop: 20, opacity: pending ? 0.5 : 1 }}>
            {pending ? t(locale, "common.creating") : t(locale, "newtask.createBtn")}
          </button>
        </div>
      )}
    </div>
  );
}
