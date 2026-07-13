"use client";

import { useState, useTransition } from "react";
import { saveSpec, deleteProjectSpec, kickoffFromSpec } from "../../project-actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../../ui-styles";

export type SpecRow = { key: string; title: string; body: string; order?: number; updatedAt?: string };

function SpecCard({ projectKey, spec, locale, onChange, onDelete }: {
  projectKey: string; spec: SpecRow; locale: Locale;
  onChange: (s: SpecRow) => void; onDelete: (key: string) => void;
}) {
  const [edit, setEdit] = useState(false);
  const [title, setTitle] = useState(spec.title);
  const [body, setBody] = useState(spec.body);
  const [confirm, setConfirm] = useState(false);
  const [created, setCreated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pS, startS] = useTransition();
  const [pK, startK] = useTransition();
  const [pD, startD] = useTransition();

  function save() {
    setError(null);
    startS(async () => {
      const r = await saveSpec(projectKey, { key: spec.key, title, body });
      if (r.error) setError(r.error);
      else { onChange({ ...spec, key: r.key || spec.key, title, body }); setEdit(false); }
    });
  }
  function kick() {
    setError(null); setCreated(null);
    startK(async () => {
      const r = await kickoffFromSpec(projectKey, spec.key);
      if (r.error) setError(r.error);
      else setCreated(r.created ?? 0);
    });
  }
  function remove() {
    startD(async () => { const r = await deleteProjectSpec(projectKey, spec.key); if (r.error) setError(r.error); else onDelete(spec.key); });
  }

  return (
    <div style={{ ...ui.card, marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{spec.title}</span>
        <span style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)" }}>{spec.body.length.toLocaleString()} зн.</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={kick} disabled={pK} style={{ ...ui.btnAccent, opacity: pK ? 0.6 : 1 }}>{pK ? t(locale, "kickoff.working") : t(locale, "specs.kickoff")}</button>
          <button onClick={() => setEdit((v) => !v)} style={ui.btn}>{t(locale, "specs.edit")}</button>
        </span>
      </div>

      {created != null && <p style={{ fontSize: 14, color: "var(--accent)", marginTop: 10 }}>{t(locale, "kickoff.created", { n: String(created) })}</p>}
      {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 10 }}>{error}</p>}

      {edit && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t(locale, "specs.titlePh")} style={ui.input} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} placeholder={t(locale, "specs.bodyPh")} style={{ ...ui.input, resize: "vertical", fontSize: 13, lineHeight: 1.5 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button onClick={save} disabled={pS || !title.trim()} style={{ ...ui.btnAccent, opacity: pS || !title.trim() ? 0.5 : 1 }}>{pS ? "…" : t(locale, "projects.save")}</button>
            {confirm ? (
              <>
                <span style={{ ...ui.monoLabel, textTransform: "none", color: "#ff5b5b" }}>{t(locale, "specs.removeConfirm")}</span>
                <button onClick={remove} disabled={pD} style={{ ...ui.monoLabel, color: "#fff", background: "#ff5b5b", border: "none", padding: "6px 12px", cursor: "pointer", borderRadius: 2, opacity: pD ? 0.5 : 1 }}>{pD ? "…" : t(locale, "specs.removeYes")}</button>
                <button onClick={() => setConfirm(false)} style={{ ...ui.monoLabel, color: "var(--muted)", background: "transparent", border: "1px solid var(--border-2)", padding: "6px 12px", cursor: "pointer", borderRadius: 2 }}>{t(locale, "common.cancel")}</button>
              </>
            ) : (
              <button onClick={() => setConfirm(true)} style={{ ...ui.monoLabel, color: "#ff5b5b", background: "transparent", border: "1px solid #ff5b5b", padding: "6px 12px", cursor: "pointer", borderRadius: 2 }}>{t(locale, "common.delete")}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SpecsPanel({ projectKey, locale, initialSpecs }: { projectKey: string; locale: Locale; initialSpecs: SpecRow[] }) {
  const [specs, setSpecs] = useState<SpecRow[]>(initialSpecs);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function upd(s: SpecRow) { setSpecs((cur) => cur.some((x) => x.key === s.key) ? cur.map((x) => (x.key === s.key ? s : x)) : [...cur, s]); }
  function add() {
    setError(null);
    start(async () => {
      const r = await saveSpec(projectKey, { title, body });
      if (r.error) { setError(r.error); return; }
      setSpecs((cur) => [...cur, { key: r.key || title, title, body }]);
      setTitle(""); setBody(""); setAdding(false);
    });
  }

  return (
    <div style={{ ...ui.card, marginTop: 16 }}>
      <div style={{ ...ui.monoLabel, color: "var(--accent)" }}>{t(locale, "specs.title")}</div>
      <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginTop: 6 }}>{t(locale, "specs.hint")}</p>

      {specs.length === 0 && <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginTop: 12 }}>{t(locale, "specs.empty")}</p>}
      {specs.map((s) => (
        <SpecCard key={s.key} projectKey={projectKey} spec={s} locale={locale} onChange={upd} onDelete={(k) => setSpecs((cur) => cur.filter((x) => x.key !== k))} />
      ))}

      {adding ? (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t(locale, "specs.titlePh")} style={ui.input} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} placeholder={t(locale, "specs.bodyPh")} style={{ ...ui.input, resize: "vertical", fontSize: 13, lineHeight: 1.5 }} />
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={add} disabled={pending || !title.trim()} style={{ ...ui.btnAccent, opacity: pending || !title.trim() ? 0.5 : 1 }}>{pending ? "…" : t(locale, "specs.add")}</button>
            <button onClick={() => { setAdding(false); setTitle(""); setBody(""); }} style={ui.btn}>{t(locale, "common.cancel")}</button>
          </div>
          {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none" }}>{error}</p>}
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ ...ui.btn, marginTop: 14 }}>+ {t(locale, "specs.add")}</button>
      )}
    </div>
  );
}
