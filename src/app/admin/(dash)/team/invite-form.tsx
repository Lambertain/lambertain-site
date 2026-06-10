"use client";

import { useState, useTransition } from "react";
import { createInviteLink } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../ui-styles";

export function InviteForm({ locale }: { locale: Locale }) {
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
      const res = await createInviteLink(role);
      if (res.error) setError(res.error);
      else setLink(res.link ?? null);
    });
  }

  return (
    <div style={{ ...ui.card, marginTop: 20, maxWidth: 560 }}>
      <label style={ui.fieldLabel}>{t(locale, "field.role")}</label>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "contributor" | "client")}
          style={{ ...ui.input, maxWidth: 220 }}
        >
          <option value="contributor">{t(locale, "role.contributor")}</option>
          <option value="client">{t(locale, "role.client")}</option>
        </select>
        <button onClick={gen} disabled={pending} style={{ ...ui.btnAccent, opacity: pending ? 0.5 : 1 }}>
          {pending ? t(locale, "common.generating") : t(locale, "team.createInvite")}
        </button>
      </div>

      {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 12 }}>{error}</p>}

      {link && (
        <div style={{ marginTop: 16 }}>
          <label style={ui.fieldLabel}>{t(locale, "team.linkLabel")}</label>
          <div style={{ display: "flex", gap: 10 }}>
            <input readOnly value={link} style={{ ...ui.input, fontFamily: "var(--font-mono)", fontSize: 12 }} />
            <button
              onClick={() => {
                navigator.clipboard.writeText(link);
                setCopied(true);
              }}
              style={ui.btn}
            >
              {copied ? t(locale, "common.copied") : t(locale, "common.copy")}
            </button>
          </div>
          <p style={{ ...ui.monoLabel, textTransform: "none", marginTop: 8 }}>{t(locale, "team.linkHint")}</p>
        </div>
      )}
    </div>
  );
}
