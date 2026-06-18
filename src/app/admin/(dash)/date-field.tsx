"use client";

import { useState, useRef, useEffect } from "react";
import type { Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

const pad = (n: number) => String(n).padStart(2, "0");
const LOC: Record<Locale, string> = { uk: "uk-UA", ru: "ru-RU", en: "en-US" };
const WEEKDAYS: Record<Locale, string[]> = {
  uk: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"],
  ru: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
  en: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"],
};

/**
 * Кастомный выбор даты в дизайн-системе портала (вместо нативного input[type=date], чью иконку
 * не видно на тёмной теме). value/onChange — строка ISO "YYYY-MM-DD".
 */
export function DateField({ value, onChange, placeholder = "ДД.ММ.РРРР", locale = "uk" }: { value: string; onChange: (v: string) => void; placeholder?: string; locale?: Locale }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const sel = value ? new Date(value + "T00:00:00") : null;
  const today = new Date();
  const [view, setView] = useState<{ y: number; m: number }>(() => (sel ? { y: sel.getFullYear(), m: sel.getMonth() } : { y: today.getFullYear(), m: today.getMonth() }));

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const display = sel ? `${pad(sel.getDate())}.${pad(sel.getMonth() + 1)}.${sel.getFullYear()}` : "";
  const monthLabel = new Date(view.y, view.m, 1).toLocaleString(LOC[locale], { month: "long", year: "numeric" });

  const first = new Date(view.y, view.m, 1);
  const startWd = (first.getDay() + 6) % 7; // понедельник = 0
  const daysIn = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startWd).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];

  const isSel = (d: number) => !!sel && sel.getFullYear() === view.y && sel.getMonth() === view.m && sel.getDate() === d;
  const isToday = (d: number) => today.getFullYear() === view.y && today.getMonth() === view.m && today.getDate() === d;

  function pick(d: number) { onChange(`${view.y}-${pad(view.m + 1)}-${pad(d)}`); setOpen(false); }
  const prev = () => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }));
  const next = () => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }));
  const nav: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, background: "transparent", border: "1px solid var(--border-2)", color: "var(--muted)", cursor: "pointer", borderRadius: 2 };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ ...ui.input, width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ color: display ? "var(--text)" : "var(--muted)" }}>{display || placeholder}</span>
        {/* зелёная КОНТУРНАЯ иконка календаря (видна на тёмной теме) */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200, ...ui.card, padding: 12, width: 268 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <button type="button" onClick={prev} style={nav}>‹</button>
            <span style={{ ...ui.monoLabel, textTransform: "capitalize", color: "var(--text)" }}>{monthLabel}</span>
            <button type="button" onClick={next} style={nav}>›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {WEEKDAYS[locale].map((w) => (
              <div key={w} style={{ ...ui.monoLabel, textAlign: "center", color: "var(--muted)", padding: "2px 0" }}>{w}</div>
            ))}
            {cells.map((d, i) => d === null ? <div key={`e${i}`} /> : (
              <button
                key={d}
                type="button"
                onClick={() => pick(d)}
                style={{
                  height: 30, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, cursor: "pointer", borderRadius: 3,
                  background: isSel(d) ? "var(--accent)" : "transparent",
                  color: isSel(d) ? "#000" : "var(--text)",
                  border: `1px solid ${isSel(d) ? "var(--accent)" : isToday(d) ? "var(--accent-line)" : "transparent"}`,
                  fontWeight: isSel(d) ? 700 : 400,
                }}
              >
                {d}
              </button>
            ))}
          </div>
          {value && (
            <button type="button" onClick={() => { onChange(""); setOpen(false); }} style={{ ...ui.monoLabel, marginTop: 10, width: "100%", color: "var(--muted)", background: "transparent", border: "1px solid var(--border-2)", padding: "6px 0", cursor: "pointer", borderRadius: 2 }}>×</button>
          )}
        </div>
      )}
    </div>
  );
}
