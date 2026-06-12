"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { submitOnboardingField } from "./actions";

type Collect = "clientGit" | "railwayToken";
export type Step = { title: string; body: string; collect?: Collect };

const PROGRESS_KEY = "lamb_onboarding_done";

const FIELD_META: Record<Collect, { label: string; placeholder: string }> = {
  clientGit: { label: "Посилання на ваш репозиторій", placeholder: "https://github.com/ваш-нік/проєкт" },
  railwayToken: { label: "Railway токен", placeholder: "вставте токен" },
};

export function OnboardingAccordion({ steps, editable, values }: { steps: Step[]; editable?: boolean; values?: Record<Collect, string> }) {
  // done — сколько шагов выполнено (последовательно); open — раскрытый шаг; ready — прогресс прочитан.
  const [st, setSt] = useState<{ done: number; open: number; ready: boolean }>({ done: 0, open: 0, ready: false });
  const { done, open, ready } = st;
  const [vals, setVals] = useState<Record<Collect, string>>(values || { clientGit: "", railwayToken: "" });
  const [saved, setSaved] = useState<Record<Collect, boolean>>({ clientGit: !!values?.clientGit, railwayToken: !!values?.railwayToken });
  const [err, setErr] = useState<string | null>(null);
  const [pending, startSave] = useTransition();
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const saved = Math.min(Math.max(0, Number(localStorage.getItem(PROGRESS_KEY) || 0)), steps.length);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- одноразовое чтение прогресса из localStorage после маунта (без каскада)
    setSt({ done: saved, open: Math.min(saved, steps.length - 1), ready: true });
  }, [steps.length]);

  function advance(i: number) {
    const nd = Math.max(done, i + 1);
    localStorage.setItem(PROGRESS_KEY, String(nd));
    setSt((s) => ({ ...s, done: nd, open: i + 1 < steps.length ? i + 1 : s.open }));
    if (i + 1 < steps.length) setTimeout(() => refs.current[i + 1]?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  function saveField(i: number, field: Collect) {
    setErr(null);
    startSave(async () => {
      const res = await submitOnboardingField(field, vals[field]);
      if (res.error) { setErr(res.error); return; }
      setSaved((s) => ({ ...s, [field]: true }));
      advance(i);
    });
  }

  if (!ready) return null;

  const allDone = done >= steps.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {steps.map((step, i) => {
        const unlocked = i <= done;
        const isDone = i < done;
        const isOpen = open === i && unlocked;
        const collect = editable ? step.collect : undefined;
        return (
          <div
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            style={{ border: "1px solid " + (isOpen ? "var(--accent-line)" : "var(--border)"), borderRadius: 10, background: "var(--surface)", opacity: unlocked ? 1 : 0.55, overflow: "hidden" }}
          >
            <button
              onClick={() => unlocked && setSt((s) => ({ ...s, open: isOpen ? -1 : i }))}
              disabled={!unlocked}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", background: "transparent", border: "none", cursor: unlocked ? "pointer" : "not-allowed", textAlign: "left" }}
            >
              <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, background: isDone || isOpen ? "var(--accent)" : "var(--surface-2)", color: isDone || isOpen ? "#000" : "var(--muted)", border: "1px solid " + (unlocked ? "var(--accent)" : "var(--border-2)") }}>
                {isDone ? "✓" : i + 1}
              </span>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: unlocked ? "var(--text)" : "var(--muted)" }}>
                {step.title || `Крок ${i + 1}`}
              </span>
              {!unlocked ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }}><polyline points="6 9 12 15 18 9" /></svg>
              )}
            </button>

            {isOpen && (
              <div style={{ padding: "0 18px 18px" }}>
                <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text)", wordBreak: "break-word" }}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      // eslint-disable-next-line @next/next/no-img-element
                      img: (props) => <img {...props} alt={props.alt || ""} style={{ maxWidth: "100%", height: "auto", borderRadius: 8, border: "1px solid var(--border-2)", margin: "10px 0", display: "block" }} loading="lazy" />,
                      a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "underline", wordBreak: "break-all" }} />,
                      p: (props) => <p style={{ margin: "8px 0" }}>{props.children}</p>,
                      ol: (props) => <ol style={{ margin: "8px 0", paddingLeft: 22 }}>{props.children}</ol>,
                      ul: (props) => <ul style={{ margin: "8px 0", paddingLeft: 22 }}>{props.children}</ul>,
                      li: (props) => <li style={{ margin: "4px 0" }}>{props.children}</li>,
                      strong: (props) => <strong style={{ color: "var(--text)" }}>{props.children}</strong>,
                    }}
                  >
                    {step.body}
                  </ReactMarkdown>
                </div>

                {/* Поле для ввода данных клиента (репозиторій / токен) */}
                {collect ? (
                  <div style={{ marginTop: 14, padding: 14, border: "1px solid var(--accent-line)", borderRadius: 8, background: "rgba(185,255,75,0.05)" }}>
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>{FIELD_META[collect].label}</label>
                    <input
                      value={vals[collect]}
                      onChange={(e) => { setVals((v) => ({ ...v, [collect]: e.target.value })); setSaved((s) => ({ ...s, [collect]: false })); }}
                      placeholder={FIELD_META[collect].placeholder}
                      style={{ width: "100%", padding: "10px 12px", fontSize: 14, background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: 6, color: "var(--text)", fontFamily: collect === "railwayToken" ? "var(--font-mono)" : undefined }}
                    />
                    <button
                      onClick={() => saveField(i, collect)}
                      disabled={pending || !vals[collect].trim()}
                      style={{ marginTop: 10, padding: "10px 20px", fontSize: 14, fontWeight: 600, background: "var(--accent)", color: "#000", border: "none", borderRadius: 6, cursor: pending || !vals[collect].trim() ? "default" : "pointer", opacity: pending || !vals[collect].trim() ? 0.5 : 1 }}
                    >
                      {pending ? "…" : saved[collect] ? "Збережено ✓ — далі →" : "Зберегти і далі →"}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => advance(i)}
                    style={{ marginTop: 14, padding: "10px 20px", fontSize: 14, fontWeight: 600, background: "var(--accent)", color: "#000", border: "none", borderRadius: 6, cursor: "pointer" }}
                  >
                    {i + 1 < steps.length ? "Виконано →" : "Готово ✓"}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {err && <p style={{ color: "#ff5b5b", fontSize: 13 }}>{err}</p>}

      {allDone && (
        <div style={{ textAlign: "center", padding: "24px 18px", border: "1px solid var(--accent-line)", borderRadius: 10, background: "rgba(185,255,75,0.06)", marginTop: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--accent)" }}>Усе готово! 🎉</div>
          <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 8 }}>Дякую — я отримаю дані і почну роботу над вашим проєктом.</p>
        </div>
      )}
    </div>
  );
}
