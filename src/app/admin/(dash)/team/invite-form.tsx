"use client";

import { useState, useTransition } from "react";
import { createInviteLink } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../ui-styles";

type Proj = { key: string; name: string };

export function InviteForm({ projects, locale }: { projects: Proj[]; locale: Locale }) {
  const [role, setRole] = useState<"contributor" | "client" | "employee">("contributor");
  const [projectKey, setProjectKey] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  function gen() {
    setError(null);
    setLink(null);
    setCopied(false);
    start(async () => {
      const res = await createInviteLink(role, projectKey);
      if (res.error) setError(res.error);
      else setLink(res.link ?? null);
    });
  }

  return (
    <div style={{ ...ui.card, marginTop: 20, maxWidth: 560 }}>
      <div className="pm-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={ui.fieldLabel}>{t(locale, "field.role")}</label>
          <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} style={ui.input}>
            <option value="contributor">{t(locale, "role.contributor")}</option>
            <option value="client">{t(locale, "role.client")}</option>
            <option value="employee">{t(locale, "role.employee")}</option>
          </select>
        </div>
        <div>
          <label style={ui.fieldLabel}>{t(locale, "field.project")}</label>
          <select value={projectKey} onChange={(e) => setProjectKey(e.target.value)} style={ui.input}>
            <option value="">{t(locale, "common.choose")}</option>
            {projects.map((p) => (
              <option key={p.key} value={p.key}>
                {p.key} — {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button onClick={gen} disabled={pending || (role !== "contributor" && !projectKey)} style={{ ...ui.btnAccent, marginTop: 14, opacity: pending || (role !== "contributor" && !projectKey) ? 0.5 : 1 }}>
        {pending ? t(locale, "common.generating") : t(locale, "team.createInvite")}
      </button>

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
