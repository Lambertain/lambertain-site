"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { submitBriefAction } from "./actions";
import { TYPES, TXT, fieldsFor, answerLabel, type Field, type Lang } from "./brief-schema";
import { ui } from "../../admin/ui-styles";

/**
 * Дружелюбный чат-интейк: те же вопросы, что и в форме (из общего brief-schema),
 * но по одному за раз, диалогом. Никакого LLM — детерминированный сценарий, ответы складываются
 * в тот же payload, что и форма. Добавил поле в схему → оно появляется и здесь автоматически.
 */
export function BriefChat({ token }: { token: string }) {
  const [lang, setLang] = useState<Lang>("uk");
  const [type, setType] = useState<string>("");
  const [data, setData] = useState<Record<string, unknown>>({});
  const [step, setStep] = useState(-1); // -1 = выбор типа; 0..n-1 = поля; >=n — финал
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  const fields = type ? fieldsFor(type) : [];
  const set = (k: string, v: unknown) => setData((d) => ({ ...d, [k]: v }));
  const toggleMulti = (k: string, opt: string) =>
    setData((d) => {
      const cur = Array.isArray(d[k]) ? (d[k] as string[]) : [];
      return { ...d, [k]: cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] };
    });

  // Автоскролл вниз при каждом новом шаге.
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [step, type]);

  const current: Field | null = step >= 0 && step < fields.length ? fields[step] : null;
  const atEnd = type && step >= fields.length;

  function next() { setError(null); setStep((s) => s + 1); }
  function back() { setError(null); setStep((s) => Math.max(-1, s - 1)); }
  function pickType(tp: string) { setType(tp); setStep(0); setError(null); }

  function advance(f: Field) {
    if (f.required && !String(data[f.key] ?? "").trim()) { setError(TXT.required[lang]); return; }
    next();
  }

  function submit() {
    setError(null);
    let initData: string | undefined;
    try {
      // @ts-expect-error — Telegram WebApp SDK подгружается скриптом
      initData = typeof window !== "undefined" ? window.Telegram?.WebApp?.initData || undefined : undefined;
    } catch { /* ignore */ }
    start(async () => {
      const r = await submitBriefAction(token, type, data, initData, "chat");
      if (r.error) setError(r.error);
      else setSent(true);
    });
  }

  if (sent) {
    return (
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "32px 20px" }}>
        <div style={{ ...ui.card, textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 15, lineHeight: 1.6 }}>{TXT.sent[lang]}</div>
        </div>
      </div>
    );
  }

  const bot = (text: string, key: string) => (
    <div key={key} style={{ display: "flex", marginTop: 12 }}>
      <div style={{ maxWidth: "82%", background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: "2px 14px 14px 14px", padding: "10px 14px", fontSize: 14, lineHeight: 1.5, color: "var(--text)" }}>{text}</div>
    </div>
  );
  const usr = (text: string, key: string) => (
    <div key={key} style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
      <div style={{ maxWidth: "82%", background: "var(--accent)", color: "#000", borderRadius: "14px 2px 14px 14px", padding: "10px 14px", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{text}</div>
    </div>
  );

  // Лента: приветствие → (тип) → отвеченные пары вопрос/ответ → текущий вопрос.
  const feed: React.ReactNode[] = [bot(TXT.chatHi[lang], "hi")];
  if (type) {
    feed.push(usr(TYPES.find((t) => t.key === type)?.[lang] || type, "type-a"));
    for (let i = 0; i < Math.min(step, fields.length); i++) {
      const f = fields[i];
      feed.push(bot(f[lang], `q${i}`));
      feed.push(usr(answerLabel(f, data, lang), `a${i}`));
    }
    if (current) feed.push(bot(current[lang] + (current.required ? " *" : ""), `qc${step}`));
    if (atEnd) feed.push(bot(TXT.done[lang], "done"));
  }

  const chip = (on: boolean): React.CSSProperties => ({ ...ui.monoLabel, textTransform: "none", padding: "8px 14px", borderRadius: 14, cursor: "pointer", border: "1px solid " + (on ? "var(--accent)" : "var(--border-2)"), background: on ? "var(--accent)" : "transparent", color: on ? "#000" : "var(--muted)" });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", maxWidth: 620, margin: "0 auto" }}>
      {/* шапка */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
        <div>
          <span style={ui.monoLabel}>Lambertain</span>
          <span style={{ ...ui.monoLabel, color: "var(--muted)", marginLeft: 10 }}>{TXT.title[lang]}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {type && <span style={{ ...ui.monoLabel, color: "var(--muted)" }}>{Math.min(step + 1, fields.length)} / {fields.length}</span>}
          <div style={{ display: "flex", gap: 2 }}>
            {(["uk", "ru"] as const).map((l) => (
              <button key={l} onClick={() => setLang(l)} style={{ ...ui.monoLabel, background: "none", border: "none", cursor: "pointer", padding: "4px 6px", color: lang === l ? "var(--text)" : "var(--muted)", textDecoration: lang === l ? "underline" : "none" }}>{l.toUpperCase()}</button>
            ))}
          </div>
        </div>
      </div>

      {/* лента сообщений */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "8px 20px 16px" }}>{feed}</div>

      {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", padding: "0 20px" }}>{error}</p>}

      {/* композер — адаптируется под текущий шаг */}
      <div style={{ borderTop: "1px solid var(--border)", padding: 14, background: "var(--surface)" }}>
        {/* выбор типа */}
        {step === -1 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {TYPES.map((tp) => (
              <button key={tp.key} onClick={() => pickType(tp.key)} style={chip(false)}>{tp[lang]}</button>
            ))}
          </div>
        )}

        {/* текущее поле */}
        {current && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(current.kind === "text" || current.kind === "area") && (
              <textarea
                autoFocus
                value={(data[current.key] as string) ?? ""}
                onChange={(e) => set(current.key, e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) advance(current); }}
                placeholder={TXT.typed[lang]}
                rows={current.kind === "area" ? 3 : 1}
                style={{ ...ui.input, width: "100%", resize: "vertical" }}
              />
            )}

            {current.kind === "yesno" && (
              <>
                <div style={{ display: "flex", gap: 8 }}>
                  {([["yes", TXT.yes[lang]], ["no", TXT.no[lang]]] as const).map(([val, lbl]) => (
                    <button key={val} onClick={() => set(current.key, val)} style={chip(data[current.key] === val)}>{lbl}</button>
                  ))}
                </div>
                <input value={(data[current.key + "Other"] as string) ?? ""} onChange={(e) => set(current.key + "Other", e.target.value)} placeholder={TXT.note[lang]} style={{ ...ui.input, width: "100%" }} />
              </>
            )}

            {current.kind === "multi" && (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {current.opts!.map((o) => {
                    const on = Array.isArray(data[current.key]) && (data[current.key] as string[]).includes(o.key);
                    return <button key={o.key} onClick={() => toggleMulti(current.key, o.key)} style={chip(on)}>{o[lang]}</button>;
                  })}
                </div>
                <input value={(data[current.key + "Other"] as string) ?? ""} onChange={(e) => set(current.key + "Other", e.target.value)} placeholder={TXT.addOther[lang]} style={{ ...ui.input, width: "100%" }} />
              </>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={back} style={{ ...ui.monoLabel, background: "transparent", border: "1px solid var(--border-2)", color: "var(--muted)", padding: "8px 12px", cursor: "pointer", borderRadius: 2 }}>{TXT.back[lang]}</button>
              {!current.required && (
                <button onClick={next} style={{ ...ui.monoLabel, background: "transparent", border: "1px solid var(--border-2)", color: "var(--muted)", padding: "8px 12px", cursor: "pointer", borderRadius: 2 }}>{TXT.skip[lang]}</button>
              )}
              <button onClick={() => advance(current)} style={{ ...ui.btnAccent, marginLeft: "auto" }}>{TXT.send[lang]}</button>
            </div>
          </div>
        )}

        {/* финал — отправка */}
        {atEnd && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={back} style={{ ...ui.monoLabel, background: "transparent", border: "1px solid var(--border-2)", color: "var(--muted)", padding: "8px 12px", cursor: "pointer", borderRadius: 2 }}>{TXT.back[lang]}</button>
            <button onClick={submit} disabled={pending} style={{ ...ui.btnAccent, marginLeft: "auto", opacity: pending ? 0.6 : 1 }}>{pending ? "…" : TXT.submit[lang]}</button>
          </div>
        )}
      </div>
    </div>
  );
}
