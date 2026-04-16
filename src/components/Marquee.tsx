import { MARQUEE_ITEMS } from "@/data/projects";

export default function Marquee() {
  const items = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS]; // duplicate for seamless loop

  return (
    <div
      style={{
        overflow: "hidden",
        borderTop: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "13px 0",
      }}
      aria-hidden
    >
      <div className="marquee-track" style={{ display: "flex", width: "max-content" }}>
        {items.map((item, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 36,
              paddingRight: 36,
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--muted)",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ width: 4, height: 4, background: "var(--accent)", borderRadius: "50%", flexShrink: 0, display: "inline-block" }} />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
