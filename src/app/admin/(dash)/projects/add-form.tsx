"use client";

import { useActionState } from "react";
import { addProject } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../ui-styles";

export function AddProjectForm({ locale }: { locale: Locale }) {
  const [state, action, pending] = useActionState(addProject, undefined);
  return (
    <form action={action} style={{ ...ui.card, marginTop: 20, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <label style={ui.fieldLabel}>{t(locale, "projects.name")}</label>
        <input name="name" style={ui.input} />
      </div>
      <button type="submit" disabled={pending} style={{ ...ui.btnAccent, opacity: pending ? 0.5 : 1 }}>
        {t(locale, "projects.add")}
      </button>
      {state?.error && <span style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", width: "100%" }}>{state.error}</span>}
    </form>
  );
}
