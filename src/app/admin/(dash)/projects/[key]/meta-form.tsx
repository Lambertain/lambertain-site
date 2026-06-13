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
  contributors,
  locale,
}: {
  projectKey: string;
  initialName: string;
  initialMeta: ProjectMeta;
  contributors: { login: string; fullName: string }[];
  locale: Locale;
}) {
  const m = initialMeta;
  const [name, setName] = useState(initialName);
  const [defaultAssignee, setDefaultAssignee] = useState(m.defaultAssignee ?? "");
  const [cost, setCost] = useState(m.cost != null ? String(m.cost) : "");
  const [currency, setCurrency] = useState(m.currency ?? "₴");
  const [parts, setParts] = useState(m.parts != null ? String(m.parts) : "1");
  const [paidParts, setPaidParts] = useState(m.paidParts != null ? String(m.paidParts) : "0");
  const [startedAt, setStartedAt] = useState(m.startedAt ?? "");
  const [deadline, setDeadline] = useState(m.deadline ?? "");
  const cd = m.clientDeploy ?? {};
  const [cdToken, setCdToken] = useState(cd.railwayToken ?? "");
  const [cdProject, setCdProject] = useState(cd.projectId ?? "");
  const [cdEnv, setCdEnv] = useState(cd.environmentId ?? "");
  const [cdService, setCdService] = useState(cd.serviceId ?? "");
  const [cdPg, setCdPg] = useState(cd.pgServiceId ?? "");
  const [clientGit, setClientGit] = useState(m.clientGit ?? "");
  const [devGit, setDevGit] = useState(m.devGit ?? "");
  const [localPath, setLocalPath] = useState(m.localPath ?? "");
  const [prodUrl, setProdUrl] = useState(m.apps?.prod?.url ?? "");
  const [devUrl, setDevUrl] = useState(m.apps?.dev?.url ?? "");
  const [prodBranch, setProdBranch] = useState(m.deploy?.prodBranch ?? "");
  const [devBranch, setDevBranch] = useState(m.deploy?.devBranch ?? "");
  const [design, setDesign] = useState(m.design ?? "");
  const [spec, setSpec] = useState(m.spec ?? "");
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
      spec: spec || undefined,
      conventions: m.conventions || undefined, // поле убрано из формы; сохранённое значение не теряем
      defaultAssignee: defaultAssignee || undefined,
      cost: cost.trim() !== "" && Number.isFinite(Number(cost)) ? Number(cost) : undefined,
      currency: currency || undefined,
      parts: Number(parts) >= 1 ? Math.floor(Number(parts)) : undefined,
      paidParts: Number(paidParts) >= 0 ? Math.floor(Number(paidParts)) : undefined,
      startedAt: startedAt || undefined,
      deadline: deadline || undefined,
      clientDeploy:
        cdToken || cdProject || cdEnv || cdService || cdPg
          ? {
              railwayToken: cdToken || undefined,
              projectId: cdProject || undefined,
              environmentId: cdEnv || undefined,
              serviceId: cdService || undefined,
              pgServiceId: cdPg || undefined,
            }
          : undefined,
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

      <div style={{ marginTop: 14 }}>
        <label style={ui.fieldLabel}>{t(locale, "projects.defaultAssignee")}</label>
        <select value={defaultAssignee} onChange={(e) => setDefaultAssignee(e.target.value)} style={ui.input}>
          <option value="">{t(locale, "field.unassigned")}</option>
          {contributors.map((c) => (
            <option key={c.login} value={c.login}>
              {c.fullName} ({c.login})
            </option>
          ))}
        </select>
      </div>

      <div style={{ ...ui.monoLabel, marginTop: 18, marginBottom: 10 }}>{t(locale, "dash.kicker")}</div>
      <div className="pm-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={ui.fieldLabel}>{t(locale, "field.cost")}</label>
          <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="numeric" style={ui.input} />
        </div>
        <div>
          <label style={ui.fieldLabel}>{t(locale, "field.currency")}</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={ui.input}>
            <option value="₴">₴</option>
            <option value="$">$</option>
            <option value="€">€</option>
          </select>
        </div>
        <div>
          <label style={ui.fieldLabel}>{t(locale, "field.parts")}</label>
          <input value={parts} onChange={(e) => setParts(e.target.value)} inputMode="numeric" style={ui.input} />
        </div>
        <div>
          <label style={ui.fieldLabel}>{t(locale, "field.paidParts")}</label>
          <input value={paidParts} onChange={(e) => setPaidParts(e.target.value)} inputMode="numeric" style={ui.input} />
        </div>
        <div>
          <label style={ui.fieldLabel}>{t(locale, "field.startedAt")}</label>
          <input type="date" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} style={ui.input} />
        </div>
        <div>
          <label style={ui.fieldLabel}>{t(locale, "field.deadline")}</label>
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={ui.input} />
        </div>
      </div>

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

      <div style={{ ...ui.monoLabel, marginTop: 18, marginBottom: 10 }}>{t(locale, "projects.clientDeploy")}</div>
      <div style={{ ...ui.monoLabel, textTransform: "none", marginBottom: 10 }}>{t(locale, "projects.clientDeployHint")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label={t(locale, "projects.cdToken")} value={cdToken} onChange={setCdToken} />
        <div className="pm-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label={t(locale, "projects.cdProject")} value={cdProject} onChange={setCdProject} />
          <Field label={t(locale, "projects.cdEnv")} value={cdEnv} onChange={setCdEnv} />
          <Field label={t(locale, "projects.cdService")} value={cdService} onChange={setCdService} />
          <Field label={t(locale, "projects.cdPg")} value={cdPg} onChange={setCdPg} />
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <label style={ui.fieldLabel}>{t(locale, "projects.spec")}</label>
        <div style={{ ...ui.monoLabel, textTransform: "none", marginBottom: 6 }}>{t(locale, "projects.specHint")}</div>
        <textarea value={spec} onChange={(e) => setSpec(e.target.value)} rows={10} style={{ ...ui.input, resize: "vertical", fontSize: 13, lineHeight: 1.5 }} />
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
