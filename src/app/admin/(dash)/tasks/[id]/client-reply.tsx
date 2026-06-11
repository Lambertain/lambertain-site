"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { draftClientReply, addTaskComment } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../../ui-styles";

/**
 * Ответ клиенту через ИИ: при открытии ИИ читает задачу, комменты и код и предлагает черновик.
 * Разработчик правит текст напрямую, или даёт ИИ указания «что изменить» и перегенерирует, или публикует.
 */
export function ClientReply({ id, locale }: { id: string; locale: Locale }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [instructions, setInstructions] = useState("");
  const [published, setPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gen, startGen] = useTransition();
  const [pub, startPub] = useTransition();
  const started = useRef(false);

  function generate(instr?: string, prior?: string) {
    setError(null);
    startGen(async () => {
      const r = await draftClientReply(id, instr, prior);
      if (r.error) setError(r.error);
      else { setDraft(r.draft ?? ""); setInstructions(""); }
    });
  }

  // При открытии — сразу предлагаем черновик (один раз).
  useEffect(() => {
    if (open && !started.current) { started.current = true; generate(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function publish() {
    if (!draft?.trim()) return;
    setError(null);
    startPub(async () => {
      const r = await addTaskComment(id, draft, true); // видимый клиенту
      if (r.error) setError(r.error);
      else { setPublished(true); setOpen(false); setDraft(null); started.current = false; }
    });
  }
  function close() {
    setOpen(false); setDraft(null); setInstructions(""); setError(null); started.current = false;
  }

  if (!open) {
    return (
      <div style={{ marginTop: 12 }}>
        <button onClick={() => { setOpen(true); setPublished(false); }} style={ui.btn}>{t(locale, "creply.open")}</button>
        {published && <span style={{ ...ui.monoLabel, color: "var(--accent)", marginLeft: 12 }}>{t(locale, "creply.published")}</span>}
      </div>
    );
  }

  return (
    <div style={{ ...ui.card, marginTop: 12, borderColor: "var(--accent-line)" }}>
      <div style={ui.monoLabel}>{t(locale, "creply.title")}</div>
      <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginTop: 6 }}>{t(locale, "creply.hint")}</p>

      {draft === null ? (
        <p style={{ ...ui.monoLabel, color: "var(--accent)", textTransform: "none", marginTop: 12 }}>
          {gen ? t(locale, "creply.reading") : t(locale, "common.processing")}
        </p>
      ) : (
        <>
          <label style={{ ...ui.fieldLabel, marginTop: 12 }}>{t(locale, "creply.draftLabel")}</label>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={6} style={{ ...ui.input, resize: "vertical", opacity: gen ? 0.5 : 1 }} disabled={gen} />

          {/* доработка по указаниям */}
          <label style={{ ...ui.fieldLabel, marginTop: 12 }}>{t(locale, "creply.instrLabel")}</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder={t(locale, "creply.instrPlaceholder")} style={{ ...ui.input, flex: 1, minWidth: 200 }} />
            <button onClick={() => generate(instructions, draft)} disabled={gen || !instructions.trim()} style={{ ...ui.btn, opacity: gen || !instructions.trim() ? 0.5 : 1 }}>
              {gen ? "…" : t(locale, "creply.regenerate")}
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button onClick={publish} disabled={pub || gen || !draft.trim()} style={{ ...ui.btnAccent, opacity: pub || gen || !draft.trim() ? 0.5 : 1 }}>
              {pub ? t(locale, "common.publishing") : t(locale, "creply.publish")}
            </button>
            <button onClick={close} style={ui.btn}>{t(locale, "common.cancel")}</button>
          </div>
        </>
      )}

      {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 8 }}>{error}</p>}
    </div>
  );
}
