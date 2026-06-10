"use client";

import { useState } from "react";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../ui-styles";

type Skill = { slug: string; title: string; triggers: string; playbook: string; auto_generated: boolean };

export function SkillCard({ skill, locale, autoLabel }: { skill: Skill; locale: Locale; autoLabel: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ ...ui.card, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{skill.title}</span>
        <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{skill.slug}</span>
        {skill.auto_generated && <span style={{ ...ui.monoLabel, color: "#e8b339" }}>{autoLabel}</span>}
      </div>
      <div style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginBottom: 8 }}>{skill.triggers}</div>

      <div
        style={{
          position: "relative",
          maxHeight: open ? "none" : 132,
          overflow: "hidden",
        }}
      >
        <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.5, color: "var(--text)" }}>{skill.playbook}</div>
        {!open && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 48,
              background: "linear-gradient(transparent, var(--surface))",
              pointerEvents: "none",
            }}
          />
        )}
      </div>

      <button onClick={() => setOpen((v) => !v)} style={{ ...ui.btn, padding: "4px 12px", marginTop: 10 }}>
        {open ? t(locale, "skills.collapse") : t(locale, "skills.expand")}
      </button>
    </div>
  );
}
