"use client";

import { useState, useRef, useEffect } from "react";
import { persistLocale, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

const LABELS: Record<Locale, string> = { uk: "UA", ru: "RU", en: "EN" };
const ORDER: Locale[] = ["uk", "ru", "en"];

/** Переключатель языка — кастомный дропдаун в дизайн-системе портала (без нативной стрелки). */
export function LocaleSwitch({ current }: { current: Locale }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(l: Locale) {
    setOpen(false);
    if (l === current) return;
    persistLocale(l);
    location.reload();
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Мова"
        style={{
          ...ui.monoLabel,
          padding: "6px 10px",
          lineHeight: 1,
          background: "transparent",
          color: "var(--text)",
          border: "1px solid var(--border-2)",
          borderRadius: 2,
          cursor: "pointer",
        }}
      >
        {LABELS[current]}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 100,
            minWidth: "100%",
            background: "var(--surface)",
            border: "1px solid var(--border-2)",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          {ORDER.map((l) => (
            <button
              key={l}
              onClick={() => pick(l)}
              style={{
                ...ui.monoLabel,
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "7px 12px",
                lineHeight: 1,
                background: l === current ? "var(--accent)" : "transparent",
                color: l === current ? "#000" : "var(--muted)",
                border: "none",
                cursor: "pointer",
              }}
            >
              {LABELS[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
