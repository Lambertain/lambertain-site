"use client";

import { useState, useRef, useTransition } from "react";
import { addTaskComment } from "./actions";
import { detectFeminine } from "@/lib/gender-check";
import { t, type Locale } from "@/lib/i18n";
import { RichComposer, type RichComposerHandle } from "../../rich-composer";
import { ui } from "../../../ui-styles";

export function CommentBox({ id, locale, canChooseVisibility }: { id: string; locale: Locale; canChooseVisibility?: boolean }) {
  const [bodyText, setBodyText] = useState("");
  const [empty, setEmpty] = useState(true);
  const [visibleToClient, setVisibleToClient] = useState(false); // по умолчанию внутренний
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const composerRef = useRef<RichComposerHandle>(null);

  function send() {
    const content = composerRef.current?.getContent();
    if (!content || content.isEmpty) return;
    setError(null);
    start(async () => {
      const r = await addTaskComment(id, content.markdown, canChooseVisibility ? visibleToClient : true, content.atts);
      if (r.error) setError(r.error);
      else { composerRef.current?.clear(); setBodyText(""); setEmpty(true); }
    });
  }

  // Предупреждение о женском роде — только для команды в клиент-видимом комментарии.
  const femWords = canChooseVisibility && visibleToClient ? detectFeminine(bodyText) : [];

  const controls = (
    <>
      <button onClick={send} disabled={pending || empty} style={{ ...ui.btnAccent, opacity: pending || empty ? 0.5 : 1 }}>
        {pending ? t(locale, "common.sending") : t(locale, "task.send")}
      </button>
      {canChooseVisibility && (
        <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", ...ui.monoLabel, textTransform: "none" }}>
          <input type="checkbox" checked={visibleToClient} onChange={(e) => setVisibleToClient(e.target.checked)} style={{ width: 15, height: 15, accentColor: "var(--accent)", cursor: "pointer" }} />
          {t(locale, "comment.visibleToClient")}
        </label>
      )}
    </>
  );

  return (
    <div style={{ marginTop: 16 }}>
      <label style={ui.fieldLabel}>{t(locale, "task.addComment")}</label>
      <div style={{ border: "1px solid var(--border-2)", borderRadius: 4, display: "flex", flexDirection: "column" }}>
        <RichComposer
          ref={composerRef}
          locale={locale}
          placeholder={t(locale, "task.addComment")}
          minHeight={90}
          onChange={(e, text) => { setEmpty(e); setBodyText(text); }}
          controls={controls}
        />
      </div>
      {canChooseVisibility && (
        <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginTop: 6 }}>
          {visibleToClient ? t(locale, "comment.willSeeClient") : t(locale, "comment.internalOnly")}
        </p>
      )}
      {femWords.length > 0 && (
        <p style={{ fontSize: 13, color: "#e8b339", marginTop: 8, lineHeight: 1.5 }}>
          ⚠️ {t(locale, "gender.warn", { words: femWords.join(", ") })}
        </p>
      )}
      {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 8 }}>{error}</p>}
    </div>
  );
}
