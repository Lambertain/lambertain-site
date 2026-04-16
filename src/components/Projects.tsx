"use client";
import { useState } from "react";
import { PROJECTS, FILTER_LABELS, type ProjectCategory } from "@/data/projects";

export default function Projects() {
  const [active, setActive] = useState<ProjectCategory>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const visible = active === "all"
    ? PROJECTS
    : PROJECTS.filter((p) => p.categories.includes(active as Exclude<ProjectCategory, "all">));

  const toggle = (num: string) => {
    setExpanded((prev) => {
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
        className="grid-3"
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
          const isOpen = expanded.has(p.num);
          return (
            <article
              key={p.num}
              className="proj-card"
              style={{
                background: "var(--surface)",
                padding: "28px 28px 22px",
                position: "relative",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                cursor: "pointer",
              }}
              onClick={() => toggle(p.num)}
            >
              {/* hover border */}
              <div className="proj-border" style={{ position: "absolute", inset: 0, border: "1px solid transparent", transition: "border-color 0.25s", pointerEvents: "none", zIndex: 2 }} />

              {/* bg number */}
              <div className="proj-num" style={{ position: "absolute", bottom: -14, right: 12, fontFamily: "var(--font-display)", fontSize: 88, lineHeight: 1, color: "var(--dim)", pointerEvents: "none", transition: "color 0.25s", zIndex: 0 }}>
                {p.num}
              </div>

              {/* title row */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8, position: "relative", zIndex: 1 }}>
                <h3 className="proj-name" style={{ fontFamily: "var(--font-display)", fontSize: 22, letterSpacing: "0.04em", color: "var(--text)", transition: "color 0.2s", lineHeight: 1.1 }}>
                  {p.name}
                </h3>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--dim)", paddingTop: 4, flexShrink: 0, transition: "color 0.2s" }} className="proj-toggle">
                  {isOpen ? "▲" : "▼"}
                </span>
              </div>

              {/* desc */}
              <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--muted)", marginBottom: 14, position: "relative", zIndex: 1 }}>
                {p.desc}
              </p>

              {/* tags */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12, position: "relative", zIndex: 1 }}>
                {p.tags.map((tag) => (
                  <span key={tag} className="proj-tag" style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.04em", padding: "2px 8px", border: "1px solid var(--border-2)", color: "var(--muted)", transition: "all 0.2s" }}>
                    {tag}
                  </span>
                ))}
              </div>

              {/* links — always visible */}
              {p.links.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, position: "relative", zIndex: 3 }} onClick={e => e.stopPropagation()}>
                  {p.links.map((link) => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontFamily: "var(--font-mono)",
                        fontSize: 9.5,
                        letterSpacing: "0.04em",
                        color: "var(--accent)",
                        textDecoration: "none",
                        border: "1px solid rgba(185,255,75,0.35)",
                        padding: "4px 10px",
                        transition: "background 0.18s, color 0.18s, border-color 0.18s",
                      }}
                      onMouseEnter={e => {
                        const el = e.currentTarget as HTMLAnchorElement;
                        el.style.background = "var(--accent)";
                        el.style.color = "#000";
                        el.style.borderColor = "var(--accent)";
                      }}
                      onMouseLeave={e => {
                        const el = e.currentTarget as HTMLAnchorElement;
                        el.style.background = "transparent";
                        el.style.color = "var(--accent)";
                        el.style.borderColor = "rgba(185,255,75,0.35)";
                      }}
                    >
                      ↗ {link.label}
                    </a>
                  ))}
                </div>
              )}

              {/* expanded details */}
              {isOpen && (
                <div style={{
                  marginTop: 16,
                  paddingTop: 14,
                  borderTop: "1px solid var(--border-2)",
                  position: "relative",
                  zIndex: 1,
                }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "var(--accent)", opacity: 0.25 }} />
                  <p style={{ fontSize: 12, lineHeight: 1.7, color: "var(--muted)" }}>
                    {p.longDesc}
                  </p>
                  {p.links.length === 0 && p.noUrlReason && (
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--dim)", marginTop: 10 }}>
                      ⊘ {p.noUrlReason}
                    </p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
