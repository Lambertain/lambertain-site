"use client";

import { useState, useRef, useTransition } from "react";
import { saveGuide, removeGuide, uploadGuideImage } from "./actions";
import { collectTargets } from "@/lib/project-fields";
import { ui } from "../../ui-styles";

type G = { id: number; slug: string; title: string; body: string; ord: number; title_ru: string | null; body_ru: string | null; title_en: string | null; body_en: string | null; collect_field: string | null };

const COLLECT_OPTS = collectTargets();

// Кнопка панели форматирования; noBlur — не терять выделение в textarea при клике по кнопке.
const TB: React.CSSProperties = { ...ui.monoLabel, textTransform: "none", minWidth: 28, height: 28, padding: "0 7px", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid var(--border-2)", color: "var(--muted)", cursor: "pointer", borderRadius: 3 };
const noBlur = (e: React.MouseEvent) => e.preventDefault();

type Loc = "uk" | "ru" | "en";
const LOCS: { k: Loc; label: string }[] = [{ k: "uk", label: "UA" }, { k: "ru", label: "RU" }, { k: "en", label: "EN" }];

function Editor({ g, isNew }: { g?: G; isNew?: boolean }) {
  const [loc, setLoc] = useState<Loc>("uk");
  const [titles, setTitles] = useState<Record<Loc, string>>({ uk: g?.title ?? "", ru: g?.title_ru ?? "", en: g?.title_en ?? "" });
  const [bodies, setBodies] = useState<Record<Loc, string>>({ uk: g?.body ?? "", ru: g?.body_ru ?? "", en: g?.body_en ?? "" });
  const [slug, setSlug] = useState(g?.slug ?? "");
  const [ord, setOrd] = useState(String(g?.ord ?? 100));
  const [collectField, setCollectField] = useState(g?.collect_field ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileImgRef = useRef<HTMLInputElement>(null);
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
  // Загрузка картинок/файлов (буфер, drag&drop, кнопка) → guide-files → markdown в позицию курсора.
  function uploadInsert(files: FileList | File[] | null) {
    const arr = Array.from(files ?? []);
    if (!arr.length) return;
    setMsg("Загрузка…");
    arr.forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        const [meta, data] = String(reader.result).split(",");
        const mime = meta.slice(5, meta.indexOf(";"));
        start(async () => {
          const r = await uploadGuideImage(mime, data);
          if (r.url) { insertAtCursor(mime.startsWith("image/") ? `\n![](${r.url})\n` : `\n[${f.name || "файл"}](${r.url})\n`); setMsg("Вставлено ✓"); }
          else setMsg(r.error || "Ошибка загрузки");
        });
      };
      reader.readAsDataURL(f);
    });
  }
  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData.files);
    if (!files.length) return;
    e.preventDefault();
    uploadInsert(files);
  }
  function onDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.dataTransfer.files);
    if (files.length) { e.preventDefault(); uploadInsert(files); }
  }

  // — тулбар форматирования (как у поля задачи/коммента): обёртка выделения markdown / префикс строк —
  function withSel(fn: (v: string, s: number, e: number) => { value: string; start: number; end: number }) {
    const ta = bodyRef.current;
    const s = ta ? ta.selectionStart : body.length;
    const e = ta ? ta.selectionEnd : body.length;
    const res = fn(body, s, e);
    setBody(res.value);
    setTimeout(() => { if (ta) { ta.focus(); ta.selectionStart = res.start; ta.selectionEnd = res.end; } }, 0);
  }
  function wrapSel(before: string, after: string, ph: string) {
    withSel((v, s, e) => {
      const sel = v.slice(s, e) || ph;
      return { value: v.slice(0, s) + before + sel + after + v.slice(e), start: s + before.length, end: s + before.length + sel.length };
    });
  }
  function prefixLines(prefix: string | ((line: string, i: number) => string)) {
    withSel((v, s, e) => {
      const ls = v.lastIndexOf("\n", s - 1) + 1;
      const nextNl = v.indexOf("\n", e);
      const le = nextNl === -1 ? v.length : nextNl;
      const out = v.slice(ls, le).split("\n").map((l, i) => (typeof prefix === "function" ? prefix(l, i + 1) : prefix + l)).join("\n");
      return { value: v.slice(0, ls) + out + v.slice(le), start: ls, end: ls + out.length };
    });
  }

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveGuide({
        id: g?.id, slug: isNew ? slug : undefined, title: titles.uk, body: bodies.uk, ord: Number(ord) || 100,
        loc: { title_ru: titles.ru, body_ru: bodies.ru, title_en: titles.en, body_en: bodies.en },
        collectField: collectField || null,
      });
      if (r.error) setMsg(r.error);
      else { setMsg("Сохранено ✓"); if (isNew) { setTitles({ uk: "", ru: "", en: "" }); setBodies({ uk: "", ru: "", en: "" }); setSlug(""); setOrd("100"); setCollectField(""); } }
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
      {/* Панель форматирования (как у поля задачи/коммента): жирный/курсив, размеры-заголовки, списки, ссылка, картинка/файл. */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
        <button type="button" onMouseDown={noBlur} onClick={() => wrapSel("**", "**", "жирный")} title="Жирный" style={{ ...TB, fontWeight: 700 }}>B</button>
        <button type="button" onMouseDown={noBlur} onClick={() => wrapSel("*", "*", "курсив")} title="Курсив" style={{ ...TB, fontStyle: "italic" }}>I</button>
        <button type="button" onMouseDown={noBlur} onClick={() => wrapSel("`", "`", "код")} title="Моноширинный" style={{ ...TB, fontFamily: "var(--font-mono)" }}>{"</>"}</button>
        <span style={{ width: 1, height: 18, background: "var(--border-2)", margin: "0 2px" }} />
        <button type="button" onMouseDown={noBlur} onClick={() => prefixLines("# ")} title="Заголовок 1 (крупный)" style={{ ...TB, fontSize: 15, fontWeight: 700 }}>H1</button>
        <button type="button" onMouseDown={noBlur} onClick={() => prefixLines("## ")} title="Заголовок 2 (средний)" style={{ ...TB, fontSize: 13, fontWeight: 700 }}>H2</button>
        <button type="button" onMouseDown={noBlur} onClick={() => prefixLines("### ")} title="Заголовок 3 (мелкий)" style={{ ...TB, fontSize: 11, fontWeight: 700 }}>H3</button>
        <span style={{ width: 1, height: 18, background: "var(--border-2)", margin: "0 2px" }} />
        <button type="button" onMouseDown={noBlur} onClick={() => prefixLines("- ")} title="Список" style={TB}>•</button>
        <button type="button" onMouseDown={noBlur} onClick={() => prefixLines((l, i) => `${i}. ${l}`)} title="Нумерованный список" style={TB}>1.</button>
        <button type="button" onMouseDown={noBlur} onClick={() => wrapSel("[", "](url)", "текст ссылки")} title="Ссылка" style={TB}>🔗</button>
        <span style={{ width: 1, height: 18, background: "var(--border-2)", margin: "0 2px" }} />
        <input ref={fileImgRef} type="file" multiple hidden onChange={(e) => { uploadInsert(e.target.files); e.target.value = ""; }} />
        <button type="button" onMouseDown={noBlur} onClick={() => fileImgRef.current?.click()} title="Картинка / файл" style={TB}>🖼</button>
      </div>
      <textarea ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} onPaste={onPaste} onDrop={onDrop} onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }} placeholder="Текст инструкции (markdown). Жирный/размеры/ссылки — кнопками выше. Скрин — Ctrl+V, вставить или перетащить файл." rows={7} style={{ ...ui.input, width: "100%", resize: "vertical", marginTop: 8, fontSize: 13, lineHeight: 1.5 }} />
      {/* Сбор данных: если задано — под гайдом у клиента появится поле, введённое значение уйдёт в настройки проекта. */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
        <span style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)" }}>Собирать данные у клиента:</span>
        <select value={collectField} onChange={(e) => setCollectField(e.target.value)} style={{ ...ui.input, width: "auto", minWidth: 240 }}>
          <option value="">— не собирать</option>
          {COLLECT_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label.ru}</option>)}
        </select>
      </div>
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
