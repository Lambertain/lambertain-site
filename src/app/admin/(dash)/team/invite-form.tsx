"use client";

import { useState, useTransition } from "react";
import { createInviteLink } from "./actions";
import { ui } from "../../ui-styles";

type Usr = { login: string; fullName: string; role: string };

export function InviteForm({ users }: { users: Usr[] }) {
  const [login, setLogin] = useState("");
  const [role, setRole] = useState<"contributor" | "client">("contributor");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  function gen() {
    setError(null);
    setLink(null);
    setCopied(false);
    start(async () => {
      const res = await createInviteLink(login, role);
      if (res.error) setError(res.error);
      else setLink(res.link ?? null);
    });
  }

  function copy() {
    if (link) {
      navigator.clipboard.writeText(link);
      setCopied(true);
    }
  }

  return (
    <div style={{ ...ui.card, marginTop: 20, maxWidth: 560 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 16 }}>
        <div>
          <label style={ui.fieldLabel}>Пользователь YouTrack</label>
          <select value={login} onChange={(e) => setLogin(e.target.value)} style={ui.input}>
            <option value="">— выбрать —</option>
            {users.map((u) => (
              <option key={u.login} value={u.login}>
                {u.fullName} ({u.login})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={ui.fieldLabel}>Роль</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "contributor" | "client")}
            style={ui.input}
          >
            <option value="contributor">Контрибьютор</option>
            <option value="client">Клиент</option>
          </select>
        </div>
      </div>

      <button onClick={gen} disabled={pending || !login} style={{ ...ui.btnAccent, marginTop: 16, opacity: pending || !login ? 0.5 : 1 }}>
        {pending ? "Генерация…" : "Создать ссылку-приглашение"}
      </button>

      {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 12 }}>{error}</p>}

      {link && (
        <div style={{ marginTop: 16 }}>
          <label style={ui.fieldLabel}>Ссылка (действует 72 ч, одноразовая)</label>
          <div style={{ display: "flex", gap: 10 }}>
            <input readOnly value={link} style={{ ...ui.input, fontFamily: "var(--font-mono)", fontSize: 12 }} />
            <button onClick={copy} style={ui.btn}>
              {copied ? "Скопировано" : "Копировать"}
            </button>
          </div>
          <p style={{ ...ui.monoLabel, textTransform: "none", marginTop: 8 }}>
            Отправь её человеку — открыв в Telegram, он привяжет аккаунт к этому YouTrack-логину.
          </p>
        </div>
      )}
    </div>
  );
}
