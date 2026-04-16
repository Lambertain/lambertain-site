"use client";
import { useState } from "react";
import { PROJECTS, FILTER_LABELS, type ProjectCategory } from "@/data/projects";

export default function Projects() {
  const [active, setActive] = useState<ProjectCategory>("all");
  const [flipped, setFlipped] = useState<Set<string>>(new Set());

  const visible = active === "all"
    ? PROJECTS
    : PROJECTS.filter((p) => p.categories.includes(active as Exclude<ProjectCategory, "all">));

  const toggle = (num: string) => {
    setFlipped((prev) => {
      const next = new Set(prev);
      next.has(num) ? next.delete(num) : next.add(num);
      return next;
    });
  };

  return (
    <section id="projects" style={{ padding: "96px 48px" }}>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
        Портфоліо
        <span style={{ display: "inline-block", height: 1, width: 40, background: "var(--accent)" }} />
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 20, marginBottom: 36 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(52px,7vw,96px)", lineHeight: 0.95, color: "var(--text)", margin: 0 }}>
          ПРОЕКТИ
        </h2>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FILTER_LABELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActive(key)}
              className={"filter-pill" + (active === key ? " filter-pill--active" : "")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 1,
          background: "var(--border)",
          border: "1px solid var(--border)",
          overflow: "hidden",
        }}
      >
        {visible.map((p) => {
          const isFlipped = flipped.has(p.num);
          return (
            <div
              key={p.num}
              className="proj-flip-wrap"
              onClick={() => toggle(p.num)}
              title="Натисни для деталей"
            >
              <div className={"proj-flip-inner" + (isFlipped ? " is-flipped" : "")}>
                {/* FRONT */}
                <article
                  className="proj-flip-face proj-card"
                  style={{ background: "var(--surface)", padding: "34px 32px 30px", position: "relative", overflow: "hidden" }}
                >
                  <div className="proj-border" style={{ position: "absolute", inset: 0, border: "1px solid transparent", transition: "border-color 0.25s", pointerEvents: "none", zIndex: 2 }} />
                  <div className="proj-num" style={{ position: "absolute", bottom: -14, right: 16, fontFamily: "var(--font-display)", fontSize: 96, lineHeight: 1, color: "var(--dim)", pointerEvents: "none", transition: "color 0.25s", zIndex: 0 }}>
                    {p.num}
                  </div>
                  <h3 className="proj-name" style={{ fontFamily: "var(--font-display)", fontSize: 26, letterSpacing: "0.04em", color: "var(--text)", marginBottom: 10, position: "relative", zIndex: 1, transition: "color 0.2s" }}>
                    {p.name}
                  </h3>
                  <p style={{ fontSize: 13, lineHeight: 1.62, color: "var(--muted)", marginBottom: 22, minHeight: 44, position: "relative", zIndex: 1 }}>
                    {p.desc}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, position: "relative", zIndex: 1 }}>
                    {p.tags.map((tag) => (
                      <span key={tag} className="proj-tag" style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.04em", padding: "3px 9px", border: "1px solid var(--border-2)", color: "var(--muted)", transition: "all 0.2s" }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div style={{ position: "absolute", bottom: 14, right: 16, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--dim)", zIndex: 3 }}>
                    деталі ↗
                  </div>
                </article>

                {/* BACK */}
                <div
                  className="proj-flip-face proj-flip-back"
                  style={{ background: "var(--surface-2)", padding: "28px 28px 24px", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}
                >
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "var(--accent)", opacity: 0.6 }} />
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 8 }}>
                    {p.num} / {p.name}
                  </p>
                  <p style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--text)", flex: 1, marginBottom: 16 }}>
                    {p.longDesc}
                  </p>
                  <div style={{ marginTop: "auto" }}>
                    {p.url ? (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--accent)", textDecoration: "none", border: "1px solid var(--accent)", padding: "6px 14px", transition: "background 0.2s, color 0.2s" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = "var(--accent)"; (e.currentTarget as HTMLAnchorElement).style.color = "#000"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; (e.currentTarget as HTMLAnchorElement).style.color = "var(--accent)"; }}
                      >
                        ↗ {p.urlLabel}
                      </a>
                    ) : (
                      <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--dim)", display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: "var(--border-2)" }}>⊘</span> {p.noUrlReason}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
