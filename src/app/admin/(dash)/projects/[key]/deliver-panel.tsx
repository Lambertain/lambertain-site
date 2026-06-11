"use client";

import { useState, useTransition } from "react";
import { previewDeliver, runDeliver, type DeliverResultUI } from "./deliver-actions";
import type { DeliveryPreview } from "@/lib/deliver";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../../ui-styles";

export function DeliverPanel({ projectKey, locale }: { projectKey: string; locale: Locale }) {
  const [preview, setPreview] = useState<DeliveryPreview | null>(null);
  const [branch, setBranch] = useState("");
  const [schemaOk, setSchemaOk] = useState(false);
  const [result, setResult] = useState<DeliverResultUI | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [running, startRun] = useTransition();

  function open() {
    setError(null); setResult(null); setSchemaOk(false);
    startLoad(async () => {
      const r = await previewDeliver(projectKey);
      if (r.error) setError(r.error);
      else if (r.preview) { setPreview(r.preview); setBranch(r.preview.clientDefaultBranch); }
    });
  }
  function deliver() {
    if (!preview) return;
    if (preview.schemaChanges.length > 0 && !schemaOk) return;
    setError(null);
    startRun(async () => {
      const r = await runDeliver(projectKey, branch, schemaOk);
      if (r.error) setError(r.error);
      else { setResult(r.result ?? null); setPreview(null); }
    });
  }

  const toMain = preview && branch.trim() === preview.clientDefaultBranch;

  return (
    <div style={{ ...ui.card, marginTop: 16 }}>
      <div style={ui.monoLabel}>{t(locale, "deliver.title")}</div>
      <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginTop: 6 }}>{t(locale, "deliver.hint")}</p>

      {!preview && !result && (
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
            <div style={{ ...ui.card, padding: 12, marginTop: 10, borderColor: "#ff5b5b" }}>
              <div style={{ ...ui.monoLabel, color: "#ff5b5b" }}>{t(locale, "deliver.schemaChanged", { n: String(preview.schemaChanges.length) })}</div>
              <div style={{ ...ui.monoLabel, textTransform: "none", marginTop: 6, whiteSpace: "pre-wrap" }}>{preview.schemaChanges.join("\n")}</div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={schemaOk} onChange={(e) => setSchemaOk(e.target.checked)} style={{ width: 15, height: 15, accentColor: "var(--accent)" }} />
                {t(locale, "deliver.schemaConfirm")}
              </label>
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
              disabled={running || (preview.schemaChanges.length > 0 && !schemaOk)}
              style={{ ...ui.btnAccent, opacity: running || (preview.schemaChanges.length > 0 && !schemaOk) ? 0.5 : 1 }}
            >
              {running ? t(locale, "common.processing") : t(locale, "deliver.run")}
            </button>
            <button onClick={() => setPreview(null)} style={ui.btn}>{t(locale, "common.cancel")}</button>
          </div>
        </div>
      )}

      {result && (
        <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--accent)" }}>
            {t(locale, "deliver.done", { n: String(result.files), branch: result.branch })}
          </p>
          <a href={result.commitUrl} target="_blank" rel="noopener noreferrer" style={{ ...ui.btn, display: "inline-block", marginTop: 8, textDecoration: "none" }}>
            {t(locale, "deliver.commit")} →
          </a>
          {result.deploy && (
            <p style={{ ...ui.monoLabel, textTransform: "none", marginTop: 10, color: result.deploy.status === "SUCCESS" ? "var(--accent)" : "#e8b339" }}>
              {t(locale, "deliver.deploy")}: {result.deploy.status} ({result.deploy.commit})
            </p>
          )}
          <button onClick={() => setResult(null)} style={{ ...ui.btn, display: "block", marginTop: 12 }}>{t(locale, "common.cancel")}</button>
        </div>
      )}

      {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 10 }}>{error}</p>}
    </div>
  );
}
