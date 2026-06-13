"use client";

import { useState, useRef, useTransition } from "react";
import { addTaskComment } from "./actions";
import { detectFeminine } from "@/lib/gender-check";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../../ui-styles";

type Att = { localId: string; mime: string; data: string; name: string; image: boolean };

export function CommentBox({ id, locale, canChooseVisibility }: { id: string; locale: Locale; canChooseVisibility?: boolean }) {
  const [text, setText] = useState("");
  const [atts, setAtts] = useState<Att[]>([]);
  const [visibleToClient, setVisibleToClient] = useState(false); // по умолчанию внутренний
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  function insertAtCursor(s: string) {
    const ta = taRef.current;
    const pos = ta ? ta.selectionStart : text.length;
    setText((b) => b.slice(0, pos) + s + b.slice(pos));
    setTimeout(() => { if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = pos + s.length; } }, 0);
  }

  function addFiles(files: FileList | File[] | null) {
    if (!files) return;
    Array.from(files).forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        const [meta, data] = String(reader.result).split(",");
        const mime = meta.slice(5, meta.indexOf(";"));
        const image = mime.startsWith("image/");
        const localId = `a${++seq.current}`;
        const name = f.name || (image ? "image.png" : "file");
        setAtts((p) => [...p, { localId, mime, data, name, image }]);
        insertAtCursor(image ? `\n![${name}](att:${localId})\n` : `\n[${name}](att:${localId})\n`);
      };
      reader.readAsDataURL(f);
    });
  }

  function onPaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.files);
    if (files.length) { e.preventDefault(); addFiles(files); }
  }
  function onDrop(e: React.DragEvent) {
    const files = Array.from(e.dataTransfer.files);
    if (files.length) { e.preventDefault(); addFiles(files); }
  }
  function onDragOver(e: React.DragEvent) { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }

  function removeAtt(localId: string) {
    setAtts((p) => p.filter((a) => a.localId !== localId));
    setText((b) => b.replace(new RegExp(`\\n?!?\\[[^\\]]*\\]\\(att:${localId}\\)\\n?`, "g"), ""));
  }

  function send() {
    if (!text.trim() && atts.length === 0) return;
    setError(null);
    start(async () => {
      const r = await addTaskComment(id, text, canChooseVisibility ? visibleToClient : true, atts);
      if (r.error) setError(r.error);
      else { setText(""); setAtts([]); }
    });
  }

  // Предупреждение о женском роде — только для команды в клиент-видимом комментарии.
  const femWords = canChooseVisibility && visibleToClient ? detectFeminine(text) : [];

  return (
    <div style={{ marginTop: 16 }}>
      <label style={ui.fieldLabel}>{t(locale, "task.addComment")}</label>
      <textarea ref={taRef} value={text} onChange={(e) => setText(e.target.value)} onPaste={onPaste} onDrop={onDrop} onDragOver={onDragOver} rows={3} style={{ ...ui.input, resize: "vertical" }} />

      {atts.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {atts.map((a) => (
            <div key={a.localId} style={{ position: "relative" }}>
              {a.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`data:${a.mime};base64,${a.data}`} alt="" style={{ width: 46, height: 46, objectFit: "cover", borderRadius: 4, border: "1px solid var(--border-2)" }} />
              ) : (
                <span style={{ ...ui.monoLabel, textTransform: "none", padding: "6px 8px", border: "1px solid var(--border-2)", display: "inline-block", borderRadius: 4 }}>{a.name.slice(0, 18)}</span>
              )}
              <button onClick={() => removeAtt(a.localId)} style={{ position: "absolute", top: -6, right: -6, width: 16, height: 16, borderRadius: "50%", background: "var(--border-2)", color: "var(--text)", border: "none", cursor: "pointer", fontSize: 11, lineHeight: "16px", padding: 0 }}>×</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <button onClick={() => fileRef.current?.click()} title={t(locale, "chat.attachFile")} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, background: "transparent", border: "1px solid var(--border-2)", color: "var(--muted)", cursor: "pointer", borderRadius: 2 }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
        </button>
        <button onClick={send} disabled={pending || (!text.trim() && atts.length === 0)} style={{ ...ui.btnAccent, opacity: pending || (!text.trim() && atts.length === 0) ? 0.5 : 1 }}>
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
      {femWords.length > 0 && (
        <p style={{ fontSize: 13, color: "#e8b339", marginTop: 8, lineHeight: 1.5 }}>
          ⚠️ {t(locale, "gender.warn", { words: femWords.join(", ") })}
        </p>
      )}
      {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 8 }}>{error}</p>}
    </div>
  );
}
