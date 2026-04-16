import { STACK } from "@/data/projects";

export default function Stack() {
  return (
    <section
      id="stack"
      style={{
        padding: "96px 48px",
        background: "var(--surface)",
        borderTop: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
        Технології
        <span style={{ display: "inline-block", height: 1, width: 40, background: "var(--accent)" }} />
      </p>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(52px,7vw,96px)", lineHeight: 0.95, color: "var(--text)", marginBottom: 56 }}>
        СТЕК
      </h2>

      <div
        className="reveal grid-4"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 1,
          background: "var(--border)",
          border: "1px solid var(--border)",
          overflow: "hidden",
        }}
      >
        {STACK.map((col) => (
          <div
            key={col.label}
            className="skill-col"
            style={{
              background: "var(--surface)",
              padding: "30px 28px 36px",
              transition: "background 0.2s",
            }}
          >
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)", paddingBottom: 14, marginBottom: 18, borderBottom: "1px solid var(--border)" }}>
              {col.label}
            </p>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 9 }}>
              {col.items.map((item) => (
                <li
                  key={item}
                  className="skill-item"
                  style={{ fontSize: 13.5, color: "var(--muted)", display: "flex", alignItems: "center", gap: 9, transition: "color 0.18s" }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--dim)", transition: "color 0.18s" }}>→</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
