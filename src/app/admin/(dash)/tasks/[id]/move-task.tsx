"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveTask } from "../../tasks-actions";
import { ui } from "../../../ui-styles";

/** Перенос задачи в другой проект — только супер-админ. Задаёт новый № в целевом проекте. */
export function MoveTask({ taskId, projects }: { taskId: string; projects: { key: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    if (!target) return;
    setError(null);
    start(async () => {
      const r = await moveTask(taskId, target);
      if (r.error) setError(r.error);
      else if (r.to) router.push(`/admin/tasks/${r.to}`);
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ ...ui.monoLabel, color: "var(--muted)", background: "transparent", border: "1px solid var(--border-2)", padding: "7px 12px", cursor: "pointer", borderRadius: 2 }}>
        Перенести в проект
      </button>
    );
  }
  return (
    <div style={{ ...ui.card, padding: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span style={ui.monoLabel}>Перенести {taskId} →</span>
      <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ ...ui.input, minWidth: 200 }}>
        <option value="">— проект —</option>
        {projects.map((p) => (
          <option key={p.key} value={p.key}>{p.key} · {p.name}</option>
        ))}
      </select>
      <button onClick={submit} disabled={pending || !target} style={{ ...ui.btnAccent, opacity: pending || !target ? 0.5 : 1 }}>{pending ? "…" : "Перенести"}</button>
      <button onClick={() => { setOpen(false); setError(null); }} disabled={pending} style={{ ...ui.monoLabel, color: "var(--muted)", background: "transparent", border: "none", cursor: "pointer" }}>отмена</button>
      {error && <span style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none" }}>{error}</span>}
    </div>
  );
}
