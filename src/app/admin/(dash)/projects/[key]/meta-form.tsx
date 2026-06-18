"use client";

import { useState, useTransition } from "react";
import { saveMeta } from "../actions";
import type { ProjectMeta } from "@/lib/tasks/types";
import { FIELD_VIS_DEFAULTS, type FieldVis } from "@/lib/field-visibility";
import { PROJECT_FIELD_DEFS, getFieldDef } from "@/lib/project-fields";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../../ui-styles";

type Account = { login?: string; pass?: string; note?: string };

/** Редактор аккаунтов входа: добавляемые строки логін/пароль/нотатка. */
function AccountsEditor({ rows, onChange, locale }: { rows: Account[]; onChange: (r: Account[]) => void; locale: Locale }) {
  const set = (i: number, k: keyof Account, v: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <input value={r.login ?? ""} onChange={(e) => set(i, "login", e.target.value)} placeholder={t(locale, "proj.login")} style={{ ...ui.input, flex: 1, minWidth: 130, padding: "6px 8px" }} />
          <input value={r.pass ?? ""} onChange={(e) => set(i, "pass", e.target.value)} placeholder={t(locale, "proj.pass")} style={{ ...ui.input, flex: 1, minWidth: 130, padding: "6px 8px" }} />
          <input value={r.note ?? ""} onChange={(e) => set(i, "note", e.target.value)} placeholder={t(locale, "proj.role")} style={{ ...ui.input, width: 110, padding: "6px 8px" }} />
          <button onClick={() => onChange(rows.filter((_, j) => j !== i))} style={{ background: "transparent", border: "none", color: "#ff5b5b", cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
      ))}
      <button onClick={() => onChange([...rows, {}])} style={{ ...ui.monoLabel, color: "var(--muted)", background: "transparent", border: "1px dashed var(--border-2)", padding: "6px 12px", cursor: "pointer", borderRadius: 2, alignSelf: "flex-start" }}>+ {t(locale, "proj.addAccount")}</button>
    </div>
  );
}

const Field = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <div>
    <label style={ui.fieldLabel}>{label}</label>
    <input value={value} onChange={(e) => onChange(e.target.value)} style={ui.input} />
  </div>
);

/** Чекбокс «видно роли» под полем карточки «Детали и доступы». */
function VisToggles({ field, vis, setVis, locale }: { field: string; vis: Record<string, FieldVis>; setVis: (f: (v: Record<string, FieldVis>) => Record<string, FieldVis>) => void; locale: Locale }) {
  const d = FIELD_VIS_DEFAULTS[field] ?? { client: true, dev: true };
  const cur = vis[field] ?? {};
  const client = cur.client ?? d.client;
  const dev = cur.dev ?? d.dev;
  const set = (role: "client" | "dev", val: boolean) =>
    setVis((v) => ({ ...v, [field]: { client, dev, [role]: val } }));
  const boxStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", ...ui.monoLabel, textTransform: "none" };
  const inputStyle: React.CSSProperties = { width: 15, height: 15, accentColor: "var(--accent)", cursor: "pointer" };
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
      <span style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)" }}>{t(locale, "vis.hint")}</span>
      <label style={boxStyle}>
        <input type="checkbox" checked={client} onChange={(e) => set("client", e.target.checked)} style={inputStyle} />
        {t(locale, "vis.client")}
      </label>
      <label style={boxStyle}>
        <input type="checkbox" checked={dev} onChange={(e) => set("dev", e.target.checked)} style={inputStyle} />
        {t(locale, "vis.dev")}
      </label>
    </div>
  );
}

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
  const cv = m.clientVercel ?? {};
  const [cvToken, setCvToken] = useState(cv.token ?? "");
  const [cvProject, setCvProject] = useState(cv.projectId ?? "");
  const [cvTeam, setCvTeam] = useState(cv.teamId ?? "");
  const [clientGit, setClientGit] = useState(m.clientGit ?? "");
  const [devGit, setDevGit] = useState(m.devGit ?? "");
  const [localPath, setLocalPath] = useState(m.localPath ?? "");
  const [prodUrl, setProdUrl] = useState(m.apps?.prod?.url ?? "");
  const [devUrl, setDevUrl] = useState(m.apps?.dev?.url ?? "");
  const [prodBranch, setProdBranch] = useState(m.deploy?.prodBranch ?? "");
  const [devBranch, setDevBranch] = useState(m.deploy?.devBranch ?? "");
  const [design, setDesign] = useState(m.design ?? "");
  const [spec, setSpec] = useState(m.spec ?? "");
  const [devInfo, setDevInfo] = useState(m.devInfo ?? "");
  const [autoApprove, setAutoApprove] = useState(!!m.autoApprove);
  const [vis, setVis] = useState<Record<string, FieldVis>>(m.fieldVisibility ?? {});
  const [prodAccounts, setProdAccounts] = useState<Account[]>(m.prodAccounts ?? []);
  const [devAccounts, setDevAccounts] = useState<Account[]>(m.devAccounts ?? []);
  const [enabledFields, setEnabledFields] = useState<string[]>(m.enabledFields ?? []);
  const [customFields, setCustomFields] = useState<Record<string, Record<string, string>>>(m.customFields ?? {});
  const [addField, setAddField] = useState("");
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
      devInfo: devInfo || undefined,
      autoApprove: autoApprove || undefined,
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
      clientVercel:
        cvToken || cvProject || cvTeam
          ? { token: cvToken || undefined, projectId: cvProject || undefined, teamId: cvTeam || undefined }
          : undefined,
      credentials: m.credentials, // секреты теперь редактируются в «Секрети та доступи» (project_secrets)
      fieldVisibility: Object.keys(vis).length ? vis : undefined,
      prodAccounts: prodAccounts.filter((a) => a.login || a.pass || a.note).length ? prodAccounts.filter((a) => a.login || a.pass || a.note) : undefined,
      devAccounts: devAccounts.filter((a) => a.login || a.pass || a.note).length ? devAccounts.filter((a) => a.login || a.pass || a.note) : undefined,
      enabledFields: enabledFields.length ? enabledFields : undefined,
      customFields: Object.keys(customFields).length ? customFields : undefined,
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
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <Field label={t(locale, "projects.prodUrl")} value={prodUrl} onChange={setProdUrl} />
          <VisToggles field="prodUrl" vis={vis} setVis={setVis} locale={locale} />
          <div style={{ marginTop: 10 }}>
            <label style={{ ...ui.fieldLabel, color: "var(--muted)" }}>{t(locale, "proj.accountsProd")}</label>
            <AccountsEditor rows={prodAccounts} onChange={setProdAccounts} locale={locale} />
            <VisToggles field="prodAccounts" vis={vis} setVis={setVis} locale={locale} />
          </div>
        </div>
        <div>
          <Field label={t(locale, "projects.devUrl")} value={devUrl} onChange={setDevUrl} />
          <VisToggles field="devUrl" vis={vis} setVis={setVis} locale={locale} />
          <div style={{ marginTop: 10 }}>
            <label style={{ ...ui.fieldLabel, color: "var(--muted)" }}>{t(locale, "proj.accountsDev")}</label>
            <AccountsEditor rows={devAccounts} onChange={setDevAccounts} locale={locale} />
            <VisToggles field="devAccounts" vis={vis} setVis={setVis} locale={locale} />
          </div>
        </div>
      </div>

      <div style={{ ...ui.monoLabel, marginTop: 18, marginBottom: 10 }}>{t(locale, "projects.deploy")}</div>
      <div className="pm-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label={t(locale, "projects.prodBranch")} value={prodBranch} onChange={setProdBranch} />
        <Field label={t(locale, "projects.devBranch")} value={devBranch} onChange={setDevBranch} />
      </div>

      <div style={{ marginTop: 18 }}>
        <Field label={t(locale, "projects.design")} value={design} onChange={setDesign} />
        <VisToggles field="design" vis={vis} setVis={setVis} locale={locale} />
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

      <div style={{ ...ui.monoLabel, marginTop: 18, marginBottom: 10 }}>{t(locale, "projects.vercel")}</div>
      <div style={{ ...ui.monoLabel, textTransform: "none", marginBottom: 10 }}>{t(locale, "projects.vercelHint")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label={t(locale, "projects.vercelToken")} value={cvToken} onChange={setCvToken} />
        <div className="pm-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label={t(locale, "projects.vercelProject")} value={cvProject} onChange={setCvProject} />
          <Field label={t(locale, "projects.vercelTeam")} value={cvTeam} onChange={setCvTeam} />
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <label style={ui.fieldLabel}>{t(locale, "projects.spec")}</label>
        <div style={{ ...ui.monoLabel, textTransform: "none", marginBottom: 6 }}>{t(locale, "projects.specHint")}</div>
        <textarea value={spec} onChange={(e) => setSpec(e.target.value)} rows={10} style={{ ...ui.input, resize: "vertical", fontSize: 13, lineHeight: 1.5 }} />
        <VisToggles field="spec" vis={vis} setVis={setVis} locale={locale} />
      </div>

      <div style={{ marginTop: 18 }}>
        <label style={ui.fieldLabel}>{t(locale, "projects.devInfo")}</label>
        <div style={{ ...ui.monoLabel, textTransform: "none", marginBottom: 6 }}>{t(locale, "projects.devInfoHint")}</div>
        <textarea value={devInfo} onChange={(e) => setDevInfo(e.target.value)} rows={6} style={{ ...ui.input, resize: "vertical", fontSize: 13, lineHeight: 1.5 }} />
        <VisToggles field="devInfo" vis={vis} setVis={setVis} locale={locale} />
      </div>

      {/* Додаткові поля з реєстру: вмикаються селектом, з’являються у проєкті з полями + видимістю. */}
      <div style={{ ...ui.monoLabel, marginTop: 18, marginBottom: 6 }}>{t(locale, "proj.extraFields")}</div>
      <div style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginBottom: 10 }}>{t(locale, "proj.extraFieldsHint")}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select value={addField} onChange={(e) => setAddField(e.target.value)} style={{ ...ui.input, maxWidth: 260 }}>
          <option value="">—</option>
          {PROJECT_FIELD_DEFS.filter((f) => !enabledFields.includes(f.key)).map((f) => (
            <option key={f.key} value={f.key}>{f.label[locale]}</option>
          ))}
        </select>
        <button onClick={() => { if (addField && !enabledFields.includes(addField)) { setEnabledFields((e) => [...e, addField]); setAddField(""); } }} disabled={!addField} style={{ ...ui.btn, opacity: addField ? 1 : 0.5 }}>{t(locale, "proj.addField")}</button>
      </div>
      {enabledFields.map((key) => {
        const def = getFieldDef(key);
        if (!def) return null;
        return (
          <div key={key} style={{ border: "1px solid var(--border-2)", borderRadius: 6, padding: 12, marginTop: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{def.label[locale]}</span>
              <button onClick={() => setEnabledFields((e) => e.filter((k) => k !== key))} title={t(locale, "proj.removeField")} style={{ marginLeft: "auto", ...ui.monoLabel, color: "#ff5b5b", background: "transparent", border: "1px solid #ff5b5b", padding: "2px 8px", cursor: "pointer", borderRadius: 2 }}>×</button>
            </div>
            <div className="pm-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {def.subs.map((sub) => (
                <div key={sub.key}>
                  <label style={ui.fieldLabel}>{sub.label[locale]}</label>
                  <input
                    value={customFields[key]?.[sub.key] ?? ""}
                    onChange={(e) => setCustomFields((c) => ({ ...c, [key]: { ...(c[key] ?? {}), [sub.key]: e.target.value } }))}
                    style={ui.input}
                  />
                </div>
              ))}
            </div>
            <VisToggles field={key} vis={vis} setVis={setVis} locale={locale} />
          </div>
        );
      })}

      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 18, cursor: "pointer" }}>
        <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, accentColor: "var(--accent)", cursor: "pointer", flexShrink: 0 }} />
        <span>
          <span style={{ fontSize: 14 }}>{t(locale, "projects.autoApprove")}</span>
          <span style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", display: "block", marginTop: 2 }}>{t(locale, "projects.autoApproveHint")}</span>
        </span>
      </label>

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
