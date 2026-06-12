"use client";

import { useState, useRef, useTransition, useEffect } from "react";
import { createRequestTask } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

type Proj = { key: string; name: string };
type Att = { kind: "image" | "document" | "file"; media_type: string; data: string; name: string };
type Msg = { text: string; atts: Att[] };
type Created = { id: string; url: string };
type Block = { type: "text"; text: string } | { type: "image"; mime: string; data: string };

const SPEECH_LANG: Record<Locale, string> = { uk: "uk-UA", ru: "ru-RU", en: "en-US" };

export function ChatIntake({ projects, locale, fill }: { projects: Proj[]; locale: Locale; fill?: boolean }) {
  const [projectKey, setProjectKey] = useState(projects[0]?.key ?? "");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [created, setCreated] = useState<Created | null>(null);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [locked, setLocked] = useState(false);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<unknown>(null);
  const baseTextRef = useRef("");

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, created]);

  // Скрины и файлы уходят в ленту СРАЗУ отдельными сообщениями (не копятся в композере).
  function addFiles(files: FileList | File[] | null) {
    if (!files) return;
    Array.from(files).forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        const [meta, data] = String(reader.result).split(",");
        const media_type = meta.slice(5, meta.indexOf(";"));
        const kind: Att["kind"] = media_type.startsWith("image/") ? "image" : media_type === "application/pdf" ? "document" : "file";
        setMsgs((p) => [...p, { text: "", atts: [{ kind, media_type, data, name: f.name }] }]);
      };
      reader.readAsDataURL(f);
    });
  }

  function onPaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.files);
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  }

  const preVoiceRef = useRef("");
  const committedRef = useRef("");
  const sessionFinalRef = useRef("");
  const manualStopRef = useRef(false);

  function startVoice() {
    // @ts-expect-error — Web Speech API
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError("Голосовой ввод не поддерживается этим браузером.");
      return;
    }
    preVoiceRef.current = input;
    baseTextRef.current = input ? input + " " : "";
    committedRef.current = "";
    sessionFinalRef.current = "";
    manualStopRef.current = false;
    setRecording(true);
    spawnRecognition(SR);
  }
  // @ts-expect-error — SR конструктор
  function spawnRecognition(SR) {
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
      setInput(baseTextRef.current + committedRef.current + fin + interim);
    };
    rec.onend = () => {
      committedRef.current += sessionFinalRef.current;
      sessionFinalRef.current = "";
      if (!manualStopRef.current) {
        try { rec.start(); } catch { spawnRecognition(SR); }
      } else {
        setRecording(false);
      }
    };
    rec.onerror = () => { /* onend перезапустит */ };
    recRef.current = rec;
    rec.start();
  }
  function stopVoice() {
    manualStopRef.current = true;
    (recRef.current as { stop: () => void } | null)?.stop();
    setRecording(false);
  }
  function cancelVoice() {
    stopVoice();
    setLocked(false);
    setInput(preVoiceRef.current);
  }
  function finishVoice() {
    stopVoice();
    setLocked(false);
    setTimeout(() => addMsg(), 250);
  }

  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldRef = useRef(false);
  const cancelledRef = useRef(false);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  function sendDown(e: React.PointerEvent) {
    heldRef.current = false;
    cancelledRef.current = false;
    startYRef.current = e.clientY;
    startXRef.current = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    holdRef.current = setTimeout(() => { heldRef.current = true; startVoice(); }, 350);
  }
  function sendMove(e: React.PointerEvent) {
    if (!heldRef.current || locked || cancelledRef.current) return;
    if (startYRef.current - e.clientY > 40) setLocked(true);
    else if (startXRef.current - e.clientX > 60) { cancelVoice(); cancelledRef.current = true; heldRef.current = false; }
  }
  function sendUp() {
    if (holdRef.current) clearTimeout(holdRef.current);
    if (cancelledRef.current) { cancelledRef.current = false; return; }
    if (locked) return;
    if (heldRef.current) finishVoice();
    else addMsg();
  }

  // Отправка текстового сообщения В ЛЕНТУ (без ответа ИИ) — копит хронологию.
  function addMsg() {
    if (!input.trim()) return;
    setMsgs((p) => [...p, { text: input.trim(), atts: [] }]);
    setInput("");
    setError(null);
  }

  // Собрать всю ленту (+ незапощенный текст композера) в блоки и создать задачу.
  function createTask() {
    const all = [...msgs];
    if (input.trim()) all.push({ text: input.trim(), atts: [] });
    if (!all.length || !projectKey) return;
    const blocks: Block[] = [];
    for (const m of all) {
      if (m.text) blocks.push({ type: "text", text: m.text });
      for (const a of m.atts) {
        if (a.kind === "image") blocks.push({ type: "image", mime: a.media_type, data: a.data });
        else blocks.push({ type: "text", text: `[файл: ${a.name}]` });
      }
    }
    setError(null);
    start(async () => {
      const res = await createRequestTask(projectKey, blocks);
      if (res.error) setError(res.error);
      else if (res.id && res.url) {
        setCreated({ id: res.id, url: res.url });
        setMsgs([]);
        setInput("");
      }
    });
  }

  function startOver() {
    setCreated(null);
    setMsgs([]);
    setInput("");
    setError(null);
  }

  function startEdit(i: number) {
    setEditIdx(i);
    setEditText(msgs[i].text);
  }
  function saveEdit() {
    if (editIdx == null) return;
    const i = editIdx;
    setMsgs((p) => p.map((m, j) => (j === i ? { ...m, text: editText.trim() } : m)).filter((m) => m.text || m.atts.length));
    setEditIdx(null);
    setEditText("");
  }
  function removeMsg(i: number) {
    setMsgs((p) => p.filter((_, j) => j !== i));
    if (editIdx === i) setEditIdx(null);
  }

  const hasContent = msgs.length > 0 || !!input.trim();
  const iconBtn: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, flexShrink: 0, background: "transparent", border: "1px solid var(--border-2)", color: "var(--muted)", cursor: "pointer", borderRadius: 2 };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: fill ? "100%" : "calc(100dvh - 200px)", minHeight: 0, flex: fill ? 1 : undefined, marginTop: fill ? 0 : 12, border: "1px solid var(--border)", background: "var(--surface)" }}>
      {/* проект */}
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={ui.monoLabel}>{t(locale, "field.project")}:</span>
        {projects.length > 1 ? (
          <select value={projectKey} onChange={(e) => setProjectKey(e.target.value)} style={{ ...ui.input, width: "auto", flex: 1, padding: "6px 10px" }}>
            {projects.map((p) => (
              <option key={p.key} value={p.key}>{p.name}</option>
            ))}
          </select>
        ) : (
          <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{projects[0] ? projects[0].name : "—"}</span>
        )}
      </div>

      {/* лента сообщений */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {msgs.length === 0 && !created && (
          <p style={{ color: "var(--muted)", fontSize: 14, margin: "auto", textAlign: "center", maxWidth: 380 }}>{t(locale, "request.placeholder")}</p>
        )}
        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: "flex-end", maxWidth: "88%", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <div style={{ padding: "10px 12px", borderRadius: 10, fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", background: "var(--surface-2)", border: "1px solid var(--border-2)", width: editIdx === i ? "100%" : undefined }}>
              {editIdx === i ? (
                <textarea
                  value={editText}
                  autoFocus
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveEdit(); } if (e.key === "Escape") setEditIdx(null); }}
                  rows={Math.min(8, editText.split("\n").length + 1)}
                  style={{ ...ui.input, resize: "vertical", width: "100%", minHeight: 60 }}
                />
              ) : (
                m.text
              )}
              {m.atts.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: m.text || editIdx === i ? 8 : 0 }}>
                  {m.atts.map((a, j) =>
                    a.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={j} src={`data:${a.media_type};base64,${a.data}`} alt="" style={{ maxWidth: 140, borderRadius: 6, border: "1px solid var(--border-2)" }} />
                    ) : (
                      <span key={j} style={{ ...ui.monoLabel, textTransform: "none", padding: "4px 8px", border: "1px solid var(--border-2)" }}>{a.name.slice(0, 20)}</span>
                    ),
                  )}
                </div>
              )}
            </div>
            {/* управление сообщением: редактировать текст / удалить */}
            <div style={{ display: "flex", gap: 10 }}>
              {editIdx === i ? (
                <>
                  <button onClick={saveEdit} style={{ ...ui.monoLabel, color: "var(--accent)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>{t(locale, "request.editSave")}</button>
                  <button onClick={() => setEditIdx(null)} style={{ ...ui.monoLabel, color: "var(--muted)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>{t(locale, "request.editCancel")}</button>
                </>
              ) : (
                <>
                  {m.text && <button onClick={() => startEdit(i)} title={t(locale, "request.edit")} style={{ ...ui.monoLabel, color: "var(--muted)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>{t(locale, "request.edit")}</button>}
                  <button onClick={() => removeMsg(i)} title={t(locale, "request.editDelete")} style={{ ...ui.monoLabel, color: "var(--muted)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>{t(locale, "request.editDelete")}</button>
                </>
              )}
            </div>
          </div>
        ))}

        {created && (
          <div style={{ ...ui.card, borderColor: "var(--accent-line)", background: "rgba(185,255,75,0.06)" }}>
            <div style={{ fontSize: 14, lineHeight: 1.6 }}>{t(locale, "request.sent")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10 }}>
              <a href={created.url} style={{ ...ui.monoLabel, color: "var(--accent)", textDecoration: "none" }}>{created.id} →</a>
              <button onClick={startOver} style={{ ...ui.monoLabel, color: "var(--muted)", background: "transparent", border: "1px solid var(--border-2)", padding: "5px 10px", cursor: "pointer", borderRadius: 2 }}>{t(locale, "request.another")}</button>
            </div>
          </div>
        )}
        {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none" }}>{error}</p>}
      </div>

      {/* кнопка «Создать задачу» — появляется, как только есть что отправить */}
      {!created && hasContent && (
        <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border)" }}>
          <button onClick={createTask} disabled={pending} style={{ ...ui.btnAccent, width: "100%", opacity: pending ? 0.5 : 1 }}>
            {t(locale, "request.submit")}
          </button>
        </div>
      )}

      {/* ввод */}
      {locked ? (
        <div style={{ display: "flex", gap: 8, padding: 10, borderTop: "1px solid var(--border)", alignItems: "center" }}>
          <button onClick={cancelVoice} title="" style={{ ...iconBtn, color: "#ff5b5b", borderColor: "#ff5b5b" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          </button>
          <span style={{ ...ui.monoLabel, color: "#ff5b5b", flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff5b5b", display: "inline-block" }} />
            {t(locale, "chat.recording")}
          </span>
          <button onClick={finishVoice} title={t(locale, "chat.send")} style={{ ...iconBtn, width: 40, height: 40, background: "var(--accent)", borderColor: "var(--accent)", color: "#000" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, padding: 10, borderTop: "1px solid var(--border)", alignItems: "flex-end" }}>
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} />
          <button onClick={() => fileRef.current?.click()} title={t(locale, "chat.attachFile")} style={iconBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
          </button>
          <textarea
            value={input}
            onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px"; }}
            onPaste={onPaste}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addMsg(); } }}
            rows={1}
            placeholder={recording ? `${t(locale, "chat.recording")} · ${t(locale, "chat.lockHint")}` : t(locale, "request.placeholder")}
            style={{ ...ui.input, resize: "none", height: 40, maxHeight: 140, overflowY: "auto", flex: 1 }}
          />
          <button
            onPointerDown={(e) => { e.preventDefault(); sendDown(e); }}
            onPointerMove={sendMove}
            onPointerUp={(e) => { e.preventDefault(); sendUp(); }}
            title={t(locale, "chat.send")}
            style={{ ...iconBtn, width: 40, height: 40, background: recording ? "#ff5b5b" : "var(--accent)", borderColor: recording ? "#ff5b5b" : "var(--accent)", color: "#000", touchAction: "none" }}
          >
            {recording ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="7" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
