"use client";

import { useState, useTransition } from "react";
import { setProjectKind } from "../actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../../ui-styles";

/**
 * Переключатель типа проекта на строке с названием: круглый слайдер + подпись «НАШ».
 * ВЫКЛ (по умолчанию) = клиентский (постановщик задач — клиент); ВКЛ = наш (постановщик — я).
 */
export function ProjectTypeToggle({ projectKey, mine: initial, locale }: { projectKey: string; mine: boolean; locale: Locale }) {
  const [mine, setMine] = useState(initial);
  const [pending, start] = useTransition();

  function toggle() {
    const next = !mine;
    setMine(next); // оптимистично
    start(async () => {
      const r = await setProjectKind(projectKey, next);
      if (r?.error) setMine(!next); // откат при ошибке
    });
  }

  return (
    <div
      onClick={toggle}
      role="switch"
      aria-checked={mine}
      title={t(locale, "projects.kindHint")}
      style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none", opacity: pending ? 0.6 : 1, flexShrink: 0 }}
    >
      <span style={{ ...ui.monoLabel, color: mine ? "var(--accent)" : "var(--muted)" }}>{t(locale, "projects.kindOurs")}</span>
      <span style={{ position: "relative", width: 42, height: 24, borderRadius: 999, background: mine ? "var(--accent)" : "var(--border-2)", transition: "background .15s", display: "inline-block" }}>
        <span style={{ position: "absolute", top: 2, left: mine ? 20 : 2, width: 20, height: 20, borderRadius: "50%", background: mine ? "#000" : "var(--text)", transition: "left .15s" }} />
      </span>
    </div>
  );
}
