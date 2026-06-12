"use client";

import { persistLocale, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

const LABELS: Record<Locale, string> = { uk: "UA", ru: "RU", en: "EN" };
const ORDER: Locale[] = ["uk", "ru", "en"];

/** Переключатель языка: ставит куку `locale` (сервер) + localStorage (Mini App) и перезагружает. */
export function LocaleSwitch({ current }: { current: Locale }) {
  function pick(l: Locale) {
    if (l === current) return;
    persistLocale(l);
    location.reload();
  }
  return (
    <div style={{ display: "flex", border: "1px solid var(--border-2)", borderRadius: 2, overflow: "hidden" }}>
      {ORDER.map((l) => (
        <button
          key={l}
          onClick={() => pick(l)}
          aria-label={l}
          style={{
            ...ui.monoLabel,
            padding: "5px 7px",
            lineHeight: 1,
            background: l === current ? "var(--accent)" : "transparent",
            color: l === current ? "#000" : "var(--muted)",
            border: "none",
            cursor: l === current ? "default" : "pointer",
          }}
        >
          {LABELS[l]}
        </button>
      ))}
    </div>
  );
}
