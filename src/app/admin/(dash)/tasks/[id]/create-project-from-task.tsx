"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProjectFromTask } from "../../tasks-actions";
import { ui } from "../../../ui-styles";

/** Создать новый проект из задачи и перенести задачу в него — только супер-админ. */
export function CreateProjectFromTask({ taskId, defaultName }: { taskId: string; defaultName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    const n = name.trim();
    if (!n) return;
    setError(null);
    start(async () => {
      const r = await createProjectFromTask(taskId, n);
      if (r.error) setError(r.error);
      else if (r.key) router.push(`/admin/projects/${r.key}`);
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ ...ui.monoLabel, color: "var(--muted)", background: "transparent", border: "1px solid var(--border-2)", padding: "7px 12px", cursor: "pointer", borderRadius: 2 }}>
        Створити проект із задачі
      </button>
    );
  }
  return (
    <div style={{ ...ui.card, padding: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span style={ui.monoLabel}>Новий проект із {taskId} →</span>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Назва проекту" style={{ ...ui.input, minWidth: 220 }} />
      <button onClick={submit} disabled={pending || !name.trim()} style={{ ...ui.btnAccent, opacity: pending || !name.trim() ? 0.5 : 1 }}>{pending ? "…" : "Створити"}</button>
      <button onClick={() => { setOpen(false); setError(null); }} disabled={pending} style={{ ...ui.monoLabel, color: "var(--muted)", background: "transparent", border: "none", cursor: "pointer" }}>отмена</button>
      {error && <span style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none" }}>{error}</span>}
    </div>
  );
}
