"use client";

import { useState, useTransition } from "react";
import { createInviteLink } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../ui-styles";

type Usr = { login: string; fullName: string; role: string };

export function InviteForm({ users, locale }: { users: Usr[]; locale: Locale }) {
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
          <label style={ui.fieldLabel}>{t(locale, "team.user")}</label>
          <select value={login} onChange={(e) => setLogin(e.target.value)} style={ui.input}>
            <option value="">{t(locale, "common.choose")}</option>
            {users.map((u) => (
              <option key={u.login} value={u.login}>
                {u.fullName} ({u.login})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={ui.fieldLabel}>{t(locale, "field.role")}</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "contributor" | "client")}
            style={ui.input}
          >
            <option value="contributor">{t(locale, "role.contributor")}</option>
            <option value="client">{t(locale, "role.client")}</option>
          </select>
        </div>
      </div>

      <button onClick={gen} disabled={pending || !login} style={{ ...ui.btnAccent, marginTop: 16, opacity: pending || !login ? 0.5 : 1 }}>
        {pending ? t(locale, "common.generating") : t(locale, "team.createInvite")}
      </button>

      {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 12 }}>{error}</p>}

      {link && (
        <div style={{ marginTop: 16 }}>
          <label style={ui.fieldLabel}>{t(locale, "team.linkLabel")}</label>
          <div style={{ display: "flex", gap: 10 }}>
            <input readOnly value={link} style={{ ...ui.input, fontFamily: "var(--font-mono)", fontSize: 12 }} />
            <button onClick={copy} style={ui.btn}>
              {copied ? t(locale, "common.copied") : t(locale, "common.copy")}
            </button>
          </div>
          <p style={{ ...ui.monoLabel, textTransform: "none", marginTop: 8 }}>{t(locale, "team.linkHint")}</p>
        </div>
      )}
    </div>
  );
}
