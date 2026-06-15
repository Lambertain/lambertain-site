"use client";

import { useState, useTransition } from "react";
import { saveSecret, removeSecret } from "../../project-actions";
import { ui } from "../../../ui-styles";

type Secret = { id: number; name: string; value: string | null; note: string | null; env: string | null; filledBy: string | null };

export function SecretsPanel({ projectKey, secrets }: { projectKey: string; secrets: Secret[] }) {
  const [reveal, setReveal] = useState(false);
  return (
    <div style={{ ...ui.card, marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ ...ui.monoLabel, color: "var(--accent)" }}>Секрети та доступи проєкту</div>
        <button onClick={() => setReveal((v) => !v)} style={{ ...ui.monoLabel, color: "var(--muted)", background: "transparent", border: "1px solid var(--border-2)", padding: "4px 10px", cursor: "pointer", borderRadius: 2 }}>
          {reveal ? "Сховати значення" : "Показати значення"}
        </button>
      </div>
      <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginTop: 8, maxWidth: 620 }}>
        Токени, логіни, ключі (від клієнта/власника). Бачить лише адмін — розробник-людина ні; його Claude-код читає їх через <code>/api/dev/secrets</code>.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
        {secrets.map((s) => <Row key={s.id} projectKey={projectKey} s={s} reveal={reveal} />)}
        <Row projectKey={projectKey} reveal isNew />
      </div>
    </div>
  );
}

function Row({ projectKey, s, reveal, isNew }: { projectKey: string; s?: Secret; reveal: boolean; isNew?: boolean }) {
  const [name, setName] = useState(s?.name ?? "");
  const [value, setValue] = useState(s?.value ?? "");
  const [env, setEnv] = useState(s?.env ?? "");
  const [note, setNote] = useState(s?.note ?? "");
  const [removed, setRemoved] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (removed) return null;

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveSecret(projectKey, { name, value, env, note });
      if (r.error) setMsg(r.error);
      else { setMsg("✓"); if (isNew) { setName(""); setValue(""); setEnv(""); setNote(""); } }
    });
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap", paddingTop: 8, borderTop: isNew ? "1px dashed var(--border-2)" : "1px solid var(--border)" }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Назва (напр. TELEGRAM_BOT_TOKEN)" style={{ ...ui.input, width: 230 }} />
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Значення" type={reveal ? "text" : "password"} style={{ ...ui.input, flex: 1, minWidth: 200, fontFamily: "var(--font-mono)", fontSize: 13 }} />
      <input value={env} onChange={(e) => setEnv(e.target.value)} placeholder="env" title="prod / dev (опц.)" style={{ ...ui.input, width: 80 }} />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="нотатка" style={{ ...ui.input, width: 160 }} />
      <button onClick={save} disabled={pending || !name.trim()} style={{ ...ui.btn, padding: "9px 14px", opacity: pending || !name.trim() ? 0.5 : 1 }}>{isNew ? "Додати" : "Зберегти"}</button>
      {!isNew && s && (
        <button onClick={() => { if (confirm("Видалити секрет?")) start(async () => { await removeSecret(projectKey, s.id); setRemoved(true); }); }}
          style={{ ...ui.monoLabel, color: "#ff5b5b", background: "transparent", border: "1px solid #ff5b5b", padding: "9px 10px", cursor: "pointer", borderRadius: 2 }}>✕</button>
      )}
      {msg && <span style={{ ...ui.monoLabel, color: msg === "✓" ? "var(--accent)" : "#ff5b5b", alignSelf: "center" }}>{msg}</span>}
      {s?.filledBy === "client" && <span style={{ ...ui.monoLabel, color: "#e8b339", alignSelf: "center" }}>від клієнта</span>}
    </div>
  );
}
