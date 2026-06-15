"use client";

import { useState, useRef, useTransition } from "react";
import { saveGuide, removeGuide, uploadGuideImage } from "./actions";
import { ui } from "../../ui-styles";

type G = { id: number; slug: string; title: string; body: string; ord: number; title_ru: string | null; body_ru: string | null; title_en: string | null; body_en: string | null };

type Loc = "uk" | "ru" | "en";
const LOCS: { k: Loc; label: string }[] = [{ k: "uk", label: "UA" }, { k: "ru", label: "RU" }, { k: "en", label: "EN" }];

function Editor({ g, isNew }: { g?: G; isNew?: boolean }) {
  const [loc, setLoc] = useState<Loc>("uk");
  const [titles, setTitles] = useState<Record<Loc, string>>({ uk: g?.title ?? "", ru: g?.title_ru ?? "", en: g?.title_en ?? "" });
  const [bodies, setBodies] = useState<Record<Loc, string>>({ uk: g?.body ?? "", ru: g?.body_ru ?? "", en: g?.body_en ?? "" });
  const [slug, setSlug] = useState(g?.slug ?? "");
  const [ord, setOrd] = useState(String(g?.ord ?? 100));
  const [msg, setMsg] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  if (removed) return null;

  const title = titles[loc];
  const body = bodies[loc];
  const setTitle = (v: string) => setTitles((t) => ({ ...t, [loc]: v }));
  const setBody = (fn: string | ((b: string) => string)) => setBodies((b) => ({ ...b, [loc]: typeof fn === "function" ? fn(b[loc]) : fn }));

  function insertAtCursor(text: string) {
    const ta = bodyRef.current;
    const pos = ta ? ta.selectionStart : body.length;
    setBody((b) => b.slice(0, pos) + text + b.slice(pos));
    setTimeout(() => { if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = pos + text.length; } }, 0);
  }
  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    e.preventDefault();
    setMsg("Загрузка картинки…");
    imgs.forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        const [meta, data] = String(reader.result).split(",");
        const mime = meta.slice(5, meta.indexOf(";"));
        start(async () => {
          const r = await uploadGuideImage(mime, data);
          if (r.url) { insertAtCursor(`\n![](${r.url})\n`); setMsg("Картинка вставлена ✓"); }
          else setMsg(r.error || "Ошибка загрузки");
        });
      };
      reader.readAsDataURL(f);
    });
  }

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveGuide({
        id: g?.id, slug: isNew ? slug : undefined, title: titles.uk, body: bodies.uk, ord: Number(ord) || 100,
        loc: { title_ru: titles.ru, body_ru: bodies.ru, title_en: titles.en, body_en: bodies.en },
      });
      if (r.error) setMsg(r.error);
      else { setMsg("Сохранено ✓"); if (isNew) { setTitles({ uk: "", ru: "", en: "" }); setBodies({ uk: "", ru: "", en: "" }); setSlug(""); setOrd("100"); } }
    });
  }

  return (
    <div style={{ ...ui.card, padding: 14, marginTop: 10 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {LOCS.map(({ k, label }) => (
          <button key={k} onClick={() => setLoc(k)} title={k === "uk" ? "основна" : "переклад (fallback на UA)"}
            style={{ ...ui.monoLabel, padding: "4px 10px", borderRadius: 2, cursor: "pointer", border: "1px solid " + (loc === k ? "var(--accent)" : "var(--border-2)"), background: loc === k ? "var(--accent)" : "transparent", color: loc === k ? "#000" : "var(--muted)" }}>
            {label}{k !== "uk" && (titles[k] || bodies[k]) ? " •" : ""}
          </button>
        ))}
        <span style={{ ...ui.monoLabel, color: "var(--muted)", alignSelf: "center", marginLeft: 4 }}>{loc === "uk" ? "основна локаль" : "переклад"}</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={loc === "uk" ? "Заголовок гайда (UA)" : `Заголовок (${loc.toUpperCase()})`} style={{ ...ui.input, flex: 1, minWidth: 220, fontWeight: 600 }} />
        {isNew && <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug (опц.)" style={{ ...ui.input, width: 140 }} />}
        <input value={ord} onChange={(e) => setOrd(e.target.value)} placeholder="№" title="Порядок" style={{ ...ui.input, width: 64 }} />
      </div>
      <textarea ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} onPaste={onPaste} placeholder="Текст инструкции (markdown). Вставьте скрин из буфера — Ctrl+V." rows={6} style={{ ...ui.input, width: "100%", resize: "vertical", marginTop: 8, fontSize: 13, lineHeight: 1.5 }} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
        <button onClick={save} disabled={pending || !titles.uk.trim()} style={{ ...ui.btnAccent, opacity: pending || !titles.uk.trim() ? 0.5 : 1 }}>{pending ? "…" : isNew ? "Создать гайд" : "Сохранить"}</button>
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
