"use client";

import { useState, useTransition } from "react";
import { addTaskComment } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../../ui-styles";

export function CommentBox({ id, locale }: { id: string; locale: Locale }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function send() {
    if (!text.trim()) return;
    setError(null);
    start(async () => {
      const r = await addTaskComment(id, text);
      if (r.error) setError(r.error);
      else setText("");
    });
  }

  return (
    <div style={{ marginTop: 16 }}>
      <label style={ui.fieldLabel}>{t(locale, "task.addComment")}</label>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} style={{ ...ui.input, resize: "vertical" }} />
      <button onClick={send} disabled={pending || !text.trim()} style={{ ...ui.btnAccent, marginTop: 10, opacity: pending || !text.trim() ? 0.5 : 1 }}>
        {pending ? t(locale, "common.sending") : t(locale, "task.send")}
      </button>
      {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 8 }}>{error}</p>}
    </div>
  );
}
