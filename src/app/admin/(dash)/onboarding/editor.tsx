"use client";

import { useRef, useState, useTransition } from "react";
import { saveOnboardingSteps, uploadOnboardingImage } from "./actions";
import type { OnboardingStep } from "@/lib/db";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../ui-styles";

export function OnboardingEditor({ initial, publicUrl, locale }: { initial: OnboardingStep[]; publicUrl: string; locale: Locale }) {
  const [steps, setSteps] = useState<OnboardingStep[]>(initial.length ? initial : [{ title: "", body: "" }]);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const bodyRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);

  function patch(i: number, p: Partial<OnboardingStep>) {
    setSteps((s) => s.map((st, j) => (j === i ? { ...st, ...p } : st)));
    setSaved(false);
  }
  function addStep() {
    setSteps((s) => [...s, { title: "", body: "" }]);
    setSaved(false);
  }
  function removeStep(i: number) {
    setSteps((s) => s.filter((_, j) => j !== i));
    setSaved(false);
  }
  function move(i: number, dir: -1 | 1) {
    setSteps((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const c = [...s];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
    setSaved(false);
  }

  function insertImage(i: number, files: FileList | null) {
    if (!files || !files[0]) return;
    const f = files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const [meta, data] = String(reader.result).split(",");
      const mime = meta.slice(5, meta.indexOf(";"));
      start(async () => {
        const res = await uploadOnboardingImage(mime, data);
        if (res.error) { setError(res.error); return; }
        const md = `\n\n![](${res.url})\n\n`;
        const ta = bodyRefs.current[i];
        const cur = steps[i].body;
        const pos = ta ? ta.selectionStart : cur.length;
        patch(i, { body: cur.slice(0, pos) + md + cur.slice(pos) });
      });
    };
    reader.readAsDataURL(f);
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await saveOnboardingSteps(steps);
      if (res.error) setError(res.error);
      else setSaved(true);
    });
  }

  function copyLink() {
    navigator.clipboard?.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18, maxWidth: 760 }}>
      {/* публичная ссылка */}
      <div style={{ ...ui.card, padding: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={ui.monoLabel}>{t(locale, "onb.publicLink")}:</span>
        <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={{ ...ui.monoLabel, color: "var(--accent)", textTransform: "none", textDecoration: "none" }}>{publicUrl}</a>
        <button onClick={copyLink} style={{ ...ui.monoLabel, color: "var(--muted)", background: "transparent", border: "1px solid var(--border-2)", padding: "5px 10px", cursor: "pointer", borderRadius: 2, marginLeft: "auto" }}>
          {copied ? t(locale, "onb.copied") : t(locale, "onb.copy")}
        </button>
      </div>

      {steps.map((st, i) => (
        <div key={i} style={{ ...ui.card, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{t(locale, "onb.step")} {i + 1}</span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button onClick={() => move(i, -1)} disabled={i === 0} title="↑" style={iconBtn(i === 0)}>↑</button>
              <button onClick={() => move(i, 1)} disabled={i === steps.length - 1} title="↓" style={iconBtn(i === steps.length - 1)}>↓</button>
              <button onClick={() => removeStep(i)} title={t(locale, "onb.removeStep")} style={{ ...iconBtn(false), color: "#ff5b5b", borderColor: "#ff5b5b" }}>✕</button>
            </div>
          </div>
          <input
            value={st.title}
            onChange={(e) => patch(i, { title: e.target.value })}
            placeholder={t(locale, "onb.titlePh")}
            style={{ ...ui.input, width: "100%", fontWeight: 600 }}
          />
          <textarea
            ref={(el) => { bodyRefs.current[i] = el; }}
            value={st.body}
            onChange={(e) => patch(i, { body: e.target.value })}
            placeholder={t(locale, "onb.bodyPh")}
            rows={Math.max(5, st.body.split("\n").length + 1)}
            style={{ ...ui.input, width: "100%", marginTop: 8, resize: "vertical", lineHeight: 1.5, fontFamily: "var(--font-mono)", fontSize: 13 }}
          />
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <input ref={(el) => { fileRefs.current[i] = el; }} type="file" accept="image/*" hidden onChange={(e) => { insertImage(i, e.target.files); e.target.value = ""; }} />
            <button onClick={() => fileRefs.current[i]?.click()} style={{ ...ui.monoLabel, color: "var(--muted)", background: "transparent", border: "1px solid var(--border-2)", padding: "6px 12px", cursor: "pointer", borderRadius: 2, display: "inline-flex", alignItems: "center", gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
              {t(locale, "onb.insertImage")}
            </button>
            <label style={{ ...ui.monoLabel, textTransform: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
              {t(locale, "onb.collect")}:
              <select
                value={st.collect ?? ""}
                onChange={(e) => patch(i, { collect: (e.target.value || undefined) as OnboardingStep["collect"] })}
                style={{ ...ui.input, width: "auto", padding: "5px 8px" }}
              >
                <option value="">{t(locale, "onb.collectNone")}</option>
                <option value="clientGit">{t(locale, "onb.collectRepo")}</option>
                <option value="railwayToken">{t(locale, "onb.collectToken")}</option>
              </select>
            </label>
          </div>
        </div>
      ))}

      <button onClick={addStep} style={{ ...ui.monoLabel, color: "var(--muted)", background: "transparent", border: "1px dashed var(--border-2)", padding: "10px", cursor: "pointer", borderRadius: 2 }}>
        + {t(locale, "onb.addStep")}
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 14, position: "sticky", bottom: 0, padding: "12px 0", background: "var(--bg)" }}>
        <button onClick={save} disabled={pending} style={{ ...ui.btnAccent, opacity: pending ? 0.5 : 1 }}>
          {pending ? "…" : t(locale, "onb.save")}
        </button>
        {saved && <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{t(locale, "onb.savedOk")}</span>}
        {error && <span style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none" }}>{error}</span>}
      </div>
    </div>
  );
}

function iconBtn(disabled: boolean): React.CSSProperties {
  return { width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid var(--border-2)", color: disabled ? "var(--border-2)" : "var(--muted)", cursor: disabled ? "default" : "pointer", borderRadius: 2, fontSize: 13 };
}
