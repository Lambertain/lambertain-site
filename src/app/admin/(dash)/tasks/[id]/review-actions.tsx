"use client";

import { useState, useTransition } from "react";
import { reviewTask } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../../ui-styles";

/** Постановщик проверяет результат в «Ревью»: принять (Готово) или вернуть на доработку. */
export function ReviewActions({ id, locale }: { id: string; locale: Locale }) {
  const [reworking, setReworking] = useState(false);
  const [note, setNote] = useState("");
  const [done, setDone] = useState<"done" | "rework" | null>(null);
  const [pending, start] = useTransition();

  function accept() {
    start(async () => { const r = await reviewTask(id, true); if (!r.error) setDone("done"); });
  }
  function sendRework() {
    start(async () => { const r = await reviewTask(id, false, note); if (!r.error) setDone("rework"); });
  }

  if (done) {
    return (
      <div style={{ ...ui.card, marginTop: 16, padding: 14, borderColor: done === "done" ? "var(--accent-line)" : "#f0883e" }}>
        <span style={{ ...ui.monoLabel, color: done === "done" ? "var(--accent)" : "#f0883e" }}>
          {t(locale, done === "done" ? "tab.done" : "tab.rework")} ✓
        </span>
      </div>
    );
  }

  return (
    <div style={{ ...ui.card, marginTop: 16, padding: 14, borderColor: "#e8b339" }}>
      <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)" }}>{t(locale, "review.creatorHint")}</p>
      {reworking ? (
        <div style={{ marginTop: 10 }}>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t(locale, "review.reworkPh")} rows={3} style={{ ...ui.input, width: "100%", resize: "vertical" }} />
          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <button onClick={sendRework} disabled={pending} style={{ ...ui.btnAccent, background: "#f0883e", borderColor: "#f0883e", opacity: pending ? 0.5 : 1 }}>{pending ? "…" : t(locale, "review.rework")}</button>
            <button onClick={() => setReworking(false)} style={ui.btn}>{t(locale, "common.cancel")}</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <button onClick={accept} disabled={pending} style={{ ...ui.btnAccent, opacity: pending ? 0.5 : 1 }}>{t(locale, "review.accept")}</button>
          <button onClick={() => setReworking(true)} style={{ ...ui.btn, color: "#f0883e", borderColor: "#f0883e" }}>{t(locale, "review.rework")}</button>
        </div>
      )}
    </div>
  );
}
