"use client";

import { useState } from "react";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

// Палитра цветов проектов (различимы на тёмном фоне). Цвет закрепляется за проектом по индексу —
// один и тот же в режимах «Тиждень» и «День» и в легенде.
const PALETTE = [
  "#b9ff4b", "#4bb9ff", "#ff6b6b", "#ffd24b", "#b06bff",
  "#4bffa0", "#ff8f4b", "#ff4bd2", "#6bd0ff", "#d2ff4b",
];

const CHART_H = 92; // высота области столбцов, px

export interface ChartProject {
  key: string;
  name: string;
}

/**
 * Недельный график активности разработчика (выполнено задач).
 * Переключатель НЕДЕЛЯ/ДЕНЬ:
 *  - ДЕНЬ: сегодня, по столбцу на каждый проект (выполнено за сегодня);
 *  - ТИЖДЕНЬ: 7 дней, в каждом дне — отдельный цветной столбец на каждый проект.
 * Данные историчны (из журнала задач) — отображаются сразу, без накопления.
 */
export function DevActivityChart({
  projects,
  days,
  doneMap,
  locale,
}: {
  projects: ChartProject[];
  /** 7 дат YYYY-MM-DD, от старой к новой (Київ TZ). */
  days: string[];
  /** projectKey → (день YYYY-MM-DD → кол-во выполненных). */
  doneMap: Record<string, Record<string, number>>;
  locale: Locale;
}) {
  const [mode, setMode] = useState<"week" | "day">("week");

  const color = (i: number) => PALETTE[i % PALETTE.length];
  const cnt = (key: string, day: string) => doneMap[key]?.[day] ?? 0;
  const today = days[days.length - 1];

  // Подписи дней: короткий день недели + число (локализовано).
  const dayLabel = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    const wd = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "Europe/Kyiv" }).format(d);
    return { wd, dm: `${d.getDate()}.${d.getMonth() + 1}` };
  };

  // Максимум для шкалы.
  const weekMax = Math.max(1, ...days.flatMap((day) => projects.map((p) => cnt(p.key, day))));
  const dayMax = Math.max(1, ...projects.map((p) => cnt(p.key, today)));

  const weekTotal = days.reduce((s, day) => s + projects.reduce((ss, p) => ss + cnt(p.key, day), 0), 0);
  const dayTotal = projects.reduce((s, p) => s + cnt(p.key, today), 0);

  const Toggle = (
    <div style={{ display: "flex", gap: 0, border: "1px solid var(--border-2)" }}>
      {(["week", "day"] as const).map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          style={{
            ...ui.monoLabel,
            padding: "5px 12px",
            cursor: "pointer",
            border: "none",
            background: mode === m ? "var(--accent)" : "transparent",
            color: mode === m ? "#000" : "var(--muted)",
          }}
        >
          {t(locale, m === "week" ? "dash.week" : "dash.day")}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ border: "1px solid var(--border)", background: "var(--surface-2)", padding: 12, marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span style={{ ...ui.monoLabel, textTransform: "none" }}>
          {t(locale, "dash.activity")} ·{" "}
          {mode === "week"
            ? `${weekTotal} ${t(locale, "dash.tasksDone")}`
            : `${dayTotal} ${t(locale, "dash.tasksDone")} ${t(locale, "dash.today")}`}
        </span>
        {Toggle}
      </div>

      {(mode === "week" ? weekTotal : dayTotal) === 0 ? (
        <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginTop: 14, marginBottom: 6 }}>
          {t(locale, "dash.activityEmpty")}
        </p>
      ) : mode === "week" ? (
        <>
          {/* 7 дней, в каждом — по столбцу на проект */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: CHART_H, marginTop: 14 }}>
            {days.map((day) => (
              <div key={day} style={{ flex: 1, display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 2, height: "100%" }}>
                {projects.map((p, i) => {
                  const c = cnt(p.key, day);
                  return (
                    <div
                      key={p.key}
                      title={`${p.name}: ${c}`}
                      style={{
                        flex: 1,
                        maxWidth: 14,
                        height: `${(c / weekMax) * 100}%`,
                        minHeight: c > 0 ? 3 : 0,
                        background: color(i),
                        borderRadius: "2px 2px 0 0",
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {days.map((day) => {
              const { wd, dm } = dayLabel(day);
              return (
                <div key={day} style={{ flex: 1, textAlign: "center", ...ui.monoLabel, textTransform: "none", color: day === today ? "var(--text)" : "var(--muted)" }}>
                  <div>{wd}</div>
                  <div style={{ fontSize: 9, opacity: 0.7 }}>{dm}</div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {/* Сегодня — по столбцу на проект */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: CHART_H, marginTop: 14 }}>
            {projects.map((p, i) => {
              const c = cnt(p.key, today);
              return (
                <div key={p.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                  <span style={{ ...ui.monoLabel, textTransform: "none", color: "var(--text)", marginBottom: 2 }}>{c || ""}</span>
                  <div
                    title={`${p.name}: ${c}`}
                    style={{ width: "100%", maxWidth: 48, height: `${(c / dayMax) * 100}%`, minHeight: c > 0 ? 3 : 0, background: color(i), borderRadius: "2px 2px 0 0" }}
                  />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            {projects.map((p) => (
              <div key={p.key} style={{ flex: 1, textAlign: "center", ...ui.monoLabel }}>{p.key}</div>
            ))}
          </div>
        </>
      )}

      {/* Легенда: цвет → проект */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginTop: 12 }}>
        {projects.map((p, i) => (
          <span key={p.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, ...ui.monoLabel, textTransform: "none" }}>
            <span style={{ width: 10, height: 10, background: color(i), borderRadius: 2, flexShrink: 0 }} />
            {p.name}
          </span>
        ))}
      </div>
    </div>
  );
}
