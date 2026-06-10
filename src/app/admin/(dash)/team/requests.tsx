"use client";

import { useState, useTransition } from "react";
import { approveAccess, rejectAccess } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../ui-styles";

type Req = { tg_id: number; username: string | null; full_name: string | null; requested_role: string };

function RequestRow({ req, locale }: { req: Req; locale: Locale }) {
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const roleRu = req.requested_role === "client" ? t(locale, "role.client") : t(locale, "role.contributor");

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
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{req.full_name || "—"}</span>
        {req.username && <span style={ui.monoLabel}>@{req.username}</span>}
        <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>
          {t(locale, "team.wants")}
          {roleRu}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <button
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await approveAccess(
                  req.tg_id,
                  req.username,
                  req.full_name || "",
                  req.requested_role as "client" | "contributor",
                );
                if (r.error) setError(r.error);
                else setDone("approved");
              })
            }
            disabled={pending}
            style={{ ...ui.btnAccent, opacity: pending ? 0.5 : 1 }}
          >
            {t(locale, "team.approve")}
          </button>
          <button
            onClick={() =>
              start(async () => {
                await rejectAccess(req.tg_id);
                setDone("rejected");
              })
            }
            disabled={pending}
            style={ui.btn}
          >
            {t(locale, "team.reject")}
          </button>
        </div>
      </div>
      {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 8 }}>{error}</p>}
    </div>
  );
}

export function AccessRequests({ requests, locale }: { requests: Req[]; locale: Locale }) {
  if (!requests.length) return null;
  return (
    <div style={{ marginTop: 28 }}>
      <div style={ui.monoLabel}>{t(locale, "team.pendingKicker")}</div>
      <h2 style={{ ...ui.h1, fontSize: 22, marginTop: 8, marginBottom: 14 }}>{t(locale, "team.requestsTitle")}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {requests.map((r) => (
          <RequestRow key={r.tg_id} req={r} locale={locale} />
        ))}
      </div>
    </div>
  );
}
