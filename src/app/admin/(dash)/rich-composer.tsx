"use client";

import { forwardRef, useImperativeHandle, useRef, useEffect, type ReactNode } from "react";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

/**
 * WYSIWYG-композер тела задачи/коммента: картинки и файлы вставляются ПО МЕСТУ прямо в поле
 * (contenteditable) — как они будут выглядеть, без текстовых маркеров `![](att:id)` и без отдельной
 * панели предпросмотра. Текст — обычный Markdown (тулбар оборачивает выделение). На выходе:
 *   blocks   — ReqBlock[] с сохранением хронологии (текст → картинка → текст → …) для постановки задачи;
 *   markdown — то же тело строкой с маркерами att:localId (для коммента) + atts с данными вложений.
 * Используется и в создании задачи, и в комментариях (DRY). Server-agnostic, только клиент.
 */

export type RcBlock =
  | { type: "text"; text: string }
  | { type: "image"; mime: string; data: string }
  | { type: "file"; mime: string; data: string; name: string };
export type RcAtt = { localId: string; mime: string; data: string; name: string; image: boolean };
export type RcContent = { blocks: RcBlock[]; markdown: string; atts: RcAtt[]; isEmpty: boolean };

export type RichComposerHandle = {
  getContent: () => RcContent;
  clear: () => void;
  focus: () => void;
};

const SPEECH_LANG: Record<Locale, string> = { uk: "uk-UA", ru: "ru-RU", en: "en-US" };

type Item = { kind: "text"; text: string } | { kind: "att"; id: string };

export const RichComposer = forwardRef<RichComposerHandle, {
  locale: Locale;
  placeholder: string;
  minHeight?: number;
  initialText?: string;
  /** Слот справа в нижней панели (кнопка отправки и т.п.). */
  controls?: ReactNode;
  /** Вызывается при изменении содержимого: пусто ли + текущий plain-текст (для предупреждений/черновика). */
  onChange?: (isEmpty: boolean, text: string) => void;
}>(function RichComposer({ locale, placeholder, minHeight = 160, initialText, controls, onChange }, ref) {
  const edRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastRange = useRef<Range | null>(null);
  const seq = useRef(0);
  const attMap = useRef<Map<string, RcAtt>>(new Map());

  // —— восстановление черновика-текста (картинки в черновик не сохраняем) ——
  useEffect(() => {
    if (initialText && edRef.current && !edRef.current.textContent) {
      edRef.current.textContent = initialText;
    }
    emit(); // выставить data-empty (плейсхолдер) при монтировании
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // —— запоминаем последний диапазон выделения внутри редактора (для вставки после клика по кнопке) ——
  useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && edRef.current?.contains(sel.anchorNode)) {
        lastRange.current = sel.getRangeAt(0).cloneRange();
      }
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  function plainText(): string {
    return (edRef.current?.textContent || "").replace(/​/g, "").trim();
  }
  function isEmpty(): boolean {
    return !plainText() && !edRef.current?.querySelector("[data-att]");
  }
  function emit() {
    const empty = isEmpty();
    if (edRef.current) edRef.current.dataset.empty = empty ? "true" : "false";
    onChange?.(empty, plainText());
  }

  /** Текущий рабочий Range: активное выделение в редакторе, либо последнее, либо конец поля. */
  function workingRange(): Range {
    const ed = edRef.current!;
    const sel = window.getSelection();
    if (sel && sel.rangeCount && ed.contains(sel.anchorNode)) return sel.getRangeAt(0);
    if (lastRange.current && ed.contains(lastRange.current.commonAncestorContainer)) return lastRange.current;
    const r = document.createRange();
    r.selectNodeContents(ed);
    r.collapse(false);
    return r;
  }

  function placeCaretAfter(node: Node) {
    const sel = window.getSelection();
    if (!sel) return;
    const r = document.createRange();
    r.setStartAfter(node);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    lastRange.current = r.cloneRange();
  }

  function insertNodeAtCaret(node: Node) {
    edRef.current?.focus();
    const r = workingRange();
    r.deleteContents();
    r.insertNode(node);
    placeCaretAfter(node);
    // DEV-16: после вставки картинки/файла (element-узел) прокрутить редактор к ней, чтобы видеть последнюю вставку без ручного скролла.
    if (node.nodeType === 1) requestAnimationFrame(() => (node as HTMLElement).scrollIntoView?.({ block: "nearest" }));
  }

  /** Вставить текст в позицию курсора (голос/таблица/ссылка). */
  function insertText(s: string) {
    const tn = document.createTextNode(s);
    insertNodeAtCaret(tn);
    emit();
  }

  // —— тулбар форматирования: оборачивает выделение Markdown-разметкой ——
  function surround(before: string, after: string, placeholder: string) {
    edRef.current?.focus();
    const r = workingRange();
    const selected = r.toString() || placeholder;
    r.deleteContents();
    const tn = document.createTextNode(before + selected + after);
    r.insertNode(tn);
    placeCaretAfter(tn);
    emit();
  }
  function linePrefix(prefix: string | ((line: string, i: number) => string)) {
    edRef.current?.focus();
    const r = workingRange();
    const block = r.toString() || "";
    const out = block.split("\n").map((l, i) => (typeof prefix === "function" ? prefix(l, i + 1) : prefix + l)).join("\n");
    r.deleteContents();
    const tn = document.createTextNode(out);
    r.insertNode(tn);
    placeCaretAfter(tn);
    emit();
  }
  function insertLink() {
    const r = workingRange();
    const txt = r.toString() || t(locale, "md.linkText");
    insertText(`[${txt}](url)`);
  }

  // —— вложения: картинка инлайн, файл — чип; оба contenteditable=false с кнопкой удаления ——
  function attachImage(att: RcAtt) {
    const wrap = document.createElement("span");
    wrap.setAttribute("data-att", att.localId);
    wrap.setAttribute("contenteditable", "false");
    wrap.style.cssText = "position:relative;display:block;margin:8px 0;max-width:320px";
    const img = document.createElement("img");
    img.src = `data:${att.mime};base64,${att.data}`;
    img.alt = att.name;
    img.style.cssText = "max-width:100%;max-height:240px;border-radius:8px;border:1px solid var(--border-2);display:block";
    const del = document.createElement("button");
    del.type = "button";
    del.setAttribute("data-del", "1");
    del.textContent = "×";
    del.style.cssText = "position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,0.6);color:#fff;border:none;cursor:pointer;font-size:15px;line-height:24px;padding:0";
    wrap.append(img, del);
    insertBlock(wrap, att.localId, att);
  }
  function attachFile(att: RcAtt) {
    const chip = document.createElement("span");
    chip.setAttribute("data-att", att.localId);
    chip.setAttribute("contenteditable", "false");
    chip.style.cssText = "display:inline-flex;align-items:center;gap:6px;margin:4px 0;padding:6px 10px;border:1px solid var(--border-2);border-radius:6px;background:var(--surface-2);max-width:100%";
    const label = document.createElement("span");
    label.textContent = "📎 " + att.name.slice(0, 32);
    label.style.cssText = "font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    const del = document.createElement("button");
    del.type = "button";
    del.setAttribute("data-del", "1");
    del.textContent = "×";
    del.style.cssText = "background:transparent;border:none;color:var(--muted);cursor:pointer;font-size:14px;padding:0;line-height:1";
    chip.append(label, del);
    insertBlock(chip, att.localId, att);
  }
  /** Вставить блок-вложение и оставить курсор на новой строке после него. */
  function insertBlock(el: HTMLElement, localId: string, att: RcAtt) {
    attMap.current.set(localId, att);
    edRef.current?.focus();
    const r = workingRange();
    r.deleteContents();
    r.insertNode(el);
    // пустая строка после вложения, чтобы можно было продолжать печатать
    const br = document.createElement("br");
    if (el.parentNode) el.parentNode.insertBefore(br, el.nextSibling);
    placeCaretAfter(br);
    emit();
  }

  function addFiles(files: FileList | File[] | null) {
    if (!files) return;
    Array.from(files).forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        const [meta, data] = String(reader.result).split(",");
        const mime = meta.slice(5, meta.indexOf(";"));
        const image = mime.startsWith("image/");
        const localId = `a${++seq.current}`;
        const name = f.name || (image ? "image.png" : "file");
        const att: RcAtt = { localId, mime, data, name, image };
        if (image) attachImage(att); else attachFile(att);
      };
      reader.readAsDataURL(f);
    });
  }

  function onEditorClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    const del = target.closest("[data-del]");
    if (del) {
      e.preventDefault();
      const wrap = del.closest("[data-att]");
      if (wrap) {
        const id = wrap.getAttribute("data-att");
        if (id) attMap.current.delete(id);
        wrap.remove();
        emit();
      }
    }
  }
  function onPaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.files);
    if (files.length) { e.preventDefault(); addFiles(files); return; }
    // вставляем как ПЛОСКИЙ текст (без чужого HTML-форматирования)
    const text = e.clipboardData.getData("text/plain");
    if (text) { e.preventDefault(); insertText(text); }
  }
  // DEV-14: Enter ВСЕГДА вставляет перенос строки (в т.ч. когда курсор сразу после картинки — там дефолтный
  // contentEditable «залипает» и Enter не опускал строку). Отправка — только кнопкой (Enter не отправляет).
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && !(e.nativeEvent as { isComposing?: boolean }).isComposing) {
      e.preventDefault();
      insertText("\n");
    }
  }
  function onDrop(e: React.DragEvent) {
    const files = Array.from(e.dataTransfer.files);
    if (files.length) { e.preventDefault(); addFiles(files); }
  }
  function onDragOver(e: React.DragEvent) { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }

  // —— голосовой ввод (Web Speech API): дописывает распознанный текст в позицию курсора ——
  const recRef = useRef<unknown>(null);
  const recordingRef = useRef(false);
  const committedRef = useRef("");
  const sessionFinalRef = useRef("");
  const manualStopRef = useRef(false);
  const interimRef = useRef<Text | null>(null);
  const recBtnRef = useRef<HTMLButtonElement>(null);

  function setRecUI(on: boolean) {
    recordingRef.current = on;
    const b = recBtnRef.current;
    if (b) {
      b.style.background = on ? "#ff5b5b" : "transparent";
      b.style.borderColor = on ? "#ff5b5b" : "var(--border-2)";
      b.style.color = on ? "#fff" : "var(--muted)";
    }
  }
  function startVoice() {
    // @ts-expect-error — Web Speech API
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    committedRef.current = "";
    sessionFinalRef.current = "";
    manualStopRef.current = false;
    edRef.current?.focus();
    const node = document.createTextNode("");
    insertNodeAtCaret(node);
    interimRef.current = node;
    setRecUI(true);
    spawn(SR);
  }
  // @ts-expect-error — SR конструктор
  function spawn(SR) {
    const rec = new SR();
    rec.lang = SPEECH_LANG[locale];
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e: { results: ArrayLike<{ isFinal: boolean } & ArrayLike<{ transcript: string }>> }) => {
      let fin = "", interim = "";
      for (const r of Array.from(e.results)) {
        if ((r as unknown as { isFinal: boolean }).isFinal) fin += r[0].transcript;
        else interim += r[0].transcript;
      }
      sessionFinalRef.current = fin;
      if (interimRef.current) interimRef.current.nodeValue = committedRef.current + fin + interim;
      emit();
    };
    rec.onend = () => {
      committedRef.current += sessionFinalRef.current;
      sessionFinalRef.current = "";
      if (!manualStopRef.current) { try { rec.start(); } catch { spawn(SR); } }
      else { interimRef.current = null; setRecUI(false); }
    };
    rec.onerror = () => { /* onend перезапустит/завершит */ };
    recRef.current = rec;
    rec.start();
  }
  function stopVoice() {
    manualStopRef.current = true;
    (recRef.current as { stop: () => void } | null)?.stop();
    interimRef.current = null;
    setRecUI(false);
  }
  function toggleVoice() { if (recordingRef.current) stopVoice(); else startVoice(); }

  // —— сериализация: обход DOM редактора с сохранением порядка ——
  function serialize(): RcContent {
    const items: Item[] = [];
    const pushText = (s: string) => {
      if (!s) return;
      const last = items[items.length - 1];
      if (last && last.kind === "text") last.text += s;
      else items.push({ kind: "text", text: s });
    };
    const walk = (node: Node) => {
      for (const ch of Array.from(node.childNodes)) {
        if (ch.nodeType === Node.TEXT_NODE) { pushText((ch.nodeValue || "").replace(/​/g, "")); continue; }
        if (ch.nodeType !== Node.ELEMENT_NODE) continue;
        const el = ch as HTMLElement;
        if (el.hasAttribute("data-att")) { items.push({ kind: "att", id: el.getAttribute("data-att")! }); continue; }
        if (el.tagName === "BR") { pushText("\n"); continue; }
        // блочные элементы (DIV/P от contenteditable) — рекурсия + перевод строки
        walk(el);
        pushText("\n");
      }
    };
    if (edRef.current) walk(edRef.current);

    const blocks: RcBlock[] = [];
    const atts: RcAtt[] = [];
    const mdParts: string[] = [];
    for (const it of items) {
      if (it.kind === "text") {
        const txt = it.text.replace(/\n{3,}/g, "\n\n").trim();
        if (txt) { blocks.push({ type: "text", text: txt }); mdParts.push(txt); }
      } else {
        const att = attMap.current.get(it.id);
        if (!att) continue;
        atts.push(att);
        if (att.image) { blocks.push({ type: "image", mime: att.mime, data: att.data }); mdParts.push(`![${att.name}](att:${att.localId})`); }
        else { blocks.push({ type: "file", mime: att.mime, data: att.data, name: att.name }); mdParts.push(`[${att.name}](att:${att.localId})`); }
      }
    }
    return { blocks, atts, markdown: mdParts.join("\n\n"), isEmpty: blocks.length === 0 };
  }

  useImperativeHandle(ref, () => ({
    getContent: serialize,
    clear: () => { if (edRef.current) edRef.current.innerHTML = ""; attMap.current.clear(); emit(); },
    focus: () => edRef.current?.focus(),
  }));

  const tbBtn: React.CSSProperties = {
    ...ui.monoLabel, textTransform: "none", minWidth: 28, height: 28, padding: "0 7px",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    background: "transparent", border: "1px solid var(--border-2)", color: "var(--muted)", cursor: "pointer", borderRadius: 3,
  };
  const iconBtn: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, flexShrink: 0, background: "transparent", border: "1px solid var(--border-2)", color: "var(--muted)", cursor: "pointer", borderRadius: 2 };
  const noBlur = (e: React.MouseEvent) => e.preventDefault(); // не терять выделение в редакторе при клике по кнопке

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* тулбар форматирования */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", padding: "8px 12px 0" }}>
        <button type="button" onMouseDown={noBlur} onClick={() => surround("**", "**", t(locale, "md.bold"))} title={t(locale, "md.bold")} style={{ ...tbBtn, fontWeight: 700 }}>B</button>
        <button type="button" onMouseDown={noBlur} onClick={() => surround("*", "*", t(locale, "md.italic"))} title={t(locale, "md.italic")} style={{ ...tbBtn, fontStyle: "italic" }}>I</button>
        <button type="button" onMouseDown={noBlur} onClick={() => surround("`", "`", "code")} title={t(locale, "md.code")} style={{ ...tbBtn, fontFamily: "var(--font-mono)" }}>{"</>"}</button>
        <span style={{ width: 1, height: 18, background: "var(--border-2)", margin: "0 2px" }} />
        <button type="button" onMouseDown={noBlur} onClick={() => linePrefix("## ")} title={t(locale, "md.heading")} style={tbBtn}>H</button>
        <button type="button" onMouseDown={noBlur} onClick={() => linePrefix("- ")} title={t(locale, "md.bullet")} style={tbBtn} aria-label={t(locale, "md.bullet")}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="8" y1="18" x2="20" y2="18"/><circle cx="3.5" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r="1.2" fill="currentColor" stroke="none"/></svg>
        </button>
        <button type="button" onMouseDown={noBlur} onClick={() => linePrefix((l, i) => `${i}. ${l}`)} title={t(locale, "md.numbered")} style={tbBtn}>1.</button>
        <button type="button" onMouseDown={noBlur} onClick={insertLink} title={t(locale, "md.link")} style={tbBtn} aria-label={t(locale, "md.link")}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        </button>
      </div>

      {/* редактор: текст + картинки/файлы инлайн */}
      <div
        ref={edRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={emit}
        onClick={onEditorClick}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={onDragOver}
        className="rich-composer"
        style={{ flex: 1, minHeight, overflowY: "auto", background: "transparent", color: "var(--text)", fontSize: 15, lineHeight: 1.6, padding: "12px 16px", outline: "none", fontFamily: "var(--font-body), system-ui, sans-serif", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
      />

      {/* нижняя панель: скрепка, микрофон, [слот управления] */}
      <div style={{ display: "flex", gap: 8, padding: 10, borderTop: "1px solid var(--border)", alignItems: "center" }}>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <button type="button" onMouseDown={noBlur} onClick={() => fileRef.current?.click()} title={t(locale, "chat.attachFile")} style={iconBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
        </button>
        <button ref={recBtnRef} type="button" onMouseDown={noBlur} onClick={toggleVoice} title={t(locale, "chat.voice")} style={iconBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
        </button>
        {controls && <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>{controls}</span>}
      </div>
    </div>
  );
});
