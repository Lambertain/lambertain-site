"use client";

import { useState, useRef, useTransition, useEffect } from "react";
import { intakeTurn, createProposedTasks } from "./actions";
import type { ProposedTask } from "@/lib/intake";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

type Proj = { key: string; name: string };
type Msg = { role: "user" | "assistant"; content: unknown };
type Att = { kind: "image" | "document" | "file"; media_type: string; data: string; name: string };

function textOf(c: unknown): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.filter((b) => (b as { type: string }).type === "text").map((b) => (b as { text: string }).text).join("\n");
  return "";
}
function imagesOf(c: unknown): string[] {
  if (!Array.isArray(c)) return [];
  return c.filter((b) => (b as { type: string }).type === "image").map((b) => {
    const s = (b as { source: { media_type: string; data: string } }).source;
    return `data:${s.media_type};base64,${s.data}`;
  });
}

const SPEECH_LANG: Record<Locale, string> = { uk: "uk-UA", ru: "ru-RU", en: "en-US" };

export function ChatIntake({ projects, locale, fill }: { projects: Proj[]; locale: Locale; fill?: boolean }) {
  const [projectKey, setProjectKey] = useState(projects[0]?.key ?? "");
  const [history, setHistory] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [atts, setAtts] = useState<Att[]>([]);
  const [proposed, setProposed] = useState<ProposedTask[] | null>(null);
  const [created, setCreated] = useState<{ id: string; url: string }[] | null>(null);
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
  }, [history, pending, proposed]);

  function addFiles(files: FileList | File[] | null) {
    if (!files) return;
    Array.from(files).forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        const [meta, data] = String(reader.result).split(",");
        const media_type = meta.slice(5, meta.indexOf(";"));
        const kind: Att["kind"] = media_type.startsWith("image/") ? "image" : media_type === "application/pdf" ? "document" : "file";
        setAtts((p) => [...p, { kind, media_type, data, name: f.name }]);
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
  const committedRef = useRef(""); // финализированный текст за все перезапуски сессии
  const sessionFinalRef = useRef(""); // финал текущего under-the-hood сеанса
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
      // Накопить финал текущего сеанса и перезапустить, если не остановили вручную (борьба с авто-стопом на паузе).
      committedRef.current += sessionFinalRef.current;
      sessionFinalRef.current = "";
      if (!manualStopRef.current) {
        try { rec.start(); } catch { spawnRecognition(SR); }
      } else {
        setRecording(false);
      }
    };
    rec.onerror = () => { /* onend всё равно сработает и перезапустит */ };
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
    setInput(preVoiceRef.current); // вернуть текст до записи — голосовое отменено
  }
  function finishVoice() {
    stopVoice();
    setLocked(false);
    setTimeout(() => send(), 250);
  }

  // Зажать «Отправить» = запись; потянуть вверх = замок (руки свободны); отпустить = стоп+отправка; тап = отправка.
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
    if (startYRef.current - e.clientY > 40) setLocked(true); // вверх — замок
    else if (startXRef.current - e.clientX > 60) { cancelVoice(); cancelledRef.current = true; heldRef.current = false; } // влево — удалить
  }
  function sendUp() {
    if (holdRef.current) clearTimeout(holdRef.current);
    if (cancelledRef.current) { cancelledRef.current = false; return; }
    if (locked) return; // замок — продолжаем запись, управление кнопками
    if (heldRef.current) finishVoice();
    else send();
  }

  function send() {
    if (!input.trim() && atts.length === 0) return;
    if (!projectKey) return;
    setError(null);
    setProposed(null);
    const content: unknown[] = [];
    const fileNames = atts.filter((a) => a.kind === "file").map((a) => a.name);
    let text = input.trim();
    if (fileNames.length) text += (text ? "\n" : "") + `[прикреплены файлы: ${fileNames.join(", ")}]`;
    if (text) content.push({ type: "text", text });
    for (const a of atts) {
      if (a.kind === "image") content.push({ type: "image", source: { type: "base64", media_type: a.media_type, data: a.data } });
      else if (a.kind === "document") content.push({ type: "document", source: { type: "base64", media_type: a.media_type, data: a.data } });
    }
    const nh: Msg[] = [...history, { role: "user", content }];
    setHistory(nh);
    setInput("");
    setAtts([]);
    start(async () => {
      const res = await intakeTurn(nh as never, projectKey);
      if (res.error) setError(res.error);
      else {
        if (res.messages) setHistory(res.messages as Msg[]);
        if (res.proposed) setProposed(res.proposed);
      }
    });
  }

  function createTasks() {
    if (!proposed) return;
    start(async () => {
      const res = await createProposedTasks(projectKey, proposed);
      if (res.error) setError(res.error);
      else {
        setCreated(res.created ?? []);
        setProposed(null);
      }
    });
  }

  const display = history.filter((m) => textOf(m.content) || imagesOf(m.content).length || (Array.isArray(m.content) && m.content.some((b) => (b as { type: string }).type === "document")));

  const iconBtn: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, flexShrink: 0, background: "transparent", border: "1px solid var(--border-2)", color: "var(--muted)", cursor: "pointer", borderRadius: 2 };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: fill ? "100%" : "calc(100dvh - 200px)", minHeight: 0, flex: fill ? 1 : undefined, marginTop: fill ? 0 : 12, border: "1px solid var(--border)", background: "var(--surface)" }}>
      {/* проект (селект только если проектов больше одного) */}
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={ui.monoLabel}>{t(locale, "field.project")}:</span>
        {projects.length > 1 ? (
          <select value={projectKey} onChange={(e) => setProjectKey(e.target.value)} style={{ ...ui.input, width: "auto", flex: 1, padding: "6px 10px" }}>
            {projects.map((p) => (
              <option key={p.key} value={p.key}>{p.key} — {p.name}</option>
            ))}
          </select>
        ) : (
          <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{projects[0] ? `${projects[0].key} — ${projects[0].name}` : "—"}</span>
        )}
      </div>

      {/* сообщения */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {display.length === 0 && !pending && (
          <p style={{ color: "var(--muted)", fontSize: 14, margin: "auto", textAlign: "center", maxWidth: 360 }}>{t(locale, "chat.empty")}</p>
        )}
        {display.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%" }}>
            <div style={{ ...ui.monoLabel, marginBottom: 4, color: m.role === "user" ? "var(--muted)" : "var(--accent)", textAlign: m.role === "user" ? "right" : "left" }}>
              {m.role === "user" ? t(locale, "chat.you") : "Lambertain"}
            </div>
            <div style={{ padding: "10px 12px", borderRadius: 10, fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", background: m.role === "user" ? "var(--surface-2)" : "rgba(185,255,75,0.06)", border: "1px solid " + (m.role === "user" ? "var(--border-2)" : "var(--accent-line)") }}>
              {textOf(m.content)}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: imagesOf(m.content).length ? 8 : 0 }}>
                {imagesOf(m.content).map((src, j) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={j} src={src} alt="" style={{ maxWidth: 140, borderRadius: 6, border: "1px solid var(--border-2)" }} />
                ))}
              </div>
            </div>
          </div>
        ))}
        {pending && <div style={{ ...ui.monoLabel, color: "var(--accent)" }}>{t(locale, "chat.thinking")}</div>}

        {proposed && (
          <div style={{ ...ui.card, borderColor: "var(--accent-line)" }}>
            <div style={ui.monoLabel}>{t(locale, "chat.proposedTitle")} · {proposed.length}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
              {proposed.map((tk, i) => (
                <div key={i} style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{tk.summary}</div>
                  <div style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>{tk.description}</div>
                </div>
              ))}
            </div>
            <button onClick={createTasks} disabled={pending} style={{ ...ui.btnAccent, marginTop: 12, opacity: pending ? 0.5 : 1 }}>{t(locale, "chat.createAll")}</button>
          </div>
        )}
        {created && (
          <div style={{ ...ui.card, borderColor: "var(--accent-line)" }}>
            <span style={{ color: "var(--accent)" }}>{t(locale, "chat.createdOk")} </span>
            {created.map((c, i) => (<a key={i} href={c.url} style={{ color: "var(--accent)", marginRight: 10 }}>{c.id}</a>))}
          </div>
        )}
        {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none" }}>{error}</p>}
      </div>

      {/* превью вложений */}
      {atts.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "8px 12px", borderTop: "1px solid var(--border)" }}>
          {atts.map((a, i) => (
            <div key={i} style={{ position: "relative" }}>
              {a.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`data:${a.media_type};base64,${a.data}`} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4, border: "1px solid var(--border-2)" }} />
              ) : (
                <span style={{ ...ui.monoLabel, textTransform: "none", padding: "6px 8px", border: "1px solid var(--border-2)", display: "inline-block" }}>{a.name.slice(0, 18)}</span>
              )}
              <button onClick={() => setAtts((p) => p.filter((_, j) => j !== i))} style={{ position: "absolute", top: -6, right: -6, width: 16, height: 16, borderRadius: "50%", background: "var(--border-2)", color: "var(--text)", border: "none", cursor: "pointer", fontSize: 11, lineHeight: "16px", padding: 0 }}>×</button>
            </div>
          ))}
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
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }}
            rows={1}
            placeholder={recording ? `${t(locale, "chat.recording")} · ${t(locale, "chat.lockHint")}` : t(locale, "chat.placeholder")}
            style={{ ...ui.input, resize: "none", height: 40, maxHeight: 140, overflowY: "auto", flex: 1 }}
          />
          <button
            onPointerDown={(e) => { e.preventDefault(); sendDown(e); }}
            onPointerMove={sendMove}
            onPointerUp={(e) => { e.preventDefault(); sendUp(); }}
            disabled={pending}
            title={t(locale, "chat.send")}
            style={{ ...iconBtn, width: 40, height: 40, background: recording ? "#ff5b5b" : "var(--accent)", borderColor: recording ? "#ff5b5b" : "var(--accent)", color: "#000", opacity: pending ? 0.5 : 1, touchAction: "none" }}
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
