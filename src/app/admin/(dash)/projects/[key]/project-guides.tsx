"use client";

import { useState, useTransition } from "react";
import { saveProjectGuides } from "../../project-actions";
import { ui } from "../../../ui-styles";

type G = { id: number; title: string };

export function ProjectGuides({ projectKey, guides, enabled }: { projectKey: string; guides: G[]; enabled: number[] }) {
  const [sel, setSel] = useState<number[]>(enabled);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const dirty = sel.slice().sort().join(",") !== enabled.slice().sort().join(",");

  function toggle(id: number) {
    setSaved(false);
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }
  function save() {
    start(async () => { const r = await saveProjectGuides(projectKey, sel); if (!r.error) setSaved(true); });
  }

  return (
    <div style={{ ...ui.card, marginTop: 16 }}>
      <div style={{ ...ui.monoLabel, color: "var(--accent)" }}>Гайды клиенту</div>
      <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginTop: 6 }}>Что клиент увидит в «Подготовке». Обычно включают после спеки — что нужно зарегистрировать.</p>
      {guides.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 10 }}>Сначала добавьте гайды в разделе «Гайды».</p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, border: "1px solid var(--border-2)", padding: 6, marginTop: 12 }}>
            {guides.map((g) => {
              const on = sel.includes(g.id);
              return (
                <button key={g.id} onClick={() => toggle(g.id)} style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", padding: "8px", background: on ? "var(--surface-2)" : "transparent", border: "none", color: "var(--text)", cursor: "pointer", fontSize: 14 }}>
                  <span style={{ width: 15, height: 15, flexShrink: 0, border: `1px solid ${on ? "var(--accent)" : "var(--border-2)"}`, background: on ? "var(--accent)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                  </span>
                  {g.title}
                </button>
              );
            })}
          </div>
          {(dirty || saved) && (
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
              <button onClick={save} disabled={pending || !dirty} style={{ ...ui.btnAccent, opacity: pending || !dirty ? 0.5 : 1 }}>{pending ? "…" : "Сохранить"}</button>
              {saved && !dirty && <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>Сохранено ✓</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
