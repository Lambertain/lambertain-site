"use client";

import { useState, useTransition } from "react";
import { setApproval } from "../../tasks-actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../../ui-styles";

/** Полоса утверждения задачи (показывается, пока approval_status = pending). */
export function ApprovalBar({ id, canApprove, creator, locale }: { id: string; canApprove: boolean; creator?: string | null; locale: Locale }) {
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);
  const [pending, start] = useTransition();

  function act(status: "approved" | "rejected") {
    start(async () => {
      const r = await setApproval(id, status);
      if (!r.error) setDone(status);
    });
  }

  if (done) {
    return (
      <div style={{ ...ui.card, marginTop: 16, padding: 14, borderColor: done === "approved" ? "var(--accent-line)" : "#ff5b5b" }}>
        <span style={{ ...ui.monoLabel, color: done === "approved" ? "var(--accent)" : "#ff5b5b" }}>
          {t(locale, done === "approved" ? "approval.approvedOk" : "approval.rejectedOk")}
        </span>
      </div>
    );
  }

  return (
    <div style={{ ...ui.card, marginTop: 16, padding: 14, borderColor: "#e8b339" }}>
      <div style={{ ...ui.monoLabel, color: "#e8b339" }}>{t(locale, "approval.pending")}</div>
      <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginTop: 6 }}>
        {t(locale, "approval.hint")}{creator ? ` · ${t(locale, "approval.by", { name: creator })}` : ""}
      </p>
      {canApprove && (
        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <button onClick={() => act("approved")} disabled={pending} style={{ ...ui.btnAccent, opacity: pending ? 0.5 : 1 }}>{t(locale, "approval.approve")}</button>
          <button onClick={() => act("rejected")} disabled={pending} style={{ ...ui.btn, opacity: pending ? 0.5 : 1 }}>{t(locale, "approval.reject")}</button>
        </div>
      )}
    </div>
  );
}
