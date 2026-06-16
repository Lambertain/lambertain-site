"use client";

import { useState, type RefObject } from "react";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

/**
 * Панель форматирования над textarea: оборачивает выделение в Markdown-разметку
 * (жирный/курсив/код/заголовок/списки/ссылка) и вставляет GFM-таблицу через диалог.
 * Переиспользуется в форме создания задачи и в комментариях (DRY).
 * Работает поверх обычного textarea — на выходе чистый Markdown (без сырого HTML / лишних зависимостей).
 */
export function MarkdownToolbar({
  taRef,
  value,
  onChange,
  locale,
}: {
  taRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (v: string) => void;
  locale: Locale;
}) {
  const [tableOpen, setTableOpen] = useState(false);
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);

  /** Поставить выделение в textarea после ре-рендера. */
  function select(start: number, end: number) {
    const ta = taRef.current;
    setTimeout(() => { if (ta) { ta.focus(); ta.selectionStart = start; ta.selectionEnd = end; } }, 0);
  }

  /** Обернуть выделение парой before/after (если выделения нет — вставить плейсхолдер). */
  function surround(before: string, after: string, placeholder: string) {
    const ta = taRef.current;
    const s = ta ? ta.selectionStart : value.length;
    const e = ta ? ta.selectionEnd : value.length;
    const sel = value.slice(s, e) || placeholder;
    onChange(value.slice(0, s) + before + sel + after + value.slice(e));
    select(s + before.length, s + before.length + sel.length);
  }

  /** Префикс к каждой строке выделенного блока (заголовок/списки). prefix может быть функцией (для нумерации). */
  function linePrefix(prefix: string | ((line: string, i: number) => string)) {
    const ta = taRef.current;
    const s = ta ? ta.selectionStart : value.length;
    const e = ta ? ta.selectionEnd : value.length;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    const block = value.slice(lineStart, e) || "";
    const out = block
      .split("\n")
      .map((l, i) => (typeof prefix === "function" ? prefix(l, i + 1) : prefix + l))
      .join("\n");
    onChange(value.slice(0, lineStart) + out + value.slice(e));
    select(lineStart, lineStart + out.length);
  }

  function insertLink() {
    const ta = taRef.current;
    const s = ta ? ta.selectionStart : value.length;
    const e = ta ? ta.selectionEnd : value.length;
    const txt = value.slice(s, e) || t(locale, "md.linkText");
    const snippet = `[${txt}](url)`;
    onChange(value.slice(0, s) + snippet + value.slice(e));
    // выделяем «url», чтобы сразу вписать адрес
    select(s + txt.length + 3, s + txt.length + 6);
  }

  function insertTable() {
    const ta = taRef.current;
    const pos = ta ? ta.selectionStart : value.length;
    const head = "| " + Array.from({ length: cols }, (_, i) => `${t(locale, "md.tableHeader")} ${i + 1}`).join(" | ") + " |";
    const sep = "| " + Array.from({ length: cols }, () => "---").join(" | ") + " |";
    const bodyRows = Array.from({ length: rows }, () => "| " + Array.from({ length: cols }, () => "   ").join(" | ") + " |");
    const table = `\n${head}\n${sep}\n${bodyRows.join("\n")}\n`;
    onChange(value.slice(0, pos) + table + value.slice(pos));
    setTableOpen(false);
    select(pos + table.length, pos + table.length);
  }

  const btn: React.CSSProperties = {
    ...ui.monoLabel, textTransform: "none", minWidth: 28, height: 28, padding: "0 7px",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    background: "transparent", border: "1px solid var(--border-2)", color: "var(--muted)", cursor: "pointer", borderRadius: 3,
  };

  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", position: "relative" }}>
      <button type="button" onClick={() => surround("**", "**", t(locale, "md.bold"))} title={t(locale, "md.bold")} style={{ ...btn, fontWeight: 700 }}>B</button>
      <button type="button" onClick={() => surround("*", "*", t(locale, "md.italic"))} title={t(locale, "md.italic")} style={{ ...btn, fontStyle: "italic" }}>I</button>
      <button type="button" onClick={() => surround("`", "`", "code")} title={t(locale, "md.code")} style={{ ...btn, fontFamily: "var(--font-mono)" }}>{"</>"}</button>
      <span style={{ width: 1, height: 18, background: "var(--border-2)", margin: "0 2px" }} />
      <button type="button" onClick={() => linePrefix("## ")} title={t(locale, "md.heading")} style={btn}>H</button>
      <button type="button" onClick={() => linePrefix("- ")} title={t(locale, "md.bullet")} style={btn} aria-label={t(locale, "md.bullet")}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="8" y1="18" x2="20" y2="18"/><circle cx="3.5" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r="1.2" fill="currentColor" stroke="none"/></svg>
      </button>
      <button type="button" onClick={() => linePrefix((l, i) => `${i}. ${l}`)} title={t(locale, "md.numbered")} style={btn}>1.</button>
      <span style={{ width: 1, height: 18, background: "var(--border-2)", margin: "0 2px" }} />
      <button type="button" onClick={insertLink} title={t(locale, "md.link")} style={btn} aria-label={t(locale, "md.link")}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
      </button>
      <button type="button" onClick={() => setTableOpen((v) => !v)} title={t(locale, "md.tableInsert")} style={{ ...btn, color: tableOpen ? "var(--accent)" : "var(--muted)", borderColor: tableOpen ? "var(--accent-line)" : "var(--border-2)" }} aria-label={t(locale, "md.tableInsert")}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="1"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="4" x2="9" y2="20"/><line x1="15" y1="4" x2="15" y2="20"/></svg>
      </button>

      {tableOpen && (
        <div style={{ ...ui.card, position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 40, padding: 12, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ ...ui.monoLabel, textTransform: "none", display: "flex", flexDirection: "column", gap: 4 }}>
            {t(locale, "md.rows")}
            <input type="number" min={1} max={20} value={rows} onChange={(e) => setRows(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} style={{ ...ui.input, width: 64, padding: "5px 8px" }} />
          </label>
          <label style={{ ...ui.monoLabel, textTransform: "none", display: "flex", flexDirection: "column", gap: 4 }}>
            {t(locale, "md.cols")}
            <input type="number" min={1} max={10} value={cols} onChange={(e) => setCols(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} style={{ ...ui.input, width: 64, padding: "5px 8px" }} />
          </label>
          <button type="button" onClick={insertTable} style={ui.btnAccent}>{t(locale, "md.insert")}</button>
        </div>
      )}
    </div>
  );
}
