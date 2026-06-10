"use client";

import { useState, useTransition } from "react";
import { saveMeta } from "../actions";
import type { ProjectMeta } from "@/lib/tasks/types";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../../ui-styles";

function credsToText(meta: ProjectMeta): string {
  return (meta.credentials || [])
    .map((c) => [c.role, c.env, c.login, c.pass].map((x) => x ?? "").join("|"))
    .join("\n");
}
function textToCreds(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [role, env, login, pass] = l.split("|").map((x) => x?.trim());
      return { role, env, login, pass };
    });
}

const Field = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <div>
    <label style={ui.fieldLabel}>{label}</label>
    <input value={value} onChange={(e) => onChange(e.target.value)} style={ui.input} />
  </div>
);

export function MetaForm({
  projectKey,
  initialName,
  initialMeta,
  locale,
}: {
  projectKey: string;
  initialName: string;
  initialMeta: ProjectMeta;
  locale: Locale;
}) {
  const m = initialMeta;
  const [name, setName] = useState(initialName);
  const [clientGit, setClientGit] = useState(m.clientGit ?? "");
  const [devGit, setDevGit] = useState(m.devGit ?? "");
  const [localPath, setLocalPath] = useState(m.localPath ?? "");
  const [prodUrl, setProdUrl] = useState(m.apps?.prod?.url ?? "");
  const [devUrl, setDevUrl] = useState(m.apps?.dev?.url ?? "");
  const [prodBranch, setProdBranch] = useState(m.deploy?.prodBranch ?? "");
  const [devBranch, setDevBranch] = useState(m.deploy?.devBranch ?? "");
  const [design, setDesign] = useState(m.design ?? "");
  const [conventions, setConventions] = useState(m.conventions ?? "");
  const [creds, setCreds] = useState(credsToText(m));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setSaved(false);
    setError(null);
    const meta: ProjectMeta = {
      clientGit: clientGit || undefined,
      devGit: devGit || undefined,
      localPath: localPath || undefined,
      apps: { prod: { url: prodUrl || undefined, host: "" }, dev: { url: devUrl || undefined, host: "" } },
      deploy: { prodBranch: prodBranch || undefined, devBranch: devBranch || undefined },
      design: design || undefined,
      conventions: conventions || undefined,
      credentials: textToCreds(creds),
    };
    start(async () => {
      const r = await saveMeta(projectKey, name, meta);
      if (r.error) setError(r.error);
      else setSaved(true);
    });
  }

  return (
    <div style={{ ...ui.card, marginTop: 16 }}>
      <Field label={t(locale, "projects.name")} value={name} onChange={setName} />

      <div style={{ ...ui.monoLabel, marginTop: 18, marginBottom: 10 }}>{t(locale, "projects.repos")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label={t(locale, "projects.clientGit")} value={clientGit} onChange={setClientGit} />
        <Field label={t(locale, "projects.devGit")} value={devGit} onChange={setDevGit} />
        <Field label={t(locale, "projects.localPath")} value={localPath} onChange={setLocalPath} />
      </div>

      <div style={{ ...ui.monoLabel, marginTop: 18, marginBottom: 10 }}>{t(locale, "projects.hosting")}</div>
      <div className="pm-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label={t(locale, "projects.prodUrl")} value={prodUrl} onChange={setProdUrl} />
        <Field label={t(locale, "projects.devUrl")} value={devUrl} onChange={setDevUrl} />
      </div>

      <div style={{ ...ui.monoLabel, marginTop: 18, marginBottom: 10 }}>{t(locale, "projects.deploy")}</div>
      <div className="pm-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label={t(locale, "projects.prodBranch")} value={prodBranch} onChange={setProdBranch} />
        <Field label={t(locale, "projects.devBranch")} value={devBranch} onChange={setDevBranch} />
      </div>

      <div style={{ marginTop: 18 }}>
        <Field label={t(locale, "projects.design")} value={design} onChange={setDesign} />
      </div>

      <div style={{ marginTop: 18 }}>
        <label style={ui.fieldLabel}>{t(locale, "projects.conventions")}</label>
        <div style={{ ...ui.monoLabel, textTransform: "none", marginBottom: 6 }}>{t(locale, "projects.conventionsHint")}</div>
        <textarea value={conventions} onChange={(e) => setConventions(e.target.value)} rows={10} style={{ ...ui.input, resize: "vertical", fontSize: 13, lineHeight: 1.5 }} />
      </div>

      <div style={{ marginTop: 18 }}>
        <label style={ui.fieldLabel}>{t(locale, "projects.creds")}</label>
        <textarea value={creds} onChange={(e) => setCreds(e.target.value)} rows={4} style={{ ...ui.input, resize: "vertical", fontFamily: "var(--font-mono)", fontSize: 13 }} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18 }}>
        <button onClick={save} disabled={pending} style={{ ...ui.btnAccent, opacity: pending ? 0.5 : 1 }}>
          {pending ? "…" : t(locale, "projects.save")}
        </button>
        {saved && <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{t(locale, "projects.saved")}</span>}
        {error && <span style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none" }}>{error}</span>}
      </div>
    </div>
  );
}
