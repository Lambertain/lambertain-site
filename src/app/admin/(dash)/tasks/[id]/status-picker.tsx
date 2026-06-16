"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTaskStatus, moveToReview } from "../../tasks-actions";
import { STATUSES, statusColor, statusBucket } from "@/lib/statuses";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../../ui-styles";

/** Смена статуса прямо на странице задачи (как в списке). Review → поле ссылки на код (moveToReview). */
export function StatusPicker({ taskId, status: initial, locale }: { taskId: string; status: string; locale: Locale }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [menu, setMenu] = useState(false);
  const [reviewRef, setReviewRef] = useState<string | null>(null);
  const [, start] = useTransition();

  function pick(s: string) {
    setMenu(false);
    if (statusBucket(s) === "review") { setReviewRef(""); return; }
    setStatus(s);
    start(async () => { await updateTaskStatus(taskId, s); router.refresh(); });
  }
  function submitReview() {
    const ref = reviewRef ?? "";
    setReviewRef(null);
    setStatus("Review");
    start(async () => { await moveToReview(taskId, ref); router.refresh(); });
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setMenu((v) => !v)}
        style={{ ...ui.monoLabel, padding: "4px 10px", border: `1px solid ${statusColor(status)}`, color: statusColor(status), background: "transparent", cursor: "pointer" }}
      >
        {status} ▾
      </button>
      {menu && (
        <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: "var(--surface-2)", border: "1px solid var(--border-2)", zIndex: 30, minWidth: 130 }}>
          {STATUSES.map((s) => (
            <button key={s} onClick={() => pick(s)} style={{ ...ui.monoLabel, display: "block", width: "100%", textAlign: "left", padding: "8px 10px", background: "transparent", border: "none", color: statusColor(s), cursor: "pointer" }}>
              {s}
            </button>
          ))}
        </div>
      )}
      {reviewRef !== null && (
        <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 30, ...ui.card, padding: 10, width: 280 }}>
          <label style={{ ...ui.monoLabel, textTransform: "none" }}>{t(locale, "review.refLabel")}</label>
          <input autoFocus value={reviewRef} onChange={(e) => setReviewRef(e.target.value)} placeholder={t(locale, "review.refPlaceholder")} style={{ ...ui.input, width: "100%", marginTop: 6 }} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={submitReview} style={ui.btnAccent}>{t(locale, "review.send")}</button>
            <button onClick={() => setReviewRef(null)} style={ui.btn}>{t(locale, "common.cancel")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
