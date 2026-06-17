"use client";

import { useState, useTransition } from "react";
import { submitBriefAction } from "./actions";
import { TYPES, COMMON, BRANCH, TXT, type Field, type Lang } from "./brief-schema";
import { ui } from "../../admin/ui-styles";

export function BriefForm({ token }: { token: string }) {
  const [lang, setLang] = useState<Lang>("uk");
  const [type, setType] = useState<string>("");
  const [data, setData] = useState<Record<string, unknown>>({});
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = (k: string, v: unknown) => setData((d) => ({ ...d, [k]: v }));
  const toggleMulti = (k: string, opt: string) =>
    setData((d) => {
      const cur = Array.isArray(d[k]) ? (d[k] as string[]) : [];
      return { ...d, [k]: cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] };
    });

  function submit() {
    setError(null);
    const fields = [...COMMON, ...(BRANCH[type] || [])];
    for (const f of fields) if (f.required && !String(data[f.key] ?? "").trim()) { setError(TXT.required[lang]); return; }
    // Контакт лида берём из Telegram Mini App (если открыт в боте) — подписанный initData.
    let initData: string | undefined;
    try {
      // @ts-expect-error — Telegram WebApp SDK подгружается скриптом
      initData = typeof window !== "undefined" ? window.Telegram?.WebApp?.initData || undefined : undefined;
    } catch { /* ignore */ }
    start(async () => {
      const r = await submitBriefAction(token, type, data, initData, "form");
      if (r.error) setError(r.error);
      else setSent(true);
    });
  }

  if (sent) {
    return (
      <div style={{ ...ui.card, maxWidth: 560, margin: "0 auto", textAlign: "center", padding: 32 }}>
        <div style={{ fontSize: 15, lineHeight: 1.6 }}>{TXT.sent[lang]}</div>
      </div>
    );
  }

  function renderField(f: Field) {
    const v = data[f.key];
    return (
      <div key={f.key} style={{ marginTop: 16 }}>
        <label style={{ ...ui.fieldLabel, display: "block", marginBottom: 6 }}>{f[lang]}{f.required && <span style={{ color: "var(--accent)" }}> *</span>}</label>
        {f.kind === "text" && <input value={(v as string) ?? ""} onChange={(e) => set(f.key, e.target.value)} style={{ ...ui.input, width: "100%" }} />}
        {f.kind === "area" && <textarea value={(v as string) ?? ""} onChange={(e) => set(f.key, e.target.value)} rows={3} style={{ ...ui.input, width: "100%", resize: "vertical" }} />}
        {f.kind === "yesno" && (
          <div>
            <div style={{ display: "flex", gap: 8 }}>
              {([["yes", TXT.yes[lang]], ["no", TXT.no[lang]]] as const).map(([val, lbl]) => (
                <button key={val} type="button" onClick={() => set(f.key, val)} style={{ ...ui.monoLabel, textTransform: "none", padding: "7px 16px", borderRadius: 2, cursor: "pointer", border: "1px solid " + (v === val ? "var(--accent)" : "var(--border-2)"), background: v === val ? "var(--accent)" : "transparent", color: v === val ? "#000" : "var(--muted)" }}>{lbl}</button>
              ))}
            </div>
            <input value={(data[f.key + "Other"] as string) ?? ""} onChange={(e) => set(f.key + "Other", e.target.value)} placeholder={TXT.note[lang]} style={{ ...ui.input, width: "100%", marginTop: 8 }} />
          </div>
        )}
        {f.kind === "multi" && (
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {f.opts!.map((o) => {
                const on = Array.isArray(v) && (v as string[]).includes(o.key);
                return (
                  <button key={o.key} type="button" onClick={() => toggleMulti(f.key, o.key)} style={{ ...ui.monoLabel, textTransform: "none", padding: "7px 14px", borderRadius: 2, cursor: "pointer", border: "1px solid " + (on ? "var(--accent)" : "var(--border-2)"), background: on ? "var(--accent)" : "transparent", color: on ? "#000" : "var(--muted)" }}>{o[lang]}</button>
                );
              })}
            </div>
            <input value={(data[f.key + "Other"] as string) ?? ""} onChange={(e) => set(f.key + "Other", e.target.value)} placeholder={TXT.other[lang]} style={{ ...ui.input, width: "100%", marginTop: 8 }} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: "32px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={ui.monoLabel}>Lambertain</div>
          <h1 style={{ ...ui.h1, fontSize: 28, marginTop: 8 }}>{TXT.title[lang]}</h1>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {(["uk", "ru"] as const).map((l) => (
            <button key={l} onClick={() => setLang(l)} style={{ ...ui.monoLabel, background: "none", border: "none", cursor: "pointer", padding: "4px 6px", color: lang === l ? "var(--text)" : "var(--muted)", textDecoration: lang === l ? "underline" : "none" }}>{l.toUpperCase()}</button>
          ))}
        </div>
      </div>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 10, lineHeight: 1.6 }}>{TXT.intro[lang]}</p>

      <div style={{ marginTop: 22 }}>
        <label style={{ ...ui.fieldLabel, display: "block", marginBottom: 8 }}>{TXT.typeQ[lang]}<span style={{ color: "var(--accent)" }}> *</span></label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TYPES.map((tp) => (
            <button key={tp.key} type="button" onClick={() => setType(tp.key)} style={{ ...ui.monoLabel, textTransform: "none", padding: "9px 16px", borderRadius: 2, cursor: "pointer", border: "1px solid " + (type === tp.key ? "var(--accent)" : "var(--border-2)"), background: type === tp.key ? "var(--accent)" : "transparent", color: type === tp.key ? "#000" : "var(--muted)" }}>{tp[lang]}</button>
          ))}
        </div>
      </div>

      {type && (
        <>
          {COMMON.map(renderField)}
          {(BRANCH[type] || []).map(renderField)}
          <div style={{ marginTop: 16 }}>
            <label style={{ ...ui.fieldLabel, display: "block", marginBottom: 6 }}>{TXT.extra[lang]}</label>
            <textarea value={(data.extra as string) ?? ""} onChange={(e) => set("extra", e.target.value)} rows={3} style={{ ...ui.input, width: "100%", resize: "vertical" }} />
          </div>
          {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 14 }}>{error}</p>}
          <button onClick={submit} disabled={pending} style={{ ...ui.btnAccent, marginTop: 22, width: "100%", justifyContent: "center", opacity: pending ? 0.6 : 1 }}>
            {pending ? "…" : TXT.submit[lang]}
          </button>
        </>
      )}
    </div>
  );
}
