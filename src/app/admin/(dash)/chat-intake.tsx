"use client";

import { useState, useRef, useTransition } from "react";
import { createRequestTask } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

type Proj = { key: string; name: string };
type Att = { id: string; mime: string; data: string; name: string; image: boolean };
type Created = { id: string; url: string };
type Block =
  | { type: "text"; text: string }
  | { type: "image"; mime: string; data: string }
  | { type: "file"; mime: string; data: string; name: string };

const SPEECH_LANG: Record<Locale, string> = { uk: "uk-UA", ru: "ru-RU", en: "en-US" };

/** Разбить тело (markdown с маркерами ![..](att:ID) / [..](att:ID)) на блоки с сохранением порядка. */
function buildBlocks(text: string, atts: Att[]): Block[] {
  const blocks: Block[] = [];
  const re = /(!?)\[[^\]]*\]\(att:([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const seg = text.slice(last, m.index).trim();
    if (seg) blocks.push({ type: "text", text: seg });
    const a = atts.find((x) => x.id === m![2]);
    if (a) {
      if (m[1] === "!" && a.image) blocks.push({ type: "image", mime: a.mime, data: a.data });
      else blocks.push({ type: "file", mime: a.mime, data: a.data, name: a.name });
    }
    last = re.lastIndex;
  }
  const tail = text.slice(last).trim();
  if (tail) blocks.push({ type: "text", text: tail });
  return blocks;
}

export function ChatIntake({ projects, locale, fill }: { projects: Proj[]; locale: Locale; fill?: boolean }) {
  const [projectKey, setProjectKey] = useState(projects[0]?.key ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [images, setImages] = useState<Att[]>([]);
  const [created, setCreated] = useState<Created | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<unknown>(null);
  const idSeq = useRef(0);

  /** Вставить текст в тело на позицию курсора. */
  function insertAtCursor(text: string) {
    const ta = bodyRef.current;
    const pos = ta ? ta.selectionStart : body.length;
    setBody((b) => b.slice(0, pos) + text + b.slice(pos));
    setTimeout(() => { if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = pos + text.length; } }, 0);
  }

  function addFiles(files: FileList | File[] | null) {
    if (!files) return;
    Array.from(files).forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        const [meta, data] = String(reader.result).split(",");
        const mime = meta.slice(5, meta.indexOf(";"));
        const image = mime.startsWith("image/");
        const id = `i${++idSeq.current}`;
        const name = f.name || (image ? `screen-${id}` : "file");
        setImages((p) => [...p, { id, mime, data, name, image }]);
        insertAtCursor(image ? `\n![${name}](att:${id})\n` : `\n[${name}](att:${id})\n`);
      };
      reader.readAsDataURL(f);
    });
  }

  function onDrop(e: React.DragEvent) {
    const files = Array.from(e.dataTransfer.files);
    if (files.length) { e.preventDefault(); addFiles(files); }
  }
  function onDragOver(e: React.DragEvent) { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }

  function onPaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.files);
    if (files.length) { e.preventDefault(); addFiles(files); }
  }

  function removeImage(id: string) {
    setImages((p) => p.filter((i) => i.id !== id));
    setBody((b) => b.replace(new RegExp(`\\n?!?\\[[^\\]]*\\]\\(att:${id}\\)\\n?`, "g"), ""));
  }

  // —— голосовой ввод (работает и в браузере, и в Mini App) ——
  const baseRef = useRef("");      // тело до начала записи
  const posRef = useRef(0);        // позиция вставки
  const committedRef = useRef(""); // финализированный текст за сессию
  const sessionFinalRef = useRef("");
  const manualStopRef = useRef(false);

  function startVoice() {
    // @ts-expect-error — Web Speech API
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setError("Голосовой ввод не поддерживается этим браузером."); return; }
    const ta = bodyRef.current;
    baseRef.current = body;
    posRef.current = ta ? ta.selectionStart : body.length;
    committedRef.current = "";
    sessionFinalRef.current = "";
    manualStopRef.current = false;
    setRecording(true);
    spawn(SR);
  }
  // @ts-expect-error — SR конструктор
  function spawn(SR) {
    const rec = new SR();
    rec.lang = SPEECH_LANG[locale];
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e: { results: ArrayLike<{ isFinal: boolean } & ArrayLike<{ transcript: string }>> }) => {
      let fin = "", interim = "";
      for (const r of Array.from(e.results)) {
        if ((r as unknown as { isFinal: boolean }).isFinal) fin += r[0].transcript;
        else interim += r[0].transcript;
      }
      sessionFinalRef.current = fin;
      const ins = committedRef.current + fin + interim;
      const base = baseRef.current, p = posRef.current;
      setBody(base.slice(0, p) + ins + base.slice(p));
    };
    rec.onend = () => {
      committedRef.current += sessionFinalRef.current;
      sessionFinalRef.current = "";
      if (!manualStopRef.current) { try { rec.start(); } catch { spawn(SR); } }
      else setRecording(false);
    };
    rec.onerror = () => { /* onend перезапустит/завершит */ };
    recRef.current = rec;
    rec.start();
  }
  function stopVoice() {
    manualStopRef.current = true;
    (recRef.current as { stop: () => void } | null)?.stop();
    setRecording(false);
  }
  function toggleVoice() {
    if (recording) stopVoice();
    else startVoice();
  }

  function createTask() {
    if (!title.trim()) { setError(t(locale, "request.titleRequired")); return; }
    if (!projectKey) return;
    if (recording) stopVoice();
    const blocks = buildBlocks(body, images);
    setError(null);
    start(async () => {
      const res = await createRequestTask(projectKey, title.trim(), blocks);
      if (res.error) setError(res.error);
      else if (res.id && res.url) {
        setCreated({ id: res.id, url: res.url });
        setTitle(""); setBody(""); setImages([]);
      }
    });
  }

  function startOver() { setCreated(null); setTitle(""); setBody(""); setImages([]); setError(null); }

  const iconBtn: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, flexShrink: 0, background: "transparent", border: "1px solid var(--border-2)", color: "var(--muted)", cursor: "pointer", borderRadius: 2 };

  if (created) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: fill ? "100%" : "auto", flex: fill ? 1 : undefined, marginTop: fill ? 0 : 12, border: "1px solid var(--border)", background: "var(--surface)", padding: 20, gap: 14 }}>
        <div style={{ ...ui.card, borderColor: "var(--accent-line)", background: "rgba(185,255,75,0.06)" }}>
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>{t(locale, "request.sent")}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10 }}>
            <a href={created.url} style={{ ...ui.monoLabel, color: "var(--accent)", textDecoration: "none" }}>{created.id} →</a>
            <button onClick={startOver} style={{ ...ui.monoLabel, color: "var(--muted)", background: "transparent", border: "1px solid var(--border-2)", padding: "5px 10px", cursor: "pointer", borderRadius: 2 }}>{t(locale, "request.another")}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: fill ? "100%" : "calc(100dvh - 200px)", minHeight: 0, flex: fill ? 1 : undefined, marginTop: fill ? 0 : 12, border: "1px solid var(--border)", background: "var(--surface)" }}>
      {/* проект */}
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={ui.monoLabel}>{t(locale, "field.project")}:</span>
        {projects.length > 1 ? (
          <select value={projectKey} onChange={(e) => setProjectKey(e.target.value)} style={{ ...ui.input, width: "auto", flex: 1, padding: "6px 10px" }}>
            {projects.map((p) => (<option key={p.key} value={p.key}>{p.name}</option>))}
          </select>
        ) : (
          <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{projects[0] ? projects[0].name : "—"}</span>
        )}
      </div>

      {/* заголовок */}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t(locale, "request.titlePh")}
        style={{ background: "transparent", border: "none", borderBottom: "1px solid var(--border)", color: "var(--text)", fontSize: 20, fontWeight: 600, padding: "14px 16px", outline: "none" }}
      />

      {/* описание — одно сплошное поле */}
      <textarea
        ref={bodyRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={onDragOver}
        placeholder={t(locale, "request.placeholder")}
        style={{ flex: 1, minHeight: 120, background: "transparent", border: "none", color: "var(--text)", fontSize: 15, lineHeight: 1.6, padding: "14px 16px", outline: "none", resize: "none", fontFamily: "var(--font-body), system-ui, sans-serif" }}
      />

      {/* превью прикреплённых картинок */}
      {images.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "8px 12px", borderTop: "1px solid var(--border)" }}>
          {images.map((a) => (
            <div key={a.id} style={{ position: "relative" }}>
              {a.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`data:${a.mime};base64,${a.data}`} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4, border: "1px solid var(--border-2)" }} />
              ) : (
                <span style={{ ...ui.monoLabel, textTransform: "none", padding: "6px 8px", border: "1px solid var(--border-2)", display: "inline-block", borderRadius: 4 }}>{a.name.slice(0, 18)}</span>
              )}
              <button onClick={() => removeImage(a.id)} style={{ position: "absolute", top: -6, right: -6, width: 16, height: 16, borderRadius: "50%", background: "var(--border-2)", color: "var(--text)", border: "none", cursor: "pointer", fontSize: 11, lineHeight: "16px", padding: 0 }}>×</button>
            </div>
          ))}
        </div>
      )}

      {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", padding: "0 16px" }}>{error}</p>}

      {/* нижняя панель: скрепка, микрофон, [Создать задачу] */}
      <div style={{ display: "flex", gap: 8, padding: 10, borderTop: "1px solid var(--border)", alignItems: "center" }}>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <button onClick={() => fileRef.current?.click()} title={t(locale, "chat.attachFile")} style={iconBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
        </button>
        <button onClick={toggleVoice} title={t(locale, "chat.voice")} style={{ ...iconBtn, background: recording ? "#ff5b5b" : "transparent", borderColor: recording ? "#ff5b5b" : "var(--border-2)", color: recording ? "#fff" : "var(--muted)" }}>
          {recording ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
          )}
        </button>
        <button onClick={createTask} disabled={pending} style={{ ...ui.btnAccent, marginLeft: "auto", opacity: pending ? 0.5 : 1 }}>
          {pending ? "…" : t(locale, "request.submit")}
        </button>
      </div>
    </div>
  );
}
