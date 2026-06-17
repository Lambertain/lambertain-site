"use client";

import { useState } from "react";
import { BriefForm } from "./brief-form";
import { BriefChat } from "./brief-chat";
import { type Lang } from "./brief-schema";
import { ui } from "../../admin/ui-styles";

const T = {
  pick: { uk: "Як вам зручніше заповнити бриф?", ru: "Как вам удобнее заполнить бриф?" },
  intro: { uk: "Оберіть формат — питання однакові, результат теж.", ru: "Выберите формат — вопросы одинаковые, результат тоже." },
  formTitle: { uk: "Форма", ru: "Форма" },
  formDesc: { uk: "Усі питання на одному екрані — заповнюєте у будь-якому порядку, бачите все одразу.", ru: "Все вопросы на одном экране — заполняете в любом порядке, видите всё сразу." },
  chatTitle: { uk: "Чат", ru: "Чат" },
  chatDesc: { uk: "Діалог по одному питанню — як переписка. Простіше, коли не хочеться дивитись на довгу форму.", ru: "Диалог по одному вопросу — как переписка. Проще, когда не хочется смотреть на длинную форму." },
} as const;

/** Первый экран брифа: выбор формата (форма ↔ чат) — A/B, смотрим, что в спросе. */
export function BriefIntake({ token }: { token: string }) {
  const [mode, setMode] = useState<"form" | "chat" | null>(null);
  const [lang, setLang] = useState<Lang>("uk");

  if (mode === "form") return <BriefForm token={token} />;
  if (mode === "chat") return <BriefChat token={token} />;

  const card = (m: "form" | "chat", title: string, desc: string, icon: React.ReactNode) => (
    <button
      onClick={() => setMode(m)}
      style={{ ...ui.card, textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: 10, padding: 20, transition: "border-color .15s" }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: "var(--accent)", display: "flex" }}>{icon}</span>
        <span style={{ ...ui.h1, fontSize: 19 }}>{title}</span>
      </span>
      <span style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.55 }}>{desc}</span>
    </button>
  );

  return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: "32px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={ui.monoLabel}>Lambertain</div>
          <h1 style={{ ...ui.h1, fontSize: 26, marginTop: 8 }}>{T.pick[lang]}</h1>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {(["uk", "ru"] as const).map((l) => (
            <button key={l} onClick={() => setLang(l)} style={{ ...ui.monoLabel, background: "none", border: "none", cursor: "pointer", padding: "4px 6px", color: lang === l ? "var(--text)" : "var(--muted)", textDecoration: lang === l ? "underline" : "none" }}>{l.toUpperCase()}</button>
          ))}
        </div>
      </div>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 10, lineHeight: 1.6 }}>{T.intro[lang]}</p>

      <div style={{ display: "grid", gap: 12, marginTop: 22 }}>
        {card("form", T.formTitle[lang], T.formDesc[lang], (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="7" y1="8" x2="17" y2="8" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="7" y1="16" x2="13" y2="16" /></svg>
        ))}
        {card("chat", T.chatTitle[lang], T.chatDesc[lang], (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        ))}
      </div>
    </div>
  );
}
