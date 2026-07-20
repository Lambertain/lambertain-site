"use client";

import { useState, useTransition } from "react";
import { markClientActionDone } from "./actions";
import { Markdown } from "../../markdown";
import { ui } from "../../../ui-styles";

/**
 * Блок «потрібна ваша дія»: инструкция-гайд + (если задача собирает данные) поле ввода + «Готово».
 * collect — структурированное поле сбора (лейбл + тип); showInput=false → инструкция без ввода (только «Готово»).
 */
export function ClientActionBar({ taskId, action, guide, collect, showInput = true }: {
  taskId: string;
  action: string;
  guide?: { title: string; body: string } | null;
  collect?: { label: string; kind: "text" | "url" | "secret" } | null;
  showInput?: boolean;
}) {
  const [data, setData] = useState("");
  const [openGuide, setOpenGuide] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function done() {
    setMsg(null);
    start(async () => {
      const r = await markClientActionDone(taskId, data);
      if (r.error) setMsg(r.error);
    });
  }

  const label = collect?.label ?? "Дані після реєстрації (токен / логін / посилання)";
  const secret = collect?.kind === "secret";

  return (
    <div style={{ ...ui.card, padding: 18, marginTop: 16, borderColor: "#e8b339", background: "rgba(232,179,57,0.06)" }}>
      <div style={{ ...ui.monoLabel, color: "#e8b339" }}>🔑 Потрібна ваша дія</div>
      <p style={{ fontSize: 15, lineHeight: 1.55, marginTop: 10, whiteSpace: "pre-wrap" }}>{action}</p>

      {guide && (
        <div style={{ marginTop: 12, border: "1px solid var(--border-2)", borderRadius: 4, overflow: "hidden" }}>
          <button onClick={() => setOpenGuide((o) => !o)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, background: "transparent", border: "none", color: "var(--text)", cursor: "pointer", textAlign: "left", fontSize: 14, fontWeight: 600 }}>
            📋 {guide.title}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" style={{ transform: openGuide ? "rotate(180deg)" : "none" }}><polyline points="6 9 12 15 18 9" /></svg>
          </button>
          {openGuide && <div style={{ padding: "0 12px 12px", borderTop: "1px solid var(--border)" }}><div style={{ marginTop: 10 }}><Markdown>{guide.body}</Markdown></div></div>}
        </div>
      )}

      {showInput && (
        <>
          <label style={{ ...ui.fieldLabel, marginTop: 14 }}>{label}</label>
          {secret ? (
            <input value={data} onChange={(e) => setData(e.target.value)} type="password" placeholder="Вставте значення" style={{ ...ui.input, fontSize: 14, fontFamily: "var(--font-mono)" }} />
          ) : (
            <textarea value={data} onChange={(e) => setData(e.target.value)} rows={collect ? 2 : 3} placeholder="Вставте сюди отримані дані" style={{ ...ui.input, resize: "vertical", fontSize: 14, lineHeight: 1.5 }} />
          )}
        </>
      )}

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
        <button onClick={done} disabled={pending} style={{ ...ui.btnAccent, opacity: pending ? 0.5 : 1 }}>{pending ? "…" : "Готово"}</button>
        {showInput && <span style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)" }}>Дані збережуться в налаштування проєкту.</span>}
        {msg && <span style={{ ...ui.monoLabel, textTransform: "none", color: "#ff5b5b" }}>{msg}</span>}
      </div>
    </div>
  );
}
