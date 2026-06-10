"use client";

import { useState, useTransition } from "react";
import { approveAccess, rejectAccess } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../ui-styles";

type Usr = { login: string; fullName: string; role: string };
type Req = { tg_id: number; username: string | null; full_name: string | null; requested_role: string };

function RequestRow({ req, users, locale }: { req: Req; users: Usr[]; locale: Locale }) {
  const [login, setLogin] = useState("");
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
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{req.full_name || "—"}</span>
        {req.username && <span style={ui.monoLabel}>@{req.username}</span>}
        <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{t(locale, "team.wants")}{roleRu}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10 }}>
        <select value={login} onChange={(e) => setLogin(e.target.value)} style={ui.input}>
          <option value="">{t(locale, "team.login")}</option>
          {users.map((u) => (
            <option key={u.login} value={u.login}>
              {u.fullName} ({u.login})
            </option>
          ))}
        </select>
        <button
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await approveAccess(req.tg_id, req.full_name || "", login, req.requested_role as "client" | "contributor");
              if (r.error) setError(r.error);
              else setDone("approved");
            })
          }
          disabled={pending || !login}
          style={{ ...ui.btnAccent, opacity: pending || !login ? 0.5 : 1 }}
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
      {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 8 }}>{error}</p>}
    </div>
  );
}

export function AccessRequests({ requests, users, locale }: { requests: Req[]; users: Usr[]; locale: Locale }) {
  if (!requests.length) return null;
  return (
    <div style={{ marginTop: 28 }}>
      <div style={ui.monoLabel}>{t(locale, "team.pendingKicker")}</div>
      <h2 style={{ ...ui.h1, fontSize: 22, marginTop: 8, marginBottom: 14 }}>{t(locale, "team.requestsTitle")}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {requests.map((r) => (
          <RequestRow key={r.tg_id} req={r} users={users} locale={locale} />
        ))}
      </div>
    </div>
  );
}
