"use client";

import { useState, useTransition } from "react";
import { redistributeProtocol } from "./actions";
import { ui } from "../../ui-styles";

/** Обновить протокол Lambertain во всех наших дев-репо (после правок текста протокола). */
export function ProtocolButton() {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run() {
    setMsg(null);
    start(async () => {
      const r = await redistributeProtocol();
      if (r.error) { setMsg(r.error); return; }
      const upd = r.updated ?? 0;
      const skipped = (r.results ?? []).filter((x) => x.status === "skipped").length;
      const errs = (r.results ?? []).filter((x) => x.status === "error");
      setMsg(`Обновлено репо: ${upd} · без изменений: ${(r.results ?? []).filter((x) => x.status === "unchanged").length} · пропущено: ${skipped}${errs.length ? ` · ошибки: ${errs.map((e) => e.key).join(", ")}` : ""}`);
    });
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button onClick={run} disabled={pending} title="Разложить актуальный протокол (spec-kit, статусы, скилы) во все наши дев-репо" style={{ ...ui.monoLabel, color: "var(--muted)", background: "transparent", border: "1px solid var(--border-2)", padding: "6px 12px", cursor: "pointer", borderRadius: 2, opacity: pending ? 0.5 : 1 }}>
        {pending ? "…" : "Обновить протокол в дев-репо"}
      </button>
      {msg && <span style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)" }}>{msg}</span>}
    </span>
  );
}
