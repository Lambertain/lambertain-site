"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { updateTaskStatus, markProjectOpened, deleteTask, moveToReview, searchTasks } from "./tasks-actions";
import { DeployBadge } from "./deploy-badge";
import { AddresseeBadge } from "./addressee-badge";
import { STATUSES, statusColor, statusBucket, BUCKET_ORDER, BUCKET_LABEL, type Bucket } from "@/lib/statuses";
import type { AddresseeKey } from "@/lib/task-addressee";
import { t, type Locale } from "@/lib/i18n";
import { dayColor, type StatusDot } from "@/lib/status-timer";
import { CopySlug } from "./copy-slug";
import { ui } from "../ui-styles";

export type BoardTask = {
  id: string;
  projectKey: string;
  summary: string;
  status: string;
  description?: string;
  created?: number;
  updated?: number;
  commentCount?: number;
  assignee?: string | null;
  unread?: boolean;
  isNew?: boolean;
  newComments?: number;
  blocked?: boolean;
  blockers?: { id: string; summary: string }[];
  ownerAction?: string | null; // ждёт ops-шага агентства (владельца)
  reporterAction?: string | null; // DEV-48: ждёт ответа постановщика (вопрос разработчика)
  awaitingMyAnswer?: boolean; // reporterAction И смотрящий = постановщик → показать в мини-секции «ждут вашего ответа»
  clientAction?: string | null; // ждёт действия клиента
  deployStage?: string | null; // pr → dev → prod (деплой-стадия, простыми словами для клиента)
  addressee?: AddresseeKey | null; // кому адресована (бейдж для команды; null — не показывать)
  statusRows?: StatusDot[][]; // кружки «дней в статусе» по строкам (внутренний вид); undefined — не показывать
};

const DOT_COLOR: Record<"green" | "amber" | "red", string> = { green: "#3fb950", amber: "#e8b339", red: "#ff5b5b" };
const DATE_LOC: Record<Locale, string> = { uk: "uk-UA", ru: "ru-RU", en: "en-US" };

/** Ряды кружков-счётчиков «дней в статусе». Цвет по числу дней; при наведении — бабл со статусом. */
function StatusDots({ rows, locale }: { rows: StatusDot[][]; locale: Locale }) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {row.map((d, ci) => {
            const key = `${ri}-${ci}`;
            return (
              <span
                key={key}
                style={{ position: "relative", display: "inline-flex" }}
                onMouseEnter={() => setHover(key)}
                onMouseLeave={() => setHover((h) => (h === key ? null : h))}
              >
                <span
                  aria-label={`${d.status}: ${d.days}`}
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 22, height: 22, padding: "0 5px", borderRadius: 999, background: DOT_COLOR[dayColor(d.days)], color: "#000", fontSize: 12, fontWeight: 700 }}
                >
                  {d.days}
                </span>
                {hover === key && (
                  <span style={{ position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap", background: "var(--surface-2)", border: "1px solid var(--border-2)", padding: "4px 8px", borderRadius: 4, fontSize: 12, color: "var(--text)", zIndex: 30, pointerEvents: "none", boxShadow: "0 4px 14px rgba(0,0,0,0.35)" }}>
                    {d.status} · {t(locale, "card.daysN", { n: d.days })}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

type Proj = { key: string; name: string; hasNew?: boolean };

// На задаче бейдж = число НОВЫХ комментов; если задача ещё не відкривалась і комментів нема — просто «NEW».
const TaskBadge = ({ newComments, isNew }: { newComments?: number; isNew?: boolean }) => {
  if (newComments && newComments > 0)
    return <span style={{ ...ui.monoLabel, color: "#000", background: "var(--accent)", padding: "1px 6px", borderRadius: 3, fontWeight: 600 }}>{newComments} 💬</span>;
  if (isNew)
    return <span style={{ ...ui.monoLabel, color: "#000", background: "var(--accent)", padding: "1px 6px", borderRadius: 3, fontWeight: 600 }}>NEW</span>;
  return null;
};

function Row({
  task,
  locale,
  canEditStatus,
  canDelete,
  mode,
}: {
  task: BoardTask;
  locale: Locale;
  canEditStatus: boolean;
  canDelete: boolean;
  /** "start" — клик берёт задачу в работу; "open" — переход на страницу задачи. */
  mode: "start" | "open";
}) {
  const [status, setStatus] = useState(task.status);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [reviewRef, setReviewRef] = useState<string | null>(null);
  const [, start] = useTransition();

  if (deleted) return null;

  function pick(s: string) {
    setMenu(false);
    if (statusBucket(s) === "review") { setReviewRef(""); return; }
    setStatus(s);
    start(() => { updateTaskStatus(task.id, s); });
  }
  function submitReview() {
    const ref = reviewRef ?? "";
    setReviewRef(null);
    setStatus("Review");
    start(() => { moveToReview(task.id, ref); });
  }

  return (
    <div style={{ ...ui.card, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {/* статус */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => canEditStatus && setMenu((v) => !v)}
            style={{ ...ui.monoLabel, padding: "4px 10px", border: `1px solid ${statusColor(status)}`, color: statusColor(status), background: "transparent", cursor: canEditStatus ? "pointer" : "default" }}
          >
            {status}
          </button>
          {menu && (
            <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: "var(--surface-2)", border: "1px solid var(--border-2)", zIndex: 20, minWidth: 130 }}>
              {STATUSES.map((s) => (
                <button key={s} onClick={() => pick(s)} style={{ ...ui.monoLabel, display: "block", width: "100%", textAlign: "left", padding: "8px 10px", background: "transparent", border: "none", color: statusColor(s), cursor: "pointer" }}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* слаг задачи (HH-62) — виден во всех табах; клик копирует слаг в буфер */}
        <CopySlug id={task.id} locale={locale} style={{ flexShrink: 0, alignSelf: "center" }} />
        <AddresseeBadge addressee={task.addressee} locale={locale} />
        <DeployBadge stage={task.deployStage} locale={locale} />
        <span style={{ flex: 1 }} />
        <TaskBadge newComments={task.newComments} isNew={task.isNew} />
        {canDelete && (
          <button onClick={() => setConfirm(true)} title={t(locale, "common.delete")} style={{ display: "flex", background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", padding: 4 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          </button>
        )}
      </div>

      {/* DEV-11: название ВСЕГДА открывает задачу. Заголовок — отдельной строкой на всю ширину карточки
          (не в flex-шапке): раньше при малом числе бейджей он делил строку з ними й сжимался в узкую колонку,
          а при большом — переносился на всю ширину. Теперь всегда полная ширина. */}
      <a href={`/admin/tasks/${task.id}`} title={mode === "start" ? t(locale, "tab.openHint") : undefined} style={{ display: "block", marginTop: 8, color: "var(--text)", fontSize: 15, fontWeight: 600, textDecoration: "none" }}>
        {task.summary}
      </a>

      {reviewRef !== null && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ ...ui.monoLabel, textTransform: "none" }}>{t(locale, "review.refLabel")}</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input autoFocus value={reviewRef} onChange={(e) => setReviewRef(e.target.value)} placeholder={t(locale, "review.refPlaceholder")} style={{ ...ui.input, flex: 1, minWidth: 200 }} />
            <button onClick={submitReview} style={ui.btnAccent}>{t(locale, "review.send")}</button>
            <button onClick={() => setReviewRef(null)} style={ui.btn}>{t(locale, "common.cancel")}</button>
          </div>
        </div>
      )}

      {confirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", padding: 20 }} onClick={() => setConfirm(false)}>
          <div style={{ ...ui.card, maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
            <p style={{ fontSize: 14, marginTop: 0 }}>{t(locale, "task.deleteConfirm")}</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
              <button onClick={() => setConfirm(false)} style={ui.btn}>{t(locale, "common.cancel")}</button>
              <button onClick={() => { setConfirm(false); start(async () => { const r = await deleteTask(task.id); if (!r.error) setDeleted(true); }); }} style={{ ...ui.btnAccent, background: "#ff5b5b", borderColor: "#ff5b5b", color: "#fff" }}>
                {t(locale, "common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 14, ...ui.monoLabel, textTransform: "none", marginTop: 8, flexWrap: "wrap" }}>
        {task.assignee && <span>→ {task.assignee}</span>}
        <span>{t(locale, "task.comments")}: {task.commentCount ?? 0}</span>
        {task.created && (
          <span>{t(locale, "card.created", { date: new Date(task.created).toLocaleString(DATE_LOC[locale], { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) })}</span>
        )}
      </div>

      {/* Кружки «днів у статусі» (по 24 год): зелений 1 / жовтий 2 / червоний ≥3. Зміна статусу — новий кружок,
          повернення в статус — новий рядок. Бабл при наведенні. Тільки внутрішній вид (statusRows задано на сервері). */}
      {task.statusRows && task.statusRows.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <StatusDots rows={task.statusRows} locale={locale} />
        </div>
      )}

      {task.blocked && task.blockers && task.blockers.length > 0 && (
        <div style={{ ...ui.monoLabel, textTransform: "none", color: "#ff5b5b", marginTop: 8 }}>
          {t(locale, "deps.blockedBy")} {task.blockers.map((b) => b.id).join(", ")}
        </div>
      )}
      {/* На ком блокер (DEV-5): ждём действия владельца (агентства) или клиента + причина. */}
      {task.ownerAction && (
        <div style={{ ...ui.monoLabel, textTransform: "none", color: "#e8b339", marginTop: 8 }}>
          ⏳ {t(locale, "block.owner")}: {String(task.ownerAction).slice(0, 80)}
        </div>
      )}
      {task.clientAction && (
        <div style={{ ...ui.monoLabel, textTransform: "none", color: "#e8b339", marginTop: 8 }}>
          ⏳ {t(locale, "block.client")}: {String(task.clientAction).slice(0, 80)}
        </div>
      )}
      {/* DEV-48: вопрос разработчика ПОСТАНОВЩИКУ. Яркая плашка — постановщику особенно (awaitingMyAnswer),
          остальным — просто индикатор «ждёт ответа постановщика». */}
      {task.reporterAction && (
        <div style={{ ...ui.monoLabel, textTransform: "none", marginTop: 8, color: task.awaitingMyAnswer ? "#000" : "#e8b339", background: task.awaitingMyAnswer ? "var(--accent)" : "transparent", padding: task.awaitingMyAnswer ? "3px 8px" : 0, borderRadius: 3, fontWeight: task.awaitingMyAnswer ? 700 : 400, display: "inline-block" }}>
          ❓ {t(locale, task.awaitingMyAnswer ? "reporter.forYou" : "reporter.wait")}: {String(task.reporterAction).slice(0, 80)}
        </div>
      )}
    </div>
  );
}

const TabBtn = ({ active, hasNew, onClick, variant = "project", children }: { active: boolean; hasNew?: boolean; onClick: () => void; variant?: "project" | "status"; children: React.ReactNode }) => {
  // project — заполненные «таблетки» (верхний уровень); status — «подчёркнутые вкладки» (нижний уровень).
  const style: React.CSSProperties =
    variant === "project"
      ? {
          ...ui.monoLabel,
          padding: "7px 12px",
          background: active ? "var(--accent)" : "transparent",
          color: active ? "#000" : "var(--muted)",
          border: `1px solid ${active ? "var(--accent)" : "var(--border-2)"}`,
        }
      : {
          ...ui.monoLabel,
          padding: "6px 4px",
          background: "transparent",
          color: active ? "var(--accent)" : "var(--muted)",
          border: "none",
          borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
          borderRadius: 0,
        };
  return (
    <button onClick={onClick} style={{ position: "relative", cursor: "pointer", whiteSpace: "nowrap", ...style }}>
      {children}
      {hasNew && !active && (
        <span style={{ position: "absolute", top: -4, right: -4, width: 9, height: 9, borderRadius: "50%", background: "var(--accent)", border: "1px solid var(--bg)" }} />
      )}
    </button>
  );
};

export function TaskTabs({
  tasks,
  projects,
  locale,
  canEditStatus,
  canDelete,
  canStart,
  empty,
  feedbackKey,
  initialProject,
  initialBucket,
  activeProject: controlledProject,
  onProjectChange,
  allowAll,
  searchable,
}: {
  tasks: BoardTask[];
  projects: Proj[];
  locale: Locale;
  canEditStatus: boolean;
  canDelete: boolean;
  canStart: boolean;
  empty: string;
  feedbackKey?: string;
  /** Начальные проект/корзина из URL (?project=&tab=) — для дип-линка из карточки проекта. */
  initialProject?: string;
  initialBucket?: Bucket;
  /** Контролируемый режим: выбранный проект задаёт родитель (чтобы синхронить с карточкой проекта сверху). */
  activeProject?: string;
  onProjectChange?: (key: string) => void;
  /** Показать плитку «ВСЕ ЗАДАЧИ» (по всем проектам) первой и выбрать её по умолчанию. */
  allowAll?: boolean;
  /** Поиск по слагу/названию (по всем проектам) — НЕ для клиентских ролей. */
  searchable?: boolean;
}) {
  const projectKeys = projects.map((p) => p.key);
  const [internalProject, setInternalProject] = useState<string>(
    initialProject && projectKeys.includes(initialProject) ? initialProject : allowAll ? "" : projectKeys[0] ?? "",
  );
  // Контролируемый проект (от родителя) приоритетнее внутреннего — так карточка сверху и табы синхронны.
  const activeProject = controlledProject !== undefined ? controlledProject : internalProject;
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [, startSeen] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  // Сохраняем выбранный проект+таб в URL (?project=&tab=) — чтобы «назад» из карточки возвращал на ту же доску
  // и обновление страницы не сбрасывало вид. Только для НЕконтролируемых досок (админ/разработчик); клиентскую
  // доску (controlledProject) не трогаем.
  const writeUrl = onProjectChange ? undefined : (proj: string, bkt: Bucket | "") => {
    const q = new URLSearchParams();
    if (proj) q.set("project", proj);
    if (bkt) q.set("tab", bkt);
    router.replace(q.toString() ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  // Поиск по слагу (id) или названию — по ВСЕМ задачам, поверх табов/корзин.
  // Мгновенно фильтруем подгруженные (первые 300), а параллельно (debounce) дёргаем server-search по ВСЕЙ базе,
  // иначе задачи вне первых 300 по updated не находятся (баг: искали RAC-14 → «ничего не найдено»).
  const q = query.trim().toLowerCase();
  const searchResults = useMemo(
    () => (q ? tasks.filter((tk) => tk.id.toLowerCase().includes(q) || tk.summary.toLowerCase().includes(q)) : []),
    [tasks, q],
  );
  const [serverResults, setServerResults] = useState<BoardTask[] | null>(null);
  const [searching, startSearch] = useTransition();
  useEffect(() => {
    const s = query.trim();
    if (s.length < 2) { setServerResults(null); return; }
    setServerResults(null); // сбрасываем прошлый результат, пока грузим новый
    const h = setTimeout(() => { startSearch(async () => { setServerResults(await searchTasks(s)); }); }, 250);
    return () => clearTimeout(h);
  }, [query]);
  // Пока сервер не ответил — показываем мгновенный клиентский результат; ответил — авторитетный серверный.
  const results = q ? (serverResults ?? searchResults) : [];

  function openProject(key: string) {
    if (onProjectChange) onProjectChange(key); else setInternalProject(key);
    setBucket(null);
    writeUrl?.(key, "");
    if (key && !opened.has(key)) { // "" = «ВСЕ» — не отмечаем как открытый проект
      setOpened((s) => new Set(s).add(key));
      startSeen(() => { markProjectOpened(key); });
    }
  }
  function pickBucket(b: Bucket) {
    setBucket(b);
    writeUrl?.(activeProject, b);
  }

  // Открытие апки = просмотр активного проекта (снимаем его метку New).
  useEffect(() => {
    if (activeProject && !opened.has(activeProject)) {
      setOpened((s) => new Set(s).add(activeProject));
      startSeen(() => { markProjectOpened(activeProject); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const projTasks = useMemo(
    () => (allowAll && activeProject === "" ? tasks : projectKeys.length ? tasks.filter((tk) => tk.projectKey === activeProject) : tasks),
    [tasks, activeProject, projectKeys.length, allowAll],
  );

  const byBucket = useMemo(() => {
    const m: Record<Bucket, BoardTask[]> = { inProgress: [], review: [], rework: [], done: [], notStarted: [], blocked: [] };
    // DEV-43: без отдельного таба «Заблоковано» — заблокированные (по зависимостям или статусу Blocked)
    // кладём в «Не начато»; причина видна текстовой плашкой (blockedBy / ownerAction / clientAction).
    for (const tk of projTasks) {
      const b = tk.blocked ? "blocked" : statusBucket(tk.status);
      m[b === "blocked" ? "notStarted" : b].push(tk);
    }
    return m;
  }, [projTasks]);

  // По умолчанию «В работе»; если пусто — «Не начатые». Пустой экран = всё выполнено, ждём новые задачи.
  const defaultBucket: Bucket = byBucket.inProgress.length ? "inProgress" : "notStarted";
  const [bucket, setBucket] = useState<Bucket | null>(initialBucket ?? null);
  const activeBucket = bucket ?? defaultBucket;
  const rows = byBucket[activeBucket];
  // DEV-48: задачи, где разработчик задал вопрос ИМЕННО СМОТРЯЩЕМУ-постановщику — в мини-секцию вверху доски
  // (persistent, не зависит от активного таба), чтобы постановщик точно увидел и не искал в табе Blocked.
  const awaitingMine = projTasks.filter((tk) => tk.awaitingMyAnswer);

  return (
    <div style={{ marginTop: 16 }}>
      {searchable && (
        <div style={{ marginBottom: 14, position: "relative", maxWidth: 420 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(locale, "tasks.searchPh")}
            style={{ ...ui.input, width: "100%", paddingRight: query ? 34 : 12 }}
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label={t(locale, "common.cancel")} style={{ position: "absolute", top: "50%", right: 8, transform: "translateY(-50%)", background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
          )}
        </div>
      )}

      {q ? (
        results.length === 0 ? (
          // Пока идёт server-search (или ещё не пришёл ответ) — не пишем «ничего не найдено» преждевременно.
          <p style={{ color: "var(--muted)", fontSize: 14 }}>{t(locale, (searching || serverResults === null) ? "tasks.searching" : "tasks.searchNone")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ ...ui.monoLabel, color: "var(--muted)" }}>{t(locale, "tasks.searchFound")}: {results.length}</span>
            {results.map((tk) => (
              <Row key={tk.id} task={tk} locale={locale} canEditStatus={canEditStatus} canDelete={canDelete} mode="open" />
            ))}
          </div>
        )
      ) : (
      <>
      {(allowAll ? projects.length >= 1 : projects.length > 1) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {allowAll && (
            <TabBtn active={activeProject === ""} onClick={() => openProject("")}>
              {t(locale, "tasks.allTiles")}
            </TabBtn>
          )}
          {projects.map((p) => (
            <TabBtn key={p.key} active={p.key === activeProject} hasNew={p.hasNew && !opened.has(p.key)} onClick={() => openProject(p.key)}>
              {p.name}
            </TabBtn>
          ))}
        </div>
      )}

      {feedbackKey && activeProject === feedbackKey && (
        <div style={{ ...ui.card, padding: 14, marginBottom: 12, borderColor: "var(--accent-line)", background: "rgba(185,255,75,0.06)" }}>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>{t(locale, "feedback.intro")}</p>
        </div>
      )}

      {/* DEV-48: мини-секция «Очікують вашої відповіді» — вверху, над табами. Постановщик видит вопросы
          разработчика сразу, независимо от активного таба (не прячутся в Blocked). */}
      {awaitingMine.length > 0 && (
        <div style={{ ...ui.card, padding: 12, marginBottom: 12, borderColor: "var(--accent-line)", background: "rgba(185,255,75,0.06)" }}>
          <div style={{ ...ui.monoLabel, color: "var(--accent)", marginBottom: 8 }}>❓ {t(locale, "reporter.section")} · {awaitingMine.length}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {awaitingMine.map((tk) => (
              <Row key={`aw-${tk.id}`} task={tk} locale={locale} canEditStatus={canEditStatus} canDelete={canDelete} mode="open" />
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 16, overflowX: "auto", borderBottom: "1px solid var(--border)", paddingBottom: 2 }}>
        {BUCKET_ORDER.map((b) => (
          <TabBtn key={b} variant="status" active={b === activeBucket} onClick={() => pickBucket(b)}>
            {t(locale, BUCKET_LABEL[b])} · {byBucket[b].length}
          </TabBtn>
        ))}
      </div>

      {rows.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 14 }}>{empty}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((tk) => (
            <Row
              key={tk.id}
              task={tk}
              locale={locale}
              canEditStatus={canEditStatus}
              canDelete={canDelete}
              mode={activeBucket === "notStarted" && canStart ? "start" : "open"}
            />
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}
