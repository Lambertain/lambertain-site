"use client";

import { useState, useTransition } from "react";
import { kickoffFromSpec } from "../../project-actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../../ui-styles";

/**
 * Старт проекта одной кнопкой: разбивает СОХРАНЁННУЮ спеку проекта на задачи и сразу создаёт их.
 * Без отдельного поля спеки (берём из «Спека проекта» выше) и без превью/апрува.
 */
export function KickoffPanel({ projectKey, locale, hasSpec }: { projectKey: string; locale: Locale; hasSpec: boolean }) {
  const [createdN, setCreatedN] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run() {
    setError(null); setCreatedN(null);
    start(async () => {
      const r = await kickoffFromSpec(projectKey);
      if (r.error) setError(r.error);
      else setCreatedN(r.created ?? 0);
    });
  }

  return (
    <div style={{ ...ui.card, marginTop: 16 }}>
      <div style={{ ...ui.monoLabel, color: "var(--accent)" }}>{t(locale, "kickoff.title")}</div>
      <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginTop: 6 }}>{t(locale, "kickoff.hint")}</p>

      {createdN != null ? (
        <p style={{ fontSize: 14, color: "var(--accent)", marginTop: 12 }}>{t(locale, "kickoff.created", { n: String(createdN) })}</p>
      ) : !hasSpec ? (
        <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginTop: 12 }}>{t(locale, "kickoff.needSpec")}</p>
      ) : (
        <button onClick={run} disabled={pending} style={{ ...ui.btnAccent, marginTop: 12, opacity: pending ? 0.6 : 1 }}>
          {pending ? t(locale, "kickoff.working") : t(locale, "kickoff.run")}
        </button>
      )}
      {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 10 }}>{error}</p>}
    </div>
  );
}
