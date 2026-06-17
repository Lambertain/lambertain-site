"use client";

import { useState, useTransition } from "react";
import { newBrief, linkBrief } from "./actions";
import { ui } from "../../ui-styles";

type Proj = { key: string; name: string };
type BriefRow = { id: number; token: string; link: string; label: string | null; type: string | null; status: string; payload: Record<string, unknown> | null; projectKey: string | null; created: string; tg: string | null };

function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard?.writeText(url).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}
      style={{ ...ui.monoLabel, textTransform: "none", color: "var(--accent)", background: "transparent", border: "1px solid var(--accent-line)", padding: "4px 10px", cursor: "pointer", borderRadius: 2 }}
    >
      {done ? "Скопировано ✓" : "Копировать ссылку"}
    </button>
  );
}

function Row({ b, projects }: { b: BriefRow; projects: Proj[] }) {
  const [open, setOpen] = useState(false);
  const [proj, setProj] = useState(b.projectKey ?? "");
  const [pending, start] = useTransition();
  const url = b.link;
  const submitted = b.status === "submitted";
  const mode = (b.payload?._mode as string | undefined) || null; // как заполнили: form | chat (A/B)
  return (
    <div style={{ ...ui.card, padding: 14, marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 15 }}>{b.label || "—"}</strong>
        {b.tg && <span style={{ ...ui.monoLabel, textTransform: "none", color: "#e8b339" }}>✈ {b.tg}</span>}
        <span style={{ ...ui.monoLabel, color: submitted ? "var(--accent)" : "var(--muted)" }}>{submitted ? "заполнен" : "ожидает"}</span>
        {b.type && <span style={{ ...ui.monoLabel, textTransform: "none", padding: "1px 8px", border: "1px solid var(--border-2)", borderRadius: 3 }}>{b.type}</span>}
        {mode && <span style={{ ...ui.monoLabel, textTransform: "none", padding: "1px 8px", border: "1px solid var(--accent-line)", color: "var(--accent)", borderRadius: 3 }}>{mode === "chat" ? "чат" : "форма"}</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <CopyLink url={url} />
          {submitted && b.payload && <button onClick={() => setOpen((v) => !v)} style={ui.btn}>{open ? "Скрыть" : "Показать ответы"}</button>}
        </span>
      </div>
      {/* привязка к проекту */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <span style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)" }}>Проект:</span>
        <select value={proj} onChange={(e) => setProj(e.target.value)} style={{ ...ui.input, width: "auto", padding: "6px 10px" }}>
          <option value="">— не привязан —</option>
          {projects.map((p) => <option key={p.key} value={p.key}>{p.name} ({p.key})</option>)}
        </select>
        {proj !== (b.projectKey ?? "") && (
          <button onClick={() => start(() => { linkBrief(b.id, proj); })} disabled={pending} style={{ ...ui.btnAccent, opacity: pending ? 0.5 : 1 }}>{pending ? "…" : "Привязать"}</button>
        )}
      </div>
      {open && b.payload && (
        <pre style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", background: "var(--surface-2)", border: "1px solid var(--border-2)", padding: 12, borderRadius: 4 }}>
          {JSON.stringify(b.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function BriefsPanel({ briefs, projects }: { briefs: BriefRow[]; projects: Proj[] }) {
  const [label, setLabel] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function create() {
    setError(null); setLink(null);
    start(async () => {
      const r = await newBrief(label);
      if (r.error) setError(r.error);
      else if (r.link) { setLink(r.link); setLabel(""); }
    });
  }

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ ...ui.card, padding: 16 }}>
        <div style={ui.monoLabel}>Новый лид</div>
        <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginTop: 6 }}>Имя/контакт лида → получите ссылку на бриф, отправьте лиду.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="напр. Алла, медправо (Telegram @...)" style={{ ...ui.input, flex: 1, minWidth: 220 }} />
          <button onClick={create} disabled={pending || !label.trim()} style={{ ...ui.btnAccent, opacity: pending || !label.trim() ? 0.5 : 1 }}>{pending ? "…" : "Создать бриф"}</button>
        </div>
        {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 10 }}>{error}</p>}
        {link && (
          <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <a href={link} target="_blank" rel="noreferrer" style={{ ...ui.monoLabel, textTransform: "none", color: "var(--accent)" }}>{link}</a>
            <CopyLink url={link} />
          </div>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        {(() => {
          // A/B: сколько заполненных брифов пришло через форму vs чат.
          const done = briefs.filter((b) => b.status === "submitted");
          const chat = done.filter((b) => (b.payload?._mode as string) === "chat").length;
          const form = done.filter((b) => (b.payload?._mode as string) === "form").length;
          return (chat + form) > 0 ? (
            <div style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginBottom: 8 }}>
              A/B заполнений: форма <span style={{ color: "var(--accent)" }}>{form}</span> · чат <span style={{ color: "var(--accent)" }}>{chat}</span>
            </div>
          ) : null;
        })()}
        <div style={ui.monoLabel}>Все брифы · {briefs.length}</div>
        {briefs.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 10 }}>Пока нет.</p>
        ) : (
          briefs.map((b) => <Row key={b.id} b={b} projects={projects} />)
        )}
      </div>
    </div>
  );
}
