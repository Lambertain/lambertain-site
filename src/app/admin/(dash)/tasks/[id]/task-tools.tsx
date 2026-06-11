"use client";

import { useState, useTransition } from "react";
import { requestAiReview } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../../ui-styles";

/** Инструменты задачи для админа: ИИ-ревью кода. Зависимости задач ставит ИИ при планировании — ручного редактора нет. */
export function TaskTools({ id, locale }: { id: string; locale: Locale }) {
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);
  const [reviewing, startReview] = useTransition();

  function review() {
    setReviewMsg(null);
    startReview(async () => {
      const r = await requestAiReview(id);
      if (r.error) setReviewMsg(r.error);
      else setReviewMsg(t(locale, r.verdict === "approve" ? "review.doneApprove" : "review.doneRework"));
    });
  }

  return (
    <div style={{ ...ui.card, marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button onClick={review} disabled={reviewing} style={{ ...ui.btn, opacity: reviewing ? 0.5 : 1 }}>
          {reviewing ? t(locale, "review.running") : t(locale, "review.request")}
        </button>
        <span style={{ ...ui.monoLabel, textTransform: "none" }}>{t(locale, "review.hint")}</span>
      </div>
      {reviewMsg && <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--accent)", marginTop: 8 }}>{reviewMsg}</p>}
    </div>
  );
}
