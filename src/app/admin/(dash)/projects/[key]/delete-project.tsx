"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteProject } from "../../project-actions";
import { ui } from "../../../ui-styles";

const redBtn = { ...ui.monoLabel, color: "#fff", background: "#ff5b5b", border: "none", padding: "10px 18px", cursor: "pointer", borderRadius: 2 } as const;

export function DeleteProject({ projectKey, projectName }: { projectKey: string; projectName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const match = confirm.trim() === projectName.trim();

  function del() {
    setErr(null);
    start(async () => {
      const r = await deleteProject(projectKey, confirm);
      if (r.error) setErr(r.error);
      else router.push("/admin/projects");
    });
  }

  return (
    <div style={{ marginTop: 44, paddingTop: 20, borderTop: "1px solid rgba(255,91,91,0.3)" }}>
      <div style={{ ...ui.monoLabel, color: "#ff5b5b" }}>Небезпечна зона</div>
      {!open ? (
        <button onClick={() => setOpen(true)} style={{ ...redBtn, marginTop: 12 }}>Видалити проєкт</button>
      ) : (
        <div style={{ marginTop: 12, border: "1px solid #ff5b5b", borderRadius: 4, padding: 16, maxWidth: 520 }}>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: "0 0 12px" }}>
            Видалення <b>НЕЗВОРОТНЄ</b>: проєкт «{projectName}», усі його задачі, коментарі, секрети й токени буде видалено назавжди.
          </p>
          <label style={{ ...ui.fieldLabel, display: "block", marginBottom: 6 }}>
            Впишіть назву проєкту для підтвердження: <b style={{ color: "var(--text)" }}>{projectName}</b>
          </label>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={projectName} style={{ ...ui.input, maxWidth: 360 }} />
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
            <button onClick={del} disabled={!match || pending} style={{ ...redBtn, opacity: !match || pending ? 0.5 : 1 }}>
              {pending ? "Видалення…" : "Видалити назавжди"}
            </button>
            <button onClick={() => { setOpen(false); setConfirm(""); setErr(null); }} style={ui.btn}>Скасувати</button>
            {err && <span style={{ ...ui.monoLabel, textTransform: "none", color: "#ff5b5b" }}>{err}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
