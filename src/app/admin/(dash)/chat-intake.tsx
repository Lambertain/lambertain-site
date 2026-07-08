"use client";

import { useState, useRef, useTransition, useEffect } from "react";
import { detectFeminine } from "@/lib/gender-check";
import { t, type Locale } from "@/lib/i18n";
import { RichComposer, type RichComposerHandle } from "./rich-composer";
import { ui } from "../ui-styles";

type Proj = { key: string; name: string; warrantyExpired?: boolean };
type Created = { id: string; url: string };

// Черновик задачи в localStorage — чтобы введённый текст не пропал при случайном обновлении страницы.
// (Деплой больше не форсит перезагрузку: отправка идёт fetch-ом, а не Server Action.) Картинки в черновик не пишем.
const DRAFT_KEY = "lamb:intake-draft";

export function ChatIntake({ projects, locale, fill, isContributor, isAdmin, feedbackKey, lockedProject, onCreated }: { projects: Proj[]; locale: Locale; fill?: boolean; isContributor?: boolean; isAdmin?: boolean; feedbackKey?: string; lockedProject?: string; onCreated?: (id: string, url: string) => void }) {
  // lockedProject — проект уже выбран явным шагом до формы; иначе дефолт — первый НЕ-фидбек проект.
  const [projectKey, setProjectKey] = useState(lockedProject ?? (projects.find((p) => p.key !== feedbackKey) ?? projects[0])?.key ?? "");
  const [recipient, setRecipient] = useState<"admin" | "client">("admin");
  const [selfTask, setSelfTask] = useState(false);
  const [clientTask, setClientTask] = useState(false); // супер-админ/админ: задача-вопрос клиенту
  const [fromClientTask, setFromClientTask] = useState(false); // супер-админ/админ: задача разработчику ОТ ИМЕНИ клиента
  const [title, setTitle] = useState("");
  const [bodyText, setBodyText] = useState(""); // плоский текст из редактора — для предупреждения о роде и черновика
  const [created, setCreated] = useState<Created | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [titleInvalid, setTitleInvalid] = useState(false); // подсветить поле заголовка красным, если создавали без него
  const [pending, start] = useTransition();
  const composerRef = useRef<RichComposerHandle>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // —— восстановление черновика (текст) после монтирования: сначала читаем, потом монтируем редактор ——
  const [ready, setReady] = useState(false);
  const [draftText, setDraftText] = useState("");
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { title?: string; body?: string; projectKey?: string };
        if (d.title) setTitle(d.title);
        if (d.body) { setDraftText(d.body); setBodyText(d.body); }
        if (d.projectKey && projects.some((p) => p.key === d.projectKey) && !lockedProject) setProjectKey(d.projectKey);
      }
    } catch { /* ignore */ }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      if (title.trim() || bodyText.trim()) localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, body: bodyText, projectKey }));
      else localStorage.removeItem(DRAFT_KEY);
    } catch { /* ignore */ }
  }, [title, bodyText, projectKey]);

  const isFeedbackSel = !!feedbackKey && projectKey === feedbackKey;
  const showRecipient = !!isContributor && !isFeedbackSel; // разработчик в обычном проекте — выбирает адресата
  const showSelf = !!isAdmin && !isFeedbackSel; // супер-админ — может поставить задачу СЕБЕ / клиенту / от клиента
  const femWords = showRecipient && recipient === "client" ? detectFeminine(title + " " + bodyText) : [];

  function createTask() {
    if (!title.trim()) {
      setError(t(locale, "request.titleRequired"));
      setTitleInvalid(true);
      titleRef.current?.focus(); // курсор сразу в поле — видно, чего не хватает
      return;
    }
    if (!projectKey) return;
    const blocks = composerRef.current?.getContent().blocks ?? [];
    setError(null);
    setTitleInvalid(false);
    start(async () => {
      const rcpt = showRecipient ? recipient : showSelf && selfTask ? "self" : showSelf && clientTask ? "client" : showSelf && fromClientTask ? "from_client" : undefined;
      try {
        // fetch к API-роуту (не Server Action): деплой не форсит перезагрузку, скрины не теряются.
        // Без выбора клиент-facing (client/from_client) задача от админа — внутренняя (клиент не видит), это дефолт в бэке.
        const r = await fetch("/api/portal/create-task", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectKey, title: title.trim(), blocks, recipient: rcpt }),
        });
        const res = (await r.json().catch(() => ({}))) as { id?: string; url?: string; error?: string };
        if (res.error) setError(res.error);
        else if (res.id && res.url) {
          setTitle(""); setBodyText(""); composerRef.current?.clear();
          try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
          // DEV-15: не показываем зелёную плашку — сразу возврат в список (родитель закроет модалку + тост «Створено»).
          if (onCreated) onCreated(res.id, res.url);
          else setCreated({ id: res.id, url: res.url });
        } else {
          setError(t(locale, "request.sendFailed"));
        }
      } catch {
        setError(t(locale, "request.sendFailed"));
      }
    });
  }

  function startOver() { setCreated(null); setTitle(""); setBodyText(""); composerRef.current?.clear(); setError(null); try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } }

  if (created) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: fill ? "100%" : "auto", flex: fill ? 1 : undefined, marginTop: fill ? 0 : 12, border: "1px solid var(--border)", background: "var(--surface)", padding: 20, gap: 14 }}>
        <div style={{ ...ui.card, borderColor: "var(--accent-line)", background: "rgba(185,255,75,0.06)" }}>
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>{t(locale, "request.sent")}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10 }}>
            <a href={created.url} style={{ ...ui.monoLabel, color: "var(--accent)", textDecoration: "none" }}>{created.id} →</a>
            <button onClick={startOver} style={{ ...ui.monoLabel, color: "var(--muted)", background: "transparent", border: "1px solid var(--border-2)", padding: "5px 10px", cursor: "pointer", borderRadius: 2 }}>{t(locale, "request.another")}</button>
          </div>
        </div>
      </div>
    );
  }

  const submitBtn = (
    <button onClick={createTask} disabled={pending} style={{ ...ui.btnAccent, opacity: pending ? 0.5 : 1 }}>
      {pending ? "…" : t(locale, "request.submit")}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: fill ? "auto" : "calc(100dvh - 200px)", minHeight: fill ? undefined : 0, marginTop: fill ? 0 : 12, border: "1px solid var(--border)", background: "var(--surface)" }}>
      {/* DEV-41: гарантийный период внесения правок истёк — клиенту предупреждение с контактом (только клиенту:
          не разработчику/админу). Нажатие на @soloveynik открывает чат в Telegram. */}
      {!isContributor && !isAdmin && projects.find((p) => p.key === projectKey)?.warrantyExpired && (
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", background: "rgba(232,179,57,0.10)", color: "#e8b339", fontSize: 14, lineHeight: 1.5 }}>
          ⚠️ {t(locale, "warranty.expired")}{" "}
          <a href="https://t.me/soloveynik" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>@soloveynik</a>
        </div>
      )}
      {/* проект */}
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={ui.monoLabel}>{t(locale, "field.project")}:</span>
        {lockedProject || projects.length <= 1 ? (
          <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{projects.find((p) => p.key === projectKey)?.name || projects[0]?.name || "—"}</span>
        ) : (
          <select value={projectKey} onChange={(e) => setProjectKey(e.target.value)} style={{ ...ui.input, width: "auto", flex: 1, padding: "6px 10px" }}>
            {projects.map((p) => (<option key={p.key} value={p.key}>{p.name}</option>))}
          </select>
        )}
      </div>

      {/* супер-админ/админ: куда адресовать задачу — себе / клиенту / от клиента. Взаимоисключающие.
          Без выбора — внутренняя задача разработчику (клиент не видит); клиент-видимость дают только client/from_client. */}
      {showSelf && (() => {
        const opts = [
          { key: "self", on: selfTask, set: setSelfTask, label: "newtask.self", hint: "newtask.selfHint" },
          { key: "client", on: clientTask, set: setClientTask, label: "newtask.client", hint: "newtask.clientHint" },
          { key: "from_client", on: fromClientTask, set: setFromClientTask, label: "newtask.fromClient", hint: "newtask.fromClientHint" },
        ] as const;
        const clearOthers = (keep: string) => { if (keep !== "self") setSelfTask(false); if (keep !== "client") setClientTask(false); if (keep !== "from_client") setFromClientTask(false); };
        return (
          <>
            {opts.map((o) => (
              <div key={o.key} style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", ...ui.monoLabel, textTransform: "none" }}>
                  <input type="checkbox" checked={o.on} onChange={(e) => { o.set(e.target.checked); if (e.target.checked) clearOthers(o.key); }} />
                  {t(locale, o.label)}
                </label>
                <span style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)" }}>{t(locale, o.hint)}</span>
              </div>
            ))}
            {/* Дефолт, когда ничего не выбрано. */}
            {!selfTask && !clientTask && !fromClientTask && (
              <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", ...ui.monoLabel, textTransform: "none", color: "#5b9cff" }}>
                {t(locale, "newtask.defaultInternal")}
              </div>
            )}
          </>
        );
      })()}

      {/* адресат (только разработчик в обычном проекте): админ (приватно) или клиент (вопрос) */}
      {showRecipient && (
        <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={ui.monoLabel}>{t(locale, "recipient.label")}:</span>
          {(["admin", "client"] as const).map((r) => (
            <button key={r} onClick={() => setRecipient(r)} style={{ ...ui.monoLabel, textTransform: "none", padding: "5px 12px", borderRadius: 2, cursor: "pointer", border: "1px solid " + (recipient === r ? "var(--accent)" : "var(--border-2)"), background: recipient === r ? "var(--accent)" : "transparent", color: recipient === r ? "#000" : "var(--muted)" }}>
              {t(locale, r === "admin" ? "recipient.admin" : "recipient.client")}
            </button>
          ))}
          <span style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", flexBasis: "100%" }}>
            {t(locale, recipient === "admin" ? "recipient.adminHint" : "recipient.clientHint")}
          </span>
        </div>
      )}

      {/* заголовок */}
      <input
        ref={titleRef}
        value={title}
        onChange={(e) => { setTitle(e.target.value); if (titleInvalid && e.target.value.trim()) { setTitleInvalid(false); setError(null); } }}
        placeholder={t(locale, "request.titlePh")}
        aria-invalid={titleInvalid}
        style={{ background: titleInvalid ? "rgba(255,91,91,0.06)" : "transparent", border: "none", borderBottom: `2px solid ${titleInvalid ? "#ff5b5b" : "var(--border)"}`, color: "var(--text)", fontSize: 20, fontWeight: 600, padding: "14px 16px", outline: "none", transition: "border-color 120ms, background 120ms" }}
      />

      {femWords.length > 0 && (
        <p style={{ fontSize: 13, color: "#e8b339", padding: "8px 16px 0", lineHeight: 1.5 }}>⚠️ {t(locale, "gender.warn", { words: femWords.join(", ") })}</p>
      )}
      {error && (
        <div role="alert" style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 16px 0", padding: "10px 12px", fontSize: 14, fontWeight: 500, lineHeight: 1.45, color: "#ff8a8a", background: "rgba(255,91,91,0.12)", border: "1px solid rgba(255,91,91,0.45)", borderLeft: "3px solid #ff5b5b", borderRadius: 4 }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ff5b5b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          <span>{error}</span>
        </div>
      )}

      {/* тело — WYSIWYG: текст + картинки/файлы инлайн, тулбар, скрепка/микрофон и кнопка отправки */}
      {ready && (
        <RichComposer
          ref={composerRef}
          locale={locale}
          placeholder={t(locale, "request.placeholder")}
          initialText={draftText}
          onChange={(_empty, text) => setBodyText(text)}
          controls={submitBtn}
        />
      )}
    </div>
  );
}
