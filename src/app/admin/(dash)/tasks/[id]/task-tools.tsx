"use client";

import { useState, useTransition } from "react";
import { requestAiReview, setTaskDependencies } from "./actions";
import { statusColor } from "@/lib/statuses";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../../ui-styles";

type Candidate = { id: string; summary: string; status: string | null };

export function TaskTools({
  id,
  candidates,
  currentDeps,
  canReview,
  locale,
}: {
  id: string;
  candidates: Candidate[];
  currentDeps: string[];
  canReview: boolean;
  locale: Locale;
}) {
  const [deps, setDeps] = useState<string[]>(currentDeps);
  const [savedDeps, setSavedDeps] = useState(false);
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);
  const [reviewing, startReview] = useTransition();
  const [savingDeps, startDeps] = useTransition();
  const dirty = deps.slice().sort().join(",") !== currentDeps.slice().sort().join(",");

  function toggle(depId: string) {
    setSavedDeps(false);
    setDeps((cur) => (cur.includes(depId) ? cur.filter((d) => d !== depId) : [...cur, depId]));
  }
  function saveDeps() {
    startDeps(async () => {
      const r = await setTaskDependencies(id, deps);
      if (!r.error) setSavedDeps(true);
    });
  }
  function review() {
    setReviewMsg(null);
    startReview(async () => {
      const r = await requestAiReview(id);
      if (r.error) setReviewMsg(r.error);
      else setReviewMsg(t(locale, r.verdict === "approve" ? "review.doneApprove" : "review.doneRework"));
    });
  }

  if (!canReview) return null;

  return (
    <div style={{ ...ui.card, marginTop: 20 }}>
      {/* ИИ-ревью (on-demand) */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button onClick={review} disabled={reviewing} style={{ ...ui.btn, opacity: reviewing ? 0.5 : 1 }}>
          {reviewing ? t(locale, "review.running") : t(locale, "review.request")}
        </button>
        <span style={{ ...ui.monoLabel, textTransform: "none" }}>{t(locale, "review.hint")}</span>
      </div>
      {reviewMsg && <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--accent)", marginTop: 8 }}>{reviewMsg}</p>}

      {/* Зависимости (блокеры) */}
      <div style={{ marginTop: 18, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
        <label style={ui.fieldLabel}>{t(locale, "deps.title")}</label>
        <div style={{ ...ui.monoLabel, textTransform: "none", marginBottom: 8 }}>{t(locale, "deps.hint")}</div>
        {candidates.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>{t(locale, "deps.none")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
            {candidates.map((c) => {
              const on = deps.includes(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    textAlign: "left",
                    padding: "8px 10px",
                    background: on ? "var(--surface-2)" : "transparent",
                    border: `1px solid ${on ? "var(--accent)" : "var(--border-2)"}`,
                    color: "var(--text)",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  <span style={{ width: 14, height: 14, flexShrink: 0, border: `1px solid ${on ? "var(--accent)" : "var(--border-2)"}`, background: on ? "var(--accent)" : "transparent" }} />
                  <span style={{ ...ui.monoLabel, color: statusColor(c.status), textTransform: "none" }}>{c.id}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.summary}</span>
                </button>
              );
            })}
          </div>
        )}
        {(dirty || savedDeps) && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
            <button onClick={saveDeps} disabled={savingDeps || !dirty} style={{ ...ui.btnAccent, opacity: savingDeps || !dirty ? 0.5 : 1 }}>
              {savingDeps ? "…" : t(locale, "deps.save")}
            </button>
            {savedDeps && !dirty && <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{t(locale, "projects.saved")}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
