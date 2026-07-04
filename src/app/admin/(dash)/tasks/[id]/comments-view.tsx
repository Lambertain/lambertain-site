"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { markTaskRead } from "../../tasks-actions";
import { moderateApprove, moderateEdit, moderateReject, editPendingComment, editPublishedComment, deletePublishedComment, discardPendingComment, superDeleteComment, superEditComment, devEditComment, devDeleteComment } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { Markdown } from "../../markdown";
import { ui } from "../../../ui-styles";

export type ViewComment = {
  id: string;
  text: string;
  created: number;
  authorName: string;
  authorRole: string;
  visibility?: "client" | "internal" | "client_nodev";
  approved: boolean;
  canEditOwn?: boolean;
  canEdit?: boolean;
  devAuthored?: boolean;
  isNew: boolean;
};

// DEV-32: системное событие журнала задачи (для ленты; только команде).
export type TimelineEvent = {
  id: string;
  ts: number;
  type: string;
  actorName: string | null;
  actorRole: string | null;
  trigger: string | null;
  from: string | null;
  to: string | null;
  details: Record<string, unknown> | null;
};

const DATE_LOC: Record<Locale, string> = { uk: "uk-UA", ru: "ru-RU", en: "en-US" };
function fmt(ms: number, locale: Locale): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString(DATE_LOC[locale], { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function CommentsView({
  taskId,
  comments,
  events = [],
  isClient,
  canModerate,
  canManageDev = false,
  locale,
}: {
  taskId: string;
  comments: ViewComment[];
  events?: TimelineEvent[];
  isClient: boolean;
  canModerate: boolean;
  canManageDev?: boolean;
  locale: Locale;
}) {
  const newRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [hiddenNew, setHiddenNew] = useState(0); // сколько новых комментов ниже зоны видимости
  const [showEvents, setShowEvents] = useState(true); // DEV-32: переключатель системных событий

  // На входе отмечаем задачу прочитанной (метка снимется при следующем заходе).
  useEffect(() => {
    markTaskRead(taskId);
  }, [taskId]);

  // Следим, какие новые комменты не видны (ниже экрана) → показываем подсказку.
  useEffect(() => {
    const els = [...newRefs.current.values()];
    if (!els.length) return;
    const visible = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target);
          else visible.delete(e.target);
        }
        // считаем новые комменты, которые ниже нижней границы экрана
        let below = 0;
        for (const el of els) {
          if (!visible.has(el) && el.getBoundingClientRect().top > window.innerHeight) below++;
        }
        setHiddenNew(below);
      },
      { threshold: 0.1 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [comments]);

  function scrollToNew() {
    const els = [...newRefs.current.values()];
    const target = els.find((el) => el.getBoundingClientRect().top > window.innerHeight) ?? els[0];
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // Клиент не видит внутренние И комменты на модерации (approved=false).
  const shown = isClient ? comments.filter((c) => c.visibility !== "internal" && c.approved) : comments;
  // DEV-32: системные события — только команде (клиенту никогда). Сливаем с комментами в одну хронологию.
  const sysEvents = isClient ? [] : events;
  type FeedItem = { kind: "comment"; ts: number; c: ViewComment } | { kind: "event"; ts: number; e: TimelineEvent };
  const feed: FeedItem[] = [
    ...shown.map((c): FeedItem => ({ kind: "comment", ts: c.created, c })),
    ...(showEvents ? sysEvents.map((e): FeedItem => ({ kind: "event", ts: e.ts, e })) : []),
  ].sort((a, b) => a.ts - b.ts || (a.kind === "event" ? -1 : 1));

  return (
    <>
      {/* DEV-32: переключатель системных событий (только команде, только если события есть). */}
      {!isClient && sysEvents.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={() => setShowEvents((v) => !v)} style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", background: "transparent", border: "1px solid var(--border-2)", borderRadius: 4, padding: "3px 10px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {showEvents ? <><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></> : <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>}
            </svg>
            {t(locale, showEvents ? "timeline.hideEvents" : "timeline.showEvents")}
          </button>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {feed.length === 0 && <p style={{ color: "var(--muted)", fontSize: 14 }}>{t(locale, "task.noComments")}</p>}
        {feed.map((item) => {
          if (item.kind === "event") return <SystemEventRow key={`e${item.e.id}`} e={item.e} locale={locale} />;
          const c = item.c;
          const internal = c.visibility === "internal";
          const clientNoDev = c.visibility === "client_nodev"; // клиенту, но скрыт от разработчика
          const pending = !c.approved;
          return (
            <div
              key={c.id}
              ref={c.isNew ? (el) => { if (el) newRefs.current.set(c.id, el); } : undefined}
              style={{ ...ui.card, padding: 14, borderColor: pending ? "#e8b339" : c.isNew ? "var(--accent-line)" : internal ? "var(--border-2)" : "var(--border)", background: internal ? "rgba(255,255,255,0.02)" : undefined }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, ...ui.monoLabel, textTransform: "none", marginBottom: 6 }}>
                <span style={{ color: c.authorRole === "client" ? "#e8b339" : "var(--accent)" }}>
                  {/* Клиент видит сотрудника и клиента по имени; разработчик/админ/эскалации — как «Lambertain». */}
                  {isClient && c.authorRole !== "client" && c.authorRole !== "employee" ? "Lambertain" : c.authorName}
                </span>
                {c.isNew && <span style={{ ...ui.monoLabel, color: "#000", background: "var(--accent)", padding: "1px 6px", borderRadius: 3, fontWeight: 600 }}>NEW</span>}
                {internal && !isClient && (
                  <span style={{ ...ui.monoLabel, color: "#e8b339", border: "1px solid #e8b339", padding: "1px 6px" }}>{t(locale, "comment.internalBadge")}</span>
                )}
                {/* client_nodev: клиент видит как обычный коммент (без бейджа); команде/админу — метка, что скрыт от разработчика. */}
                {clientNoDev && !isClient && (
                  <span style={{ ...ui.monoLabel, color: "#5b9cff", border: "1px solid #5b9cff", padding: "1px 6px" }}>{t(locale, "comment.clientNoDevBadge")}</span>
                )}
                {pending && (
                  <span style={{ ...ui.monoLabel, color: "#e8b339", border: "1px solid #e8b339", padding: "1px 6px" }}>{t(locale, "mod.pendingBadge")}</span>
                )}
                <span style={{ marginLeft: "auto" }}>{fmt(c.created, locale)}</span>
                {/* Удаление любого коммента — только супер-админу (pending удаляется через «Відхилити» в панели модерации). */}
                {canModerate && <SuperDelete taskId={taskId} commentId={c.id} locale={locale} />}
                {/* DEV-7: разработчик/админ может удалить коммент Клода (dev_authored) из UI. */}
                {!canModerate && canManageDev && c.devAuthored && <DevManageDelete taskId={taskId} commentId={c.id} locale={locale} />}
              </div>
              <Markdown>{c.text}</Markdown>
              {pending && canModerate
                ? <Moderation taskId={taskId} commentId={c.id} text={c.text} locale={locale} />
                : pending && c.canEditOwn
                  ? <OwnPendingEdit taskId={taskId} commentId={c.id} text={c.text} locale={locale} />
                  : !pending && c.canEdit
                    ? <OwnPublishedEdit taskId={taskId} commentId={c.id} text={c.text} locale={locale} />
                    : !pending && canModerate
                      ? <SuperEdit taskId={taskId} commentId={c.id} text={c.text} internal={c.visibility === "internal"} locale={locale} />
                      : c.devAuthored && canManageDev
                        ? <DevManageEdit taskId={taskId} commentId={c.id} text={c.text} locale={locale} />
                        : null}
            </div>
          );
        })}
      </div>

      {hiddenNew > 0 && (
        <button
          onClick={scrollToNew}
          style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 1000, ...ui.btnAccent, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}
        >
          {t(locale, "comment.newBelow", { n: String(hiddenNew) })}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
        </button>
      )}
    </>
  );
}

// DEV-32: подпись типа события (i18n с литеральными ключами — TS-safe).
function eventLabel(locale: Locale, type: string): string {
  switch (type) {
    case "status_change": return t(locale, "ev.status_change");
    case "stage_change": return t(locale, "ev.stage_change");
    case "pr_linked": return t(locale, "ev.pr_linked");
    case "pr_merged": return t(locale, "ev.pr_merged");
    case "comment_moderated": return t(locale, "ev.comment_moderated");
    case "escalation": return t(locale, "ev.escalation");
    case "assignee_change": return t(locale, "ev.assignee_change");
    case "task_created": return t(locale, "ev.task_created");
    default: return t(locale, "ev.event");
  }
}
const STAGE_LABEL: Record<string, Record<Locale, string>> = {
  pr: { uk: "Готується", ru: "Готовится", en: "Preparing" },
  dev: { uk: "На тестовому", ru: "На тестовом", en: "On test" },
  prod: { uk: "Опубліковано", ru: "Опубликовано", en: "Published" },
};

/** DEV-32: системное событие журнала — лёгкая «системная» строка в ленте (отличается от карточек комментов). */
function SystemEventRow({ e, locale }: { e: TimelineEvent; locale: Locale }) {
  const actor = !e.actorName || e.actorRole === "system" ? t(locale, "timeline.system") : e.actorName;
  const human = (v: string | null) => (v && e.type === "stage_change" && STAGE_LABEL[v] ? STAGE_LABEL[v][locale] : v);
  const fromTo = e.from || e.to ? `${human(e.from) ?? "—"} → ${human(e.to) ?? "—"}` : null;
  const prUrl = typeof e.details?.prUrl === "string" ? e.details.prUrl : null;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "6px 12px", borderLeft: "2px solid var(--border-2)", background: "rgba(255,255,255,0.015)", borderRadius: 3, ...ui.monoLabel, textTransform: "none", color: "var(--muted)", fontSize: 12.5 }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0, opacity: 0.7 }}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "2px 7px", flex: 1, lineHeight: 1.5 }}>
        <span style={{ color: "var(--text)", fontWeight: 600 }}>{eventLabel(locale, e.type)}</span>
        {fromTo && <span style={{ color: "var(--accent)" }}>{fromTo}</span>}
        {e.trigger && <span>· {e.trigger}</span>}
        <span style={{ opacity: 0.8 }}>· {t(locale, "timeline.by")} {actor}</span>
        {prUrl && <a href={prUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>· PR ↗</a>}
        <span style={{ marginLeft: "auto", opacity: 0.7 }}>{fmt(e.ts, locale)}</span>
      </div>
    </div>
  );
}

/** Контролы модерации pending-коммента (только супер-админ): одобрить / отредактировать+одобрить / отклонить. */
function Moderation({ taskId, commentId, text, locale }: { taskId: string; commentId: string; text: string; locale: Locale }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [pending, start] = useTransition();
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-2)" }}>
      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} style={{ ...ui.input, resize: "vertical", fontFamily: "inherit", width: "100%" }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => start(() => { moderateEdit(commentId, taskId, draft); })} disabled={pending || !draft.trim()} style={{ ...ui.btnAccent, opacity: pending ? 0.5 : 1 }}>{t(locale, "mod.editApprove")}</button>
            <button onClick={() => setEditing(false)} style={ui.btn}>{t(locale, "common.cancel")}</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginRight: 4 }}>{t(locale, "mod.note")}</span>
          <button onClick={() => start(() => { moderateApprove(commentId, taskId); })} disabled={pending} style={{ ...ui.btnAccent, opacity: pending ? 0.5 : 1 }}>{t(locale, "mod.approve")}</button>
          <button onClick={() => { setDraft(text); setEditing(true); }} style={ui.btn}>{t(locale, "mod.edit")}</button>
          <button onClick={() => start(() => { moderateReject(commentId, taskId); })} disabled={pending} style={ui.btn}>{t(locale, "mod.keepInternal")}</button>
        </div>
      )}
    </div>
  );
}

/** Удаление коммента супер-админом (иконка → инлайн-подтверждение). */
function SuperDelete({ taskId, commentId, locale }: { taskId: string; commentId: string; locale: Locale }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  if (confirm) {
    return (
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <button onClick={() => start(() => { superDeleteComment(commentId, taskId); })} disabled={pending} style={{ ...ui.monoLabel, color: "#ff5b5b", background: "transparent", border: "1px solid #ff5b5b", padding: "1px 7px", cursor: "pointer", borderRadius: 2 }}>{t(locale, "common.delete")}?</button>
        <button onClick={() => setConfirm(false)} style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>
      </span>
    );
  }
  return (
    <button onClick={() => setConfirm(true)} title={t(locale, "common.delete")} style={{ display: "flex", background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", padding: 2 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
    </button>
  );
}

/** Автор правит СВОЙ опубликованный коммент, пока на него не ответили (доступно и клиенту). */
function OwnPublishedEdit({ taskId, commentId, text, locale }: { taskId: string; commentId: string; text: string; locale: Locale }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function save() {
    setErr(null);
    start(async () => {
      const r = await editPublishedComment(commentId, taskId, draft);
      if (r?.error) setErr(t(locale, "comment.editLocked"));
      else setEditing(false);
    });
  }
  if (editing) {
    return (
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-2)", display: "flex", flexDirection: "column", gap: 8 }}>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} style={{ ...ui.input, resize: "vertical", fontFamily: "inherit", width: "100%" }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={save} disabled={pending || !draft.trim()} style={{ ...ui.btnAccent, opacity: pending || !draft.trim() ? 0.5 : 1 }}>{t(locale, "mod.save")}</button>
          <button onClick={() => { setDraft(text); setEditing(false); setErr(null); }} style={ui.btn}>{t(locale, "common.cancel")}</button>
          {err && <span style={{ ...ui.monoLabel, textTransform: "none", color: "#ff5b5b" }}>{err}</span>}
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 8, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
      <button onClick={() => { setDraft(text); setEditing(true); }} style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 5 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" /></svg>
        {t(locale, "comment.edit")}
      </button>
      <button onClick={() => { if (confirm(t(locale, "comment.deleteConfirm"))) start(async () => { const r = await deletePublishedComment(commentId, taskId); if (r?.error) setErr(t(locale, "comment.editLocked")); else location.reload(); }); }}
        disabled={pending} style={{ ...ui.monoLabel, textTransform: "none", color: "#ff5b5b", background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 5 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
        {t(locale, "common.delete")}
      </button>
      {err && <span style={{ ...ui.monoLabel, textTransform: "none", color: "#ff5b5b" }}>{err}</span>}
    </div>
  );
}

/** Супер-админ правит ЛЮБОЙ опубликованный коммент (в т.ч. свой — у него нет логина для «правки своего»). */
function SuperEdit({ taskId, commentId, text, internal, locale }: { taskId: string; commentId: string; text: string; internal?: boolean; locale: Locale }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [toClient, setToClient] = useState(false); // перевести внутренний → видимый клиенту
  const [pending, start] = useTransition();
  if (editing) {
    return (
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-2)", display: "flex", flexDirection: "column", gap: 8 }}>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} style={{ ...ui.input, resize: "vertical", fontFamily: "inherit", width: "100%" }} />
        {/* Внутренний коммент можно «открыть» клиенту прямо при редактировании. */}
        {internal && (
          <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", ...ui.monoLabel, textTransform: "none" }}>
            <input type="checkbox" checked={toClient} onChange={(e) => setToClient(e.target.checked)} style={{ width: 15, height: 15, accentColor: "var(--accent)", cursor: "pointer" }} />
            {t(locale, "comment.makeClientVisible")}
          </label>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => start(async () => { const r = await superEditComment(commentId, taskId, draft, internal && toClient); if (!r?.error) setEditing(false); })} disabled={pending || !draft.trim()} style={{ ...ui.btnAccent, opacity: pending || !draft.trim() ? 0.5 : 1 }}>{toClient ? t(locale, "comment.publishToClient") : t(locale, "mod.save")}</button>
          <button onClick={() => { setDraft(text); setEditing(false); }} style={ui.btn}>{t(locale, "common.cancel")}</button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={() => { setDraft(text); setEditing(true); }} style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 5 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" /></svg>
        {t(locale, "comment.edit")}
      </button>
    </div>
  );
}

/** DEV-7: разработчик/админ правит коммент Клода (dev_authored) из UI. */
function DevManageEdit({ taskId, commentId, text, locale }: { taskId: string; commentId: string; text: string; locale: Locale }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (editing) {
    return (
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-2)", display: "flex", flexDirection: "column", gap: 8 }}>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} style={{ ...ui.input, resize: "vertical", fontFamily: "inherit", width: "100%" }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => start(async () => { const r = await devEditComment(commentId, taskId, draft); if (r?.error) setErr(r.error); else setEditing(false); })} disabled={pending || !draft.trim()} style={{ ...ui.btnAccent, opacity: pending || !draft.trim() ? 0.5 : 1 }}>{t(locale, "mod.save")}</button>
          <button onClick={() => { setDraft(text); setEditing(false); setErr(null); }} style={ui.btn}>{t(locale, "common.cancel")}</button>
          {err && <span style={{ ...ui.monoLabel, textTransform: "none", color: "#ff5b5b" }}>{err}</span>}
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={() => { setDraft(text); setEditing(true); }} style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 5 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" /></svg>
        {t(locale, "comment.edit")}
      </button>
    </div>
  );
}

/** DEV-7: разработчик/админ удаляет коммент Клода (dev_authored) из UI (иконка → подтверждение). */
function DevManageDelete({ taskId, commentId, locale }: { taskId: string; commentId: string; locale: Locale }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  if (confirm) {
    return (
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <button onClick={() => start(async () => { await devDeleteComment(commentId, taskId); })} disabled={pending} style={{ ...ui.monoLabel, color: "#ff5b5b", background: "transparent", border: "1px solid #ff5b5b", padding: "1px 7px", cursor: "pointer", borderRadius: 2 }}>{t(locale, "common.delete")}?</button>
        <button onClick={() => setConfirm(false)} style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>
      </span>
    );
  }
  return (
    <button onClick={() => setConfirm(true)} title={t(locale, "common.delete")} style={{ display: "flex", background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", padding: 2 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
    </button>
  );
}

/** Автор правит/удаляет СВОЙ коммент, пока он на модерации (до публикации). */
function OwnPendingEdit({ taskId, commentId, text, locale }: { taskId: string; commentId: string; text: string; locale: Locale }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [pending, start] = useTransition();
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-2)" }}>
      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} style={{ ...ui.input, resize: "vertical", fontFamily: "inherit", width: "100%" }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => start(() => { editPendingComment(commentId, taskId, draft); setEditing(false); })} disabled={pending || !draft.trim()} style={{ ...ui.btnAccent, opacity: pending ? 0.5 : 1 }}>{t(locale, "mod.save")}</button>
            <button onClick={() => { setDraft(text); setEditing(false); }} style={ui.btn}>{t(locale, "common.cancel")}</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginRight: 4 }}>{t(locale, "mod.ownNote")}</span>
          <button onClick={() => setEditing(true)} style={ui.btn}>{t(locale, "mod.edit")}</button>
          <button onClick={() => start(() => { discardPendingComment(commentId, taskId); })} disabled={pending} style={{ ...ui.btn, color: "#ff5b5b", borderColor: "#ff5b5b" }}>{t(locale, "common.delete")}</button>
        </div>
      )}
    </div>
  );
}
