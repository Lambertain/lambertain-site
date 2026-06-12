"use client";

import { useTransition } from "react";
import { retryDrafting } from "./actions";
import { ui } from "../../../ui-styles";

export function RetryDrafting({ id, label }: { id: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(async () => { await retryDrafting(id); })}
      disabled={pending}
      style={{ ...ui.monoLabel, color: "var(--muted)", background: "transparent", border: "1px solid var(--border-2)", padding: "5px 10px", cursor: "pointer", borderRadius: 2, marginLeft: "auto", opacity: pending ? 0.5 : 1 }}
    >
      {pending ? "…" : label}
    </button>
  );
}
