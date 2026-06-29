"use client";

import { useState, useTransition } from "react";
import { previewDeliver, runDeliver, setAutoDeliver, type DeliverResultUI } from "./deliver-actions";
import type { DeliveryPreview, AutoDeliverIssue } from "@/lib/deliver";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../../ui-styles";

export function DeliverPanel({ projectKey, locale, autoMigrate, autoDeliver, deliverBranch, initialIssues }: { projectKey: string; locale: Locale; autoMigrate?: boolean; autoDeliver?: boolean; deliverBranch?: string; initialIssues?: AutoDeliverIssue[] | null }) {
  const [auto, setAuto] = useState(!!autoDeliver);
  const [issues, setIssues] = useState<AutoDeliverIssue[] | null>(initialIssues ?? null);
  const [, startAuto] = useTransition();
  function toggleAuto(next: boolean) {
    setAuto(next); // оптимистично
    if (!next) setIssues(null);
    startAuto(async () => {
      const r = await setAutoDeliver(projectKey, next);
      if (r.error) { setAuto(!next); return; } // откат при ошибке
      if (next) setIssues(r.issues ?? []); // показать чего не хватает (или ✓ если всё ок)
    });
  }
  const [preview, setPreview] = useState<DeliveryPreview | null>(null);
  const [branch, setBranch] = useState("");
  const [schemaOk, setSchemaOk] = useState(false);
  const [results, setResults] = useState<DeliverResultUI[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [running, startRun] = useTransition();

  function open() {
    setError(null); setResults(null); setSchemaOk(false);
    startLoad(async () => {
      const r = await previewDeliver(projectKey);
      if (r.error) setError(r.error);
      else if (r.preview) { setPreview(r.preview); setBranch(deliverBranch?.trim() || r.preview.clientDefaultBranch); }
    });
  }
  // Авто-накат: флаг проекта ИЛИ обнаружено в коде, что деплой сам катит миграции (migratesOnDeploy).
  const autoMig = (p: DeliveryPreview) => !!autoMigrate || p.migratesOnDeploy;
  const schemaBlocks = (p: DeliveryPreview) => p.schemaChanges.length > 0 && !autoMig(p) && !schemaOk;
  function deliver() {
    if (!preview) return;
    if (schemaBlocks(preview)) return;
    setError(null);
    startRun(async () => {
      const r = await runDeliver(projectKey, branch, schemaOk);
      if (r.error) setError(r.error);
      else { setResults(r.results ?? null); setPreview(null); }
    });
  }

  const toMain = preview && branch.trim() === preview.clientDefaultBranch;

  return (
    <div style={{ ...ui.card, marginTop: 16 }}>
      <div style={ui.monoLabel}>{t(locale, "deliver.title")}</div>
      <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginTop: 6 }}>{t(locale, "deliver.hint")}</p>

      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={auto} onChange={(e) => toggleAuto(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, accentColor: "var(--accent)", cursor: "pointer", flexShrink: 0 }} />
        <span>
          <span style={{ fontSize: 14 }}>{t(locale, "deliver.auto")}</span>
          <span style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", display: "block", marginTop: 2 }}>{t(locale, "deliver.autoHint")}</span>
        </span>
      </label>

      {auto && issues && (
        <div style={{ ...ui.card, padding: 12, marginTop: 10, borderColor: issues.some((i) => i.level === "error") ? "#ff5b5b" : issues.length ? "#e8b339" : "var(--accent-line)" }}>
          {issues.length === 0 ? (
            <div style={{ ...ui.monoLabel, textTransform: "none", color: "var(--accent)" }}>✓ {t(locale, "deliver.chk.ready")}</div>
          ) : (
            <>
              <div style={{ ...ui.monoLabel, color: issues.some((i) => i.level === "error") ? "#ff5b5b" : "#e8b339" }}>{t(locale, "deliver.chk.title")}</div>
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
                {issues.map((iss, idx) => (
                  <li key={iss.code + idx} style={{ ...ui.monoLabel, textTransform: "none", color: iss.level === "error" ? "#ff5b5b" : "#e8b339", lineHeight: 1.5 }}>
                    {iss.level === "error" ? "✖ " : "⚠ "}{t(locale, `deliver.chk.${iss.code}`, iss.fields ? { fields: iss.fields } : undefined)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {!preview && !results && (
        <button onClick={open} disabled={loading} style={{ ...ui.btnAccent, marginTop: 12, opacity: loading ? 0.5 : 1 }}>
          {loading ? t(locale, "common.processing") : t(locale, "deliver.open")}
        </button>
      )}

      {preview && (
        <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <div style={{ ...ui.monoLabel, textTransform: "none" }}>
            {t(locale, "deliver.files", { n: String(preview.fileCount) })} · {preview.devRepo} → {preview.clientRepo}
          </div>

          {preview.schemaChanges.length > 0 && (
            <div style={{ ...ui.card, padding: 12, marginTop: 10, borderColor: autoMig(preview) ? "var(--accent-line)" : "#ff5b5b" }}>
              <div style={{ ...ui.monoLabel, color: autoMig(preview) ? "var(--accent)" : "#ff5b5b" }}>{t(locale, "deliver.schemaChanged", { n: String(preview.schemaChanges.length) })}</div>
              <div style={{ ...ui.monoLabel, textTransform: "none", marginTop: 6, whiteSpace: "pre-wrap" }}>{preview.schemaChanges.join("\n")}</div>
              {autoMig(preview) ? (
                <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginTop: 8 }}>
                  {preview.migratesOnDeploy ? t(locale, "deliver.schemaAutoDetected", { mech: preview.migrateMechanism || "" }) : t(locale, "deliver.schemaAuto")}
                </p>
              ) : (
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, cursor: "pointer", fontSize: 13 }}>
                  <input type="checkbox" checked={schemaOk} onChange={(e) => setSchemaOk(e.target.checked)} style={{ width: 15, height: 15, accentColor: "var(--accent)" }} />
                  {t(locale, "deliver.schemaConfirm")}
                </label>
              )}
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <label style={ui.fieldLabel}>{t(locale, "deliver.branch")}</label>
            <input value={branch} onChange={(e) => setBranch(e.target.value)} style={{ ...ui.input, maxWidth: 320 }} />
            <p style={{ ...ui.monoLabel, textTransform: "none", color: toMain ? "#e8b339" : "var(--muted)", marginTop: 6 }}>
              {toMain ? t(locale, "deliver.toMain") : t(locale, "deliver.toBranch")}
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button
              onClick={deliver}
              disabled={running || schemaBlocks(preview)}
              style={{ ...ui.btnAccent, opacity: running || schemaBlocks(preview) ? 0.5 : 1 }}
            >
              {running ? t(locale, "common.processing") : t(locale, "deliver.run")}
            </button>
            <button onClick={() => setPreview(null)} style={ui.btn}>{t(locale, "common.cancel")}</button>
          </div>
        </div>
      )}

      {results && results.length > 0 && (
        <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          {results.map((result, i) => (
            <div key={result.clientRepo + i} style={{ marginTop: i ? 14 : 0, paddingTop: i ? 14 : 0, borderTop: i ? "1px solid var(--border)" : "none" }}>
              <div style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)" }}>{result.clientRepo}</div>
              <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--accent)", marginTop: 4 }}>
                {t(locale, "deliver.done", { n: String(result.files), branch: result.branch })}
              </p>
              <a href={result.commitUrl} target="_blank" rel="noopener noreferrer" style={{ ...ui.btn, display: "inline-block", marginTop: 8, textDecoration: "none" }}>
                {t(locale, "deliver.commit")} →
              </a>
              {result.prUrl && (
                <a href={result.prUrl} target="_blank" rel="noopener noreferrer" style={{ ...ui.btnAccent, display: "inline-block", marginTop: 8, marginLeft: 8, textDecoration: "none" }}>
                  {t(locale, "deliver.pr")} →
                </a>
              )}
              {result.deploy && (() => {
                const d = result.deploy;
                const ok = d.status === "SUCCESS" && d.matched !== false;
                const bad = d.status === "FAILED" || d.status === "CRASHED" || d.status === "ERROR";
                const color = ok ? "var(--accent)" : bad ? "#ff5b5b" : "#e8b339";
                return (
                  <div style={{ ...ui.monoLabel, textTransform: "none", marginTop: 10, color, lineHeight: 1.55 }}>
                    <div>{t(locale, "deliver.deploy")}: {ok ? `✓ ${t(locale, "deliver.deployLive")}` : `⚠ ${d.status}`}{d.commit ? ` (${d.commit})` : ""}</div>
                    {d.matched === false && <div>⚠️ {t(locale, "deliver.deployStale")}</div>}
                    {d.note && <div>{d.note}</div>}
                  </div>
                );
              })()}
            </div>
          ))}
          <button onClick={() => setResults(null)} style={{ ...ui.btn, display: "block", marginTop: 12 }}>{t(locale, "common.cancel")}</button>
        </div>
      )}

      {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 10 }}>{error}</p>}
    </div>
  );
}
