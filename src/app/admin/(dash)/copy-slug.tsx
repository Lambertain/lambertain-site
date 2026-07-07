"use client";

import { useState } from "react";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

/**
 * Слаг задачи (напр. HH-102) как кнопка: клик копирует слаг в буфер обмена + короткий фидбек «✓ скопійовано».
 * Внутри карточек-ссылок клик по слагу НЕ должен открывать задачу — гасим переход (preventDefault/stopPropagation).
 */
export function CopySlug({ id, locale, color = "var(--accent)", style }: { id: string; locale: Locale; color?: string; style?: React.CSSProperties }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={t(locale, "slug.copy")}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard?.writeText(id).then(
          () => { setCopied(true); setTimeout(() => setCopied(false), 1200); },
          () => {},
        );
      }}
      style={{ ...ui.monoLabel, color, background: "transparent", border: "none", padding: 0, cursor: "pointer", ...style }}
    >
      {copied ? `✓ ${t(locale, "slug.copied")}` : id}
    </button>
  );
}
