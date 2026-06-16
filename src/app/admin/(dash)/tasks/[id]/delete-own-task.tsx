"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTask } from "../../tasks-actions";
import { ui } from "../../../ui-styles";

/** Удаление СВОЕЙ задачи автором в окне до триажа. */
export function DeleteOwnTask({ taskId, label, confirmText }: { taskId: string; label: string; confirmText: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => { if (confirm(confirmText)) start(async () => { const r = await deleteTask(taskId); if (!r.error) router.push("/admin"); }); }}
      disabled={pending}
      style={{ ...ui.monoLabel, color: "#ff5b5b", background: "transparent", border: "1px solid #ff5b5b", padding: "7px 12px", cursor: "pointer", borderRadius: 2 }}
    >
      {pending ? "…" : label}
    </button>
  );
}
