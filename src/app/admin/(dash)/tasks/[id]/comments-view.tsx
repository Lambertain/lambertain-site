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
  visibility?: "client" | "internal";
  approved: boolean;
  canEditOwn?: boolean;
  canEdit?: boolean;
  devAuthored?: boolean;
  isNew: boolean;
};

const DATE_LOC: Record<Locale, string> = { uk: "uk-UA", ru: "ru-RU", en: "en-US" };
function fmt(ms: number, locale: Locale): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString(DATE_LOC[locale], { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function CommentsView({
  taskId,
  comments,
  isClient,
  canModerate,
  canManageDev = false,
  locale,
}: {
  taskId: string;
  comments: ViewComment[];
  isClient: boolean;
  canModerate: boolean;
  canManageDev?: boolean;
  locale: Locale;
}) {
  const newRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [hiddenNew, setHiddenNew] = useState(0); // сколько новых комментов ниже зоны видимости

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

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {shown.length === 0 && <p style={{ color: "var(--muted)", fontSize: 14 }}>{t(locale, "task.noComments")}</p>}
        {shown.map((c) => {
          const internal = c.visibility === "internal";
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
                      ? <SuperEdit taskId={taskId} commentId={c.id} text={c.text} locale={locale} />
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
function SuperEdit({ taskId, commentId, text, locale }: { taskId: string; commentId: string; text: string; locale: Locale }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [pending, start] = useTransition();
  if (editing) {
    return (
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-2)", display: "flex", flexDirection: "column", gap: 8 }}>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} style={{ ...ui.input, resize: "vertical", fontFamily: "inherit", width: "100%" }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => start(async () => { const r = await superEditComment(commentId, taskId, draft); if (!r?.error) setEditing(false); })} disabled={pending || !draft.trim()} style={{ ...ui.btnAccent, opacity: pending || !draft.trim() ? 0.5 : 1 }}>{t(locale, "mod.save")}</button>
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
