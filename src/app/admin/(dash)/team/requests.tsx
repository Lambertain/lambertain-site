"use client";

import { useState, useTransition } from "react";
import { approveAccess, rejectAccess } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../ui-styles";

type Proj = { key: string; name: string };
type Req = { tg_id: number; username: string | null; full_name: string | null; requested_role: string };

function roleKey(role: string): string {
  return role === "client" ? "role.client" : role === "employee" ? "role.employee" : "role.contributor";
}

function RequestRow({ req, projects, locale }: { req: Req; projects: Proj[]; locale: Locale }) {
  const [projectKey, setProjectKey] = useState("");
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const needsProject = req.requested_role !== "contributor";

  if (done) {
    return (
      <div style={{ ...ui.card, padding: 14 }}>
        <span style={{ ...ui.monoLabel, color: done === "approved" ? "var(--accent)" : "var(--muted)" }}>
          {req.full_name || req.tg_id} — {done === "approved" ? t(locale, "team.approved") : t(locale, "team.rejected")}
        </span>
      </div>
    );
  }

  return (
    <div style={{ ...ui.card, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{req.full_name || "—"}</span>
        {req.username && <span style={ui.monoLabel}>@{req.username}</span>}
        <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>
          {t(locale, "team.wants")}
          {t(locale, roleKey(req.requested_role))}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10 }} className="pm-grid-2">
        <select value={projectKey} onChange={(e) => setProjectKey(e.target.value)} style={ui.input}>
          <option value="">{needsProject ? t(locale, "field.project") : "—"}</option>
          {projects.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await approveAccess(req.tg_id, req.username, req.full_name || "", req.requested_role as "client" | "contributor" | "employee", projectKey);
              if (r.error) setError(r.error);
              else setDone("approved");
            })
          }
          disabled={pending || (needsProject && !projectKey)}
          style={{ ...ui.btnAccent, opacity: pending || (needsProject && !projectKey) ? 0.5 : 1 }}
        >
          {t(locale, "team.approve")}
        </button>
        <button onClick={() => start(async () => { await rejectAccess(req.tg_id); setDone("rejected"); })} disabled={pending} style={ui.btn}>
          {t(locale, "team.reject")}
        </button>
      </div>
      {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 8 }}>{error}</p>}
    </div>
  );
}

export function AccessRequests({ requests, projects, locale }: { requests: Req[]; projects: Proj[]; locale: Locale }) {
  if (!requests.length) return null;
  return (
    <div style={{ marginTop: 28 }}>
      <div style={ui.monoLabel}>{t(locale, "team.pendingKicker")}</div>
      <h2 style={{ ...ui.h1, fontSize: 22, marginTop: 8, marginBottom: 14 }}>{t(locale, "team.requestsTitle")}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {requests.map((r) => (
          <RequestRow key={r.tg_id} req={r} projects={projects} locale={locale} />
        ))}
      </div>
    </div>
  );
}
