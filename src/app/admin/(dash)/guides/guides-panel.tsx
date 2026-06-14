"use client";

import { useState, useTransition } from "react";
import { saveGuide, removeGuide } from "./actions";
import { ui } from "../../ui-styles";

type G = { id: number; slug: string; title: string; body: string; ord: number };

function Editor({ g, isNew }: { g?: G; isNew?: boolean }) {
  const [title, setTitle] = useState(g?.title ?? "");
  const [slug, setSlug] = useState(g?.slug ?? "");
  const [ord, setOrd] = useState(String(g?.ord ?? 100));
  const [body, setBody] = useState(g?.body ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  if (removed) return null;

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveGuide({ id: g?.id, slug: isNew ? slug : undefined, title, body, ord: Number(ord) || 100 });
      if (r.error) setMsg(r.error);
      else { setMsg("Сохранено ✓"); if (isNew) { setTitle(""); setSlug(""); setBody(""); setOrd("100"); } }
    });
  }

  return (
    <div style={{ ...ui.card, padding: 14, marginTop: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Заголовок гайда" style={{ ...ui.input, flex: 1, minWidth: 220, fontWeight: 600 }} />
        {isNew && <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug (опц.)" style={{ ...ui.input, width: 140 }} />}
        <input value={ord} onChange={(e) => setOrd(e.target.value)} placeholder="№" title="Порядок" style={{ ...ui.input, width: 64 }} />
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Текст инструкции (markdown)" rows={6} style={{ ...ui.input, width: "100%", resize: "vertical", marginTop: 8, fontSize: 13, lineHeight: 1.5 }} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
        <button onClick={save} disabled={pending || !title.trim()} style={{ ...ui.btnAccent, opacity: pending || !title.trim() ? 0.5 : 1 }}>{pending ? "…" : isNew ? "Создать гайд" : "Сохранить"}</button>
        {!isNew && g && (confirm ? (
          <>
            <span style={{ ...ui.monoLabel, textTransform: "none", color: "#ff5b5b" }}>Удалить?</span>
            <button onClick={() => start(async () => { await removeGuide(g.id); setRemoved(true); })} style={{ ...ui.monoLabel, color: "#fff", background: "#ff5b5b", border: "none", padding: "6px 12px", cursor: "pointer", borderRadius: 2 }}>Да</button>
            <button onClick={() => setConfirm(false)} style={ui.btn}>Нет</button>
          </>
        ) : (
          <button onClick={() => setConfirm(true)} style={{ ...ui.monoLabel, color: "#ff5b5b", background: "transparent", border: "1px solid #ff5b5b", padding: "6px 12px", cursor: "pointer", borderRadius: 2 }}>Удалить</button>
        ))}
        {!isNew && g && <span style={{ ...ui.monoLabel, color: "var(--muted)" }}>slug: {g.slug}</span>}
        {msg && <span style={{ ...ui.monoLabel, textTransform: "none", color: msg.includes("✓") ? "var(--accent)" : "#ff5b5b" }}>{msg}</span>}
      </div>
    </div>
  );
}

export function GuidesPanel({ guides }: { guides: G[] }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={ui.monoLabel}>Новый гайд</div>
      <Editor isNew />
      <div style={{ ...ui.monoLabel, marginTop: 24 }}>Библиотека · {guides.length}</div>
      {guides.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 10 }}>Пока пусто.</p>
      ) : (
        guides.map((g) => <Editor key={g.id} g={g} />)
      )}
    </div>
  );
}
