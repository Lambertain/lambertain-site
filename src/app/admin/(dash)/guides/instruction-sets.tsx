"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveInstructionSet, removeInstructionSet } from "./actions";
import { ui } from "../../ui-styles";

type GuideOpt = { id: number; title: string };
type SetRow = { id: number; token: string; title: string | null; guideIds: number[] };

export function InstructionSets({ guides, sets, publicBase }: { guides: GuideOpt[]; sets: SetRow[]; publicBase: string }) {
  return (
    <div style={{ marginTop: 44 }}>
      <div style={ui.monoLabel}>Посилання на інструкції</div>
      <h2 style={{ ...ui.h1, fontSize: 22, marginTop: 8 }}>Набори інструкцій</h2>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 10, maxWidth: 640 }}>
        Оберіть потрібні блоки → отримаєте публічне посилання. Надсилайте його лідам чи клієнтам у будь-який месенджер —
        без реєстрації, без портала і без прив&apos;язки до конкретної людини. Той самий набір можна прикріпити до запрошення.
      </p>
      {guides.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 14 }}>Спершу додайте хоча б один гайд (блок) вище.</p>
      ) : (
        <>
          <div style={{ ...ui.monoLabel, marginTop: 18 }}>Новий набір</div>
          <SetEditor guides={guides} publicBase={publicBase} isNew />
          <div style={{ ...ui.monoLabel, marginTop: 24 }}>Створені набори · {sets.length}</div>
          {sets.length === 0
            ? <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 10 }}>Поки немає.</p>
            : sets.map((s) => <SetEditor key={s.id} guides={guides} set={s} publicBase={publicBase} />)}
        </>
      )}
    </div>
  );
}

function SetEditor({ guides, set, isNew, publicBase }: { guides: GuideOpt[]; set?: SetRow; isNew?: boolean; publicBase: string }) {
  const router = useRouter();
  const [title, setTitle] = useState(set?.title ?? "");
  const [selected, setSelected] = useState<number[]>(set?.guideIds ?? []);
  const [token, setToken] = useState<string | null>(set?.token ?? null);
  const [copied, setCopied] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (removed) return null;

  const link = token ? `${publicBase.replace(/\/$/, "")}/i/${token}` : null;
  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveInstructionSet({ id: set?.id, title, guideIds: selected });
      if (r.error) { setMsg(r.error); return; }
      if (r.token) setToken(r.token);
      setMsg("Збережено ✓");
      router.refresh();
      if (isNew) { setTitle(""); setSelected([]); }
    });
  }
  function copy() {
    if (!link) return;
    navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  return (
    <div style={{ ...ui.card, padding: 14, marginTop: 10 }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Назва набору (для себе, необов'язково)" style={{ ...ui.input, fontWeight: 600 }} />
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
          {pending ? "…" : isNew ? "Створити посилання" : "Зберегти"}
        </button>
        {!isNew && set && (
          <button onClick={() => { if (confirm("Видалити набір? Посилання перестане працювати.")) start(async () => { await removeInstructionSet(set.id); setRemoved(true); router.refresh(); }); }}
            style={{ ...ui.monoLabel, color: "#ff5b5b", background: "transparent", border: "1px solid #ff5b5b", padding: "8px 12px", cursor: "pointer", borderRadius: 2 }}>Видалити</button>
        )}
        <span style={{ ...ui.monoLabel, color: "var(--muted)" }}>{selected.length} блок(ів)</span>
        {msg && <span style={{ ...ui.monoLabel, textTransform: "none", color: msg.includes("✓") ? "var(--accent)" : "#ff5b5b" }}>{msg}</span>}
      </div>
      {link && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, flexWrap: "wrap", paddingTop: 12, borderTop: "1px solid var(--border-2)" }}>
          <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontSize: 13, wordBreak: "break-all", textDecoration: "underline" }}>{link}</a>
          <button onClick={copy} style={{ ...ui.monoLabel, color: "var(--text)", background: "transparent", border: "1px solid var(--border-2)", padding: "6px 12px", cursor: "pointer", borderRadius: 2 }}>
            {copied ? "Скопійовано ✓" : "Копіювати"}
          </button>
        </div>
      )}
    </div>
  );
}
