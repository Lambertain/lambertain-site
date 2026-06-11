"use client";

import { useState, useTransition } from "react";
import { draftClientReply, addTaskComment } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../../ui-styles";

/**
 * Ответ клиенту через ИИ: разработчик даёт суть своими словами → ИИ формирует ответ
 * от имени Lambertain (сверяясь с задачей и кодом) → разработчик утверждает/правит → публикуется клиенту.
 */
export function ClientReply({ id, locale }: { id: string; locale: Locale }) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genPending, startGen] = useTransition();
  const [pubPending, startPub] = useTransition();

  function generate() {
    setError(null);
    startGen(async () => {
      const r = await draftClientReply(id, feedback);
      if (r.error) setError(r.error);
      else setDraft(r.draft ?? "");
    });
  }
  function publish() {
    if (!draft?.trim()) return;
    setError(null);
    startPub(async () => {
      const r = await addTaskComment(id, draft, true); // видимый клиенту
      if (r.error) setError(r.error);
      else { setPublished(true); setOpen(false); setFeedback(""); setDraft(null); }
    });
  }

  if (!open) {
    return (
      <div style={{ marginTop: 12 }}>
        <button onClick={() => { setOpen(true); setPublished(false); }} style={ui.btn}>
          {t(locale, "creply.open")}
        </button>
        {published && <span style={{ ...ui.monoLabel, color: "var(--accent)", marginLeft: 12 }}>{t(locale, "creply.published")}</span>}
      </div>
    );
  }

  return (
    <div style={{ ...ui.card, marginTop: 12, borderColor: "var(--accent-line)" }}>
      <div style={ui.monoLabel}>{t(locale, "creply.title")}</div>
      <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginTop: 6 }}>{t(locale, "creply.hint")}</p>

      <label style={{ ...ui.fieldLabel, marginTop: 10 }}>{t(locale, "creply.feedbackLabel")}</label>
      <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} placeholder={t(locale, "creply.feedbackPlaceholder")} style={{ ...ui.input, resize: "vertical" }} />
      <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
        <button onClick={generate} disabled={genPending || !feedback.trim()} style={{ ...ui.btnAccent, opacity: genPending || !feedback.trim() ? 0.5 : 1 }}>
          {genPending ? t(locale, "common.generating") : t(locale, draft ? "creply.regenerate" : "creply.generate")}
        </button>
        <button onClick={() => { setOpen(false); setDraft(null); setError(null); }} style={ui.btn}>{t(locale, "common.cancel")}</button>
      </div>

      {draft !== null && (
        <div style={{ marginTop: 14 }}>
          <label style={ui.fieldLabel}>{t(locale, "creply.draftLabel")}</label>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={6} style={{ ...ui.input, resize: "vertical" }} />
          <button onClick={publish} disabled={pubPending || !draft.trim()} style={{ ...ui.btnAccent, marginTop: 10, opacity: pubPending || !draft.trim() ? 0.5 : 1 }}>
            {pubPending ? t(locale, "common.publishing") : t(locale, "creply.publish")}
          </button>
        </div>
      )}

      {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 8 }}>{error}</p>}
    </div>
  );
}
