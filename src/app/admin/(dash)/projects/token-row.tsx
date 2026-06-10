"use client";

import { useState, useTransition } from "react";
import { generateProjectToken } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../ui-styles";

const BASE = "https://www.lambertain.site";

function snippet(projectKey: string, token: string): string {
  return (
    `## Задачи проекта (Lambertain PM)\n` +
    `GET ${BASE}/api/dev/tasks  — открытые задачи\n` +
    `GET ${BASE}/api/dev/tasks?all=1  — все\n` +
    `GET ${BASE}/api/dev/tasks?id=${projectKey}-42  — одна задача с комментариями\n` +
    `Заголовок: Authorization: Bearer ${token}`
  );
}

export function TokenRow({
  projectKey,
  name,
  initialToken,
  locale,
}: {
  projectKey: string;
  name: string;
  initialToken: string | null;
  locale: Locale;
}) {
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState<"" | "token" | "snippet">("");
  const [pending, start] = useTransition();

  function gen() {
    start(async () => {
      const r = await generateProjectToken(projectKey);
      if (r.token) setToken(r.token);
    });
  }
  function copy(what: "token" | "snippet") {
    const v = what === "token" ? token! : snippet(projectKey, token!);
    navigator.clipboard.writeText(v);
    setCopied(what);
  }

  return (
    <div style={{ ...ui.card, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: token ? 12 : 0, flexWrap: "wrap" }}>
        <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{projectKey}</span>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{name}</span>
        <button onClick={gen} disabled={pending} style={{ ...ui.btn, padding: "6px 12px", marginLeft: "auto" }}>
          {pending ? "…" : token ? t(locale, "projects.regenToken") : t(locale, "projects.genToken")}
        </button>
      </div>

      {token && (
        <>
          <label style={ui.fieldLabel}>{t(locale, "projects.tokenLabel")}</label>
          <div style={{ display: "flex", gap: 10 }}>
            <input readOnly value={token} style={{ ...ui.input, fontFamily: "var(--font-mono)", fontSize: 12 }} />
            <button onClick={() => copy("token")} style={ui.btn}>
              {copied === "token" ? t(locale, "common.copied") : t(locale, "common.copy")}
            </button>
          </div>
          <label style={{ ...ui.fieldLabel, marginTop: 12 }}>{t(locale, "projects.snippetLabel")}</label>
          <pre
            style={{
              ...ui.input,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              whiteSpace: "pre-wrap",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {snippet(projectKey, token)}
          </pre>
          <button onClick={() => copy("snippet")} style={{ ...ui.btn, marginTop: 8 }}>
            {copied === "snippet" ? t(locale, "common.copied") : t(locale, "common.copy")}
          </button>
        </>
      )}
    </div>
  );
}
