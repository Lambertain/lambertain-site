"use client";

import { useActionState } from "react";
import { login } from "../auth-actions";
import { ui } from "../ui-styles";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <div style={{ ...ui.page, display: "grid", placeItems: "center" }}>
      <form action={action} style={{ ...ui.card, width: 340, display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <div style={ui.monoLabel}>Lambertain</div>
          <h1 style={{ ...ui.h1, fontSize: 30, marginTop: 8 }}>
            PM<span style={{ color: "var(--accent)" }}>.</span>
          </h1>
        </div>
        <div>
          <label style={ui.fieldLabel}>Пароль</label>
          <input type="password" name="password" autoFocus style={ui.input} />
        </div>
        {state?.error && (
          <span style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none" }}>{state.error}</span>
        )}
        <button type="submit" disabled={pending} style={{ ...ui.btnAccent, opacity: pending ? 0.6 : 1 }}>
          {pending ? "Вход…" : "Войти"}
        </button>
      </form>
    </div>
  );
}
