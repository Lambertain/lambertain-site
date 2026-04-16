import { PROJECTS } from "@/data/projects";

export default function Projects() {
  return (
    <section id="projects" style={{ padding: "96px 48px" }}>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
        Портфоліо
        <span style={{ display: "inline-block", height: 1, width: 40, background: "var(--accent)" }} />
      </p>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(52px,7vw,96px)", lineHeight: 0.95, color: "var(--text)", marginBottom: 56 }}>
        ПРОЕКТИ
      </h2>

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
        {PROJECTS.map((p) => (
          <article
            key={p.num}
            className="proj-card reveal"
            style={{
              background: "var(--surface)",
              padding: "34px 32px 30px",
              position: "relative",
              overflow: "hidden",
              transition: "background 0.25s",
            }}
          >
            {/* hover border overlay */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                border: "1px solid transparent",
                transition: "border-color 0.25s",
                pointerEvents: "none",
                zIndex: 2,
              }}
              className="proj-border"
            />

            <div
              className="proj-num"
              style={{
                position: "absolute",
                bottom: -14,
                right: 16,
                fontFamily: "var(--font-display)",
                fontSize: 96,
                lineHeight: 1,
                color: "var(--dim)",
                pointerEvents: "none",
                transition: "color 0.25s",
                zIndex: 0,
              }}
            >
              {p.num}
            </div>

            <h3
              className="proj-name"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 26,
                letterSpacing: "0.04em",
                color: "var(--text)",
                marginBottom: 10,
                position: "relative",
                zIndex: 1,
                transition: "color 0.2s",
              }}
            >
              {p.name}
            </h3>

            <p
              style={{
                fontSize: 13,
                lineHeight: 1.62,
                color: "var(--muted)",
                marginBottom: 22,
                minHeight: 44,
                position: "relative",
                zIndex: 1,
              }}
            >
              {p.desc}
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, position: "relative", zIndex: 1 }}>
              {p.tags.map((tag) => (
                <span
                  key={tag}
                  className="proj-tag"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9.5,
                    letterSpacing: "0.04em",
                    padding: "3px 9px",
                    border: "1px solid var(--border-2)",
                    color: "var(--muted)",
                    transition: "all 0.2s",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
