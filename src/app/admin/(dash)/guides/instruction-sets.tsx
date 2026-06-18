"use client";

import { useState, useTransition } from "react";
import { saveInstructionSet, removeInstructionSet } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../ui-styles";

type GuideOpt = { id: number; title: string };
type SetRow = { id: number; token: string; title: string | null; guideIds: number[] };

export function InstructionSets({ guides, sets: initial, publicBase, locale }: { guides: GuideOpt[]; sets: SetRow[]; publicBase: string; locale: Locale }) {
  // Список держим в состоянии — чтобы созданный набор сразу появлялся, а удалённый исчезал (без зависимости от refresh).
  const [sets, setSets] = useState<SetRow[]>(initial);

  return (
    <div style={{ marginTop: 44 }}>
      <div style={ui.monoLabel}>{t(locale, "instr.kicker")}</div>
      <h2 style={{ ...ui.h1, fontSize: 22, marginTop: 8 }}>{t(locale, "instr.title")}</h2>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 10, maxWidth: 640 }}>{t(locale, "instr.hint")}</p>
      {guides.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 14 }}>{t(locale, "instr.needGuide")}</p>
      ) : (
        <>
          <div style={{ ...ui.monoLabel, marginTop: 18 }}>{t(locale, "instr.newSet")}</div>
          <SetEditor guides={guides} publicBase={publicBase} locale={locale} isNew onCreated={(s) => setSets((prev) => [s, ...prev])} />
          <div style={{ ...ui.monoLabel, marginTop: 24 }}>{t(locale, "instr.createdSets")} · {sets.length}</div>
          {sets.length === 0
            ? <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 10 }}>{t(locale, "instr.none")}</p>
            : sets.map((s) => <SetEditor key={s.id} guides={guides} set={s} publicBase={publicBase} locale={locale} onRemoved={() => setSets((prev) => prev.filter((x) => x.id !== s.id))} />)}
        </>
      )}
    </div>
  );
}

function SetEditor({ guides, set, isNew, publicBase, locale, onCreated, onRemoved }: { guides: GuideOpt[]; set?: SetRow; isNew?: boolean; publicBase: string; locale: Locale; onCreated?: (s: SetRow) => void; onRemoved?: () => void }) {
  const [title, setTitle] = useState(set?.title ?? "");
  const [selected, setSelected] = useState<number[]>(set?.guideIds ?? []);
  const [token, setToken] = useState<string | null>(set?.token ?? null);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const link = token ? `${publicBase.replace(/\/$/, "")}/i/${token}` : null;
  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveInstructionSet({ id: set?.id, title, guideIds: selected });
      if (r.error) { setMsg(r.error); return; }
      if (isNew && r.id && r.token) {
        // Свежий набор — сразу в список (с названием, ссылкой, кнопкой «удалить»), а форму нового сбрасываем.
        onCreated?.({ id: r.id, token: r.token, title: title.trim() || null, guideIds: selected });
        setTitle(""); setSelected([]); setToken(null); setMsg(null);
        return;
      }
      if (r.token) setToken(r.token);
      setMsg(t(locale, "instr.saved"));
    });
  }
  function remove() {
    if (!set) return;
    if (!confirm(t(locale, "instr.deleteConfirm"))) return;
    start(async () => { await removeInstructionSet(set.id); onRemoved?.(); });
  }
  function copy() {
    if (!link) return;
    navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  return (
    <div style={{ ...ui.card, padding: 14, marginTop: 10 }}>
      {/* У созданного набора показываем его название подписью (если есть). */}
      {!isNew && <div style={{ ...ui.monoLabel, color: "var(--accent)", marginBottom: 8 }}>{set?.title?.trim() || t(locale, "instr.untitled")}</div>}
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t(locale, "instr.namePh")} style={{ ...ui.input, fontWeight: 600 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 6, marginTop: 10 }}>
        {guides.map((g) => {
          const idx = selected.indexOf(g.id);
          const on = idx >= 0;
          return (
            <label key={g.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "7px 10px", border: "1px solid " + (on ? "var(--accent)" : "var(--border-2)"), borderRadius: 2, fontSize: 13 }}>
              <input type="checkbox" checked={on} onChange={() => toggle(g.id)} />
              {on && <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{idx + 1}</span>}
              <span style={{ color: on ? "var(--text)" : "var(--muted)" }}>{g.title}</span>
            </label>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
        <button onClick={save} disabled={pending || !selected.length} style={{ ...ui.btnAccent, opacity: pending || !selected.length ? 0.5 : 1 }}>
          {pending ? "…" : isNew ? t(locale, "instr.create") : t(locale, "projects.save")}
        </button>
        {!isNew && set && (
          <button onClick={remove} style={{ ...ui.monoLabel, color: "#ff5b5b", background: "transparent", border: "1px solid #ff5b5b", padding: "8px 12px", cursor: "pointer", borderRadius: 2 }}>{t(locale, "common.delete")}</button>
        )}
        <span style={{ ...ui.monoLabel, color: "var(--muted)" }}>{selected.length} {t(locale, "instr.blocks")}</span>
        {msg && <span style={{ ...ui.monoLabel, textTransform: "none", color: msg.includes("✓") ? "var(--accent)" : "#ff5b5b" }}>{msg}</span>}
      </div>
      {link && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, flexWrap: "wrap", paddingTop: 12, borderTop: "1px solid var(--border-2)" }}>
          <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontSize: 13, wordBreak: "break-all", textDecoration: "underline" }}>{link}</a>
          <button onClick={copy} style={{ ...ui.monoLabel, color: "var(--text)", background: "transparent", border: "1px solid var(--border-2)", padding: "6px 12px", cursor: "pointer", borderRadius: 2 }}>
            {copied ? t(locale, "common.copied") : t(locale, "common.copy")}
          </button>
        </div>
      )}
    </div>
  );
}
