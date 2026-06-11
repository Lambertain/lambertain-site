"use client";

import { useEffect, useRef, useState } from "react";
import { markTaskRead } from "../../tasks-actions";
import { t, type Locale } from "@/lib/i18n";
import { Markdown } from "../../markdown";
import { ui } from "../../../ui-styles";

export type ViewComment = {
  id: string;
  text: string;
  created: number;
  authorName: string;
  authorRole: string;
  visibility?: "client" | "internal";
  isNew: boolean;
};

const DATE_LOC: Record<Locale, string> = { uk: "uk-UA", ru: "ru-RU", en: "en-US" };
function fmt(ms: number, locale: Locale): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString(DATE_LOC[locale], { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function CommentsView({
  taskId,
  comments,
  isClient,
  locale,
}: {
  taskId: string;
  comments: ViewComment[];
  isClient: boolean;
  locale: Locale;
}) {
  const newRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [hiddenNew, setHiddenNew] = useState(0); // сколько новых комментов ниже зоны видимости

  // На входе отмечаем задачу прочитанной (метка снимется при следующем заходе).
  useEffect(() => {
    markTaskRead(taskId);
  }, [taskId]);

  // Следим, какие новые комменты не видны (ниже экрана) → показываем подсказку.
  useEffect(() => {
    const els = [...newRefs.current.values()];
    if (!els.length) return;
    const visible = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target);
          else visible.delete(e.target);
        }
        // считаем новые комменты, которые ниже нижней границы экрана
        let below = 0;
        for (const el of els) {
          if (!visible.has(el) && el.getBoundingClientRect().top > window.innerHeight) below++;
        }
        setHiddenNew(below);
      },
      { threshold: 0.1 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [comments]);

  function scrollToNew() {
    const els = [...newRefs.current.values()];
    const target = els.find((el) => el.getBoundingClientRect().top > window.innerHeight) ?? els[0];
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const shown = isClient ? comments.filter((c) => c.visibility !== "internal") : comments;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {shown.length === 0 && <p style={{ color: "var(--muted)", fontSize: 14 }}>{t(locale, "task.noComments")}</p>}
        {shown.map((c) => {
          const internal = c.visibility === "internal";
          return (
            <div
              key={c.id}
              ref={c.isNew ? (el) => { if (el) newRefs.current.set(c.id, el); } : undefined}
              style={{ ...ui.card, padding: 14, borderColor: c.isNew ? "var(--accent-line)" : internal ? "var(--border-2)" : "var(--border)", background: internal ? "rgba(255,255,255,0.02)" : undefined }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, ...ui.monoLabel, textTransform: "none", marginBottom: 6 }}>
                <span style={{ color: c.authorRole === "client" ? "#e8b339" : "var(--accent)" }}>
                  {isClient && c.authorRole !== "client" ? "Lambertain" : c.authorName}
                </span>
                {c.isNew && <span style={{ ...ui.monoLabel, color: "#000", background: "var(--accent)", padding: "1px 6px", borderRadius: 3, fontWeight: 600 }}>NEW</span>}
                {internal && !isClient && (
                  <span style={{ ...ui.monoLabel, color: "#e8b339", border: "1px solid #e8b339", padding: "1px 6px" }}>{t(locale, "comment.internalBadge")}</span>
                )}
                <span style={{ marginLeft: "auto" }}>{fmt(c.created, locale)}</span>
              </div>
              <Markdown>{c.text}</Markdown>
            </div>
          );
        })}
      </div>

      {hiddenNew > 0 && (
        <button
          onClick={scrollToNew}
          style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 1000, ...ui.btnAccent, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}
        >
          {t(locale, "comment.newBelow", { n: String(hiddenNew) })}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
        </button>
      )}
    </>
  );
}
