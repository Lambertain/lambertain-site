"use client";

import { persistLocale, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

const LABELS: Record<Locale, string> = { uk: "UA", ru: "RU", en: "EN" };
const ORDER: Locale[] = ["uk", "ru", "en"];

/** Переключатель языка (селект): ставит куку `locale` (сервер) + localStorage (Mini App) и перезагружает. */
export function LocaleSwitch({ current }: { current: Locale }) {
  function pick(l: Locale) {
    if (l === current) return;
    persistLocale(l);
    location.reload();
  }
  return (
    <select
      value={current}
      onChange={(e) => pick(e.target.value as Locale)}
      aria-label="Мова"
      style={{
        ...ui.monoLabel,
        padding: "6px 8px",
        lineHeight: 1,
        background: "var(--surface-2)",
        color: "var(--text)",
        border: "1px solid var(--border-2)",
        borderRadius: 2,
        cursor: "pointer",
        outline: "none",
      }}
    >
      {ORDER.map((l) => (
        <option key={l} value={l} style={{ background: "var(--surface)", color: "var(--text)" }}>{LABELS[l]}</option>
      ))}
    </select>
  );
}
