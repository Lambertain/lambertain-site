"use client";

import { useState, useTransition } from "react";
import { structureDraft, createFromDraft } from "./actions";
import type { DraftTask } from "@/lib/tasks/types";
import { ui } from "../ui-styles";

type Proj = { key: string; name: string };
type Usr = { login: string; fullName: string; role: string };

export function NewTaskForm({ projects, users }: { projects: Proj[]; users: Usr[] }) {
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
        placeholder="напр.: на shulex добавить экспорт дел в PDF, отдать александру, срок пятница"
        style={{ ...ui.input, resize: "vertical", marginTop: 20 }}
      />
      <button
        onClick={doStructure}
        disabled={pending || !text.trim()}
        style={{ ...ui.btnAccent, marginTop: 14, opacity: pending || !text.trim() ? 0.5 : 1 }}
      >
        {pending ? "Обработка…" : "Структурировать"}
      </button>

      {error && (
        <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 14 }}>{error}</p>
      )}

      {done && (
        <div style={{ ...ui.card, marginTop: 16, borderColor: "var(--accent-line)" }}>
          <span style={{ color: "var(--accent)" }}>Задача создана: </span>
          <a href={done.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
            {done.id}
          </a>
        </div>
      )}

      {draft && (
        <div style={{ ...ui.card, marginTop: 16 }}>
          {draft.confidence === "low" && (
            <p style={{ ...ui.monoLabel, color: "#e8b339", marginTop: 0, marginBottom: 16 }}>
              ⚠ Низкая уверенность — проверь проект и суть
            </p>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={ui.fieldLabel}>Проект</label>
              <select value={draft.projectKey} onChange={(e) => upd("projectKey", e.target.value)} style={ui.input}>
                {projects.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.key} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={ui.fieldLabel}>Исполнитель</label>
              <select
                value={draft.assigneeLogin ?? ""}
                onChange={(e) => upd("assigneeLogin", e.target.value || null)}
                style={ui.input}
              >
                <option value="">— не назначен —</option>
                {users.map((u) => (
                  <option key={u.login} value={u.login}>
                    {u.fullName} ({u.login})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={ui.fieldLabel}>Заголовок</label>
            <input value={draft.summary} onChange={(e) => upd("summary", e.target.value)} style={ui.input} />
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={ui.fieldLabel}>Описание</label>
            <textarea
              value={draft.description}
              onChange={(e) => upd("description", e.target.value)}
              rows={6}
              style={{ ...ui.input, resize: "vertical" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
            <div>
              <label style={ui.fieldLabel}>Приоритет</label>
              <input
                value={draft.priority ?? ""}
                onChange={(e) => upd("priority", e.target.value || null)}
                placeholder="Normal / Major / Critical"
                style={ui.input}
              />
            </div>
            <div>
              <label style={ui.fieldLabel}>Дедлайн (в описание)</label>
              <input
                value={draft.dueDate ?? ""}
                onChange={(e) => upd("dueDate", e.target.value || null)}
                placeholder="YYYY-MM-DD"
                style={ui.input}
              />
            </div>
          </div>

          <button onClick={doCreate} disabled={pending} style={{ ...ui.btnAccent, marginTop: 20, opacity: pending ? 0.5 : 1 }}>
            {pending ? "Создание…" : "Создать в YouTrack"}
          </button>
        </div>
      )}
    </div>
  );
}
