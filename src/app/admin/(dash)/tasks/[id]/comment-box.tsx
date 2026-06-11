"use client";

import { useState, useTransition } from "react";
import { addTaskComment } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../../ui-styles";

export function CommentBox({ id, locale, canChooseVisibility }: { id: string; locale: Locale; canChooseVisibility?: boolean }) {
  const [text, setText] = useState("");
  const [visibleToClient, setVisibleToClient] = useState(false); // по умолчанию внутренний
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function send() {
    if (!text.trim()) return;
    setError(null);
    start(async () => {
      const r = await addTaskComment(id, text, canChooseVisibility ? visibleToClient : true);
      if (r.error) setError(r.error);
      else setText("");
    });
  }

  return (
    <div style={{ marginTop: 16 }}>
      <label style={ui.fieldLabel}>{t(locale, "task.addComment")}</label>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} style={{ ...ui.input, resize: "vertical" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
        <button onClick={send} disabled={pending || !text.trim()} style={{ ...ui.btnAccent, opacity: pending || !text.trim() ? 0.5 : 1 }}>
          {pending ? t(locale, "common.sending") : t(locale, "task.send")}
        </button>
        {canChooseVisibility && (
          <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", ...ui.monoLabel, textTransform: "none" }}>
            <input type="checkbox" checked={visibleToClient} onChange={(e) => setVisibleToClient(e.target.checked)} style={{ width: 15, height: 15, accentColor: "var(--accent)", cursor: "pointer" }} />
            {t(locale, "comment.visibleToClient")}
          </label>
        )}
      </div>
      {canChooseVisibility && (
        <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginTop: 6 }}>
          {visibleToClient ? t(locale, "comment.willSeeClient") : t(locale, "comment.internalOnly")}
        </p>
      )}
      {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 8 }}>{error}</p>}
    </div>
  );
}
