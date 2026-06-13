"use client";

import { useState, useTransition } from "react";
import { proposeTasksFromSpec, createKickoffTasks } from "../../project-actions";
import type { KickoffTask } from "@/lib/kickoff";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../../ui-styles";

export function KickoffPanel({ projectKey, locale }: { projectKey: string; locale: Locale }) {
  const [spec, setSpec] = useState("");
  const [tasks, setTasks] = useState<KickoffTask[] | null>(null);
  const [createdN, setCreatedN] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function propose() {
    setError(null); setCreatedN(null);
    start(async () => {
      const r = await proposeTasksFromSpec(projectKey, spec);
      if (r.error) setError(r.error);
      else setTasks(r.tasks ?? []);
    });
  }
  function create() {
    if (!tasks) return;
    setError(null);
    start(async () => {
      const r = await createKickoffTasks(projectKey, tasks);
      if (r.error) setError(r.error);
      else { setCreatedN(r.created ?? 0); setTasks(null); setSpec(""); }
    });
  }

  return (
    <div style={{ ...ui.card, marginTop: 16 }}>
      <div style={{ ...ui.monoLabel, color: "var(--accent)" }}>{t(locale, "kickoff.title")}</div>
      <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginTop: 6 }}>{t(locale, "kickoff.hint")}</p>

      {createdN != null && (
        <p style={{ fontSize: 14, color: "var(--accent)", marginTop: 12 }}>{t(locale, "kickoff.created", { n: String(createdN) })}</p>
      )}

      {!tasks ? (
        <>
          <textarea
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
            placeholder={t(locale, "kickoff.specPh")}
            rows={12}
            style={{ ...ui.input, width: "100%", resize: "vertical", marginTop: 12, lineHeight: 1.5, fontSize: 13 }}
          />
          <button onClick={propose} disabled={pending || !spec.trim()} style={{ ...ui.btnAccent, marginTop: 12, opacity: pending || !spec.trim() ? 0.5 : 1 }}>
            {pending ? "…" : t(locale, "kickoff.decompose")}
          </button>
        </>
      ) : (
        <div style={{ marginTop: 12 }}>
          <div style={ui.monoLabel}>{t(locale, "kickoff.proposed")} · {tasks.length}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {tasks.map((tk, i) => (
              <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 4, padding: 12 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>#{i + 1}</span>
                  <strong style={{ fontSize: 14 }}>{tk.summary}</strong>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  {tk.type && <span style={{ ...ui.monoLabel, textTransform: "none", padding: "1px 7px", border: "1px solid var(--border-2)", borderRadius: 3 }}>{tk.type}</span>}
                  {tk.complexity && <span style={{ ...ui.monoLabel, textTransform: "none", padding: "1px 7px", border: "1px solid var(--border-2)", borderRadius: 3, color: tk.complexity === "feature" ? "#e8b339" : "var(--muted)" }}>{tk.complexity}</span>}
                  {(tk.skills || []).map((s) => <span key={s} style={{ ...ui.monoLabel, textTransform: "none", padding: "1px 7px", border: "1px solid var(--accent-line)", borderRadius: 3, color: "var(--accent)" }}>{s}</span>)}
                  {!!tk.dependsOn?.length && <span style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)" }}>{t(locale, "kickoff.deps")}: {tk.dependsOn.map((d) => `#${d + 1}`).join(", ")}</span>}
                </div>
                <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{tk.description}</p>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
            <button onClick={create} disabled={pending} style={{ ...ui.btnAccent, opacity: pending ? 0.5 : 1 }}>{pending ? "…" : t(locale, "kickoff.create", { n: String(tasks.length) })}</button>
            <button onClick={() => setTasks(null)} style={ui.btn}>{t(locale, "common.cancel")}</button>
          </div>
        </div>
      )}
      {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 10 }}>{error}</p>}
    </div>
  );
}
