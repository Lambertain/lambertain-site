"use client";

import { useState, useTransition } from "react";
import { draftReply, publishReply } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../ui-styles";

export function ReplyBox({ taskId, question, locale }: { taskId: string; question: string; locale: Locale }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function gen() {
    setError(null);
    start(async () => {
      const res = await draftReply(taskId, question);
      if (res.error) setError(res.error);
      else setDraft(res.draft ?? "");
    });
  }

  function publish() {
    if (draft == null) return;
    setError(null);
    start(async () => {
      const res = await publishReply(taskId, draft);
      if (res.error) setError(res.error);
      else setPublished(true);
    });
  }

  if (published) {
    return <p style={{ ...ui.monoLabel, color: "var(--accent)", marginTop: 10 }}>{t(locale, "clients.published")}</p>;
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          ...ui.monoLabel,
          textTransform: "none",
          padding: 10,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          color: "var(--text)",
        }}
      >
        <span style={{ color: "#e8b339" }}>{t(locale, "clients.question")}</span>
        {question}
      </div>

      {draft == null ? (
        <button onClick={gen} disabled={pending} style={{ ...ui.btn, marginTop: 10, opacity: pending ? 0.5 : 1 }}>
          {pending ? t(locale, "common.generating") : t(locale, "clients.draftReply")}
        </button>
      ) : (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            style={{ ...ui.input, resize: "vertical", marginTop: 10 }}
          />
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button onClick={publish} disabled={pending} style={{ ...ui.btnAccent, opacity: pending ? 0.5 : 1 }}>
              {pending ? t(locale, "common.publishing") : t(locale, "clients.publish")}
            </button>
            <button onClick={gen} disabled={pending} style={ui.btn}>
              {t(locale, "clients.regen")}
            </button>
          </div>
        </>
      )}
      {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 8 }}>{error}</p>}
    </div>
  );
}
