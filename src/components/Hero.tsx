import { GithubIcon, SendIcon, InstagramIcon, YoutubeIcon, TikTokIcon } from "./Icons";

export default function Hero() {
  return (
    <section
      style={{
        position: "relative",
        minHeight: "100svh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        padding: "0 48px 80px",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
          maskImage:
            "radial-gradient(ellipse 70% 60% at 50% 100%, rgba(0,0,0,0.65) 0%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 60% at 50% 100%, rgba(0,0,0,0.65) 0%, transparent 100%)",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: -120,
          left: -80,
          width: 600,
          height: 600,
          background: "radial-gradient(circle, rgba(185,255,75,0.055) 0%, transparent 65%)",
          pointerEvents: "none",
        }}
      />

      <p className="anim-0" style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 14, position: "relative", zIndex: 1 }}>
        Full-Stack Developer · AI · Telegram · SaaS
      </p>

      <h1
        className="anim-1"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(72px, 13vw, 210px)",
          lineHeight: 0.88,
          letterSpacing: "0.01em",
          color: "var(--text)",
          position: "relative",
          zIndex: 1,
        }}
      >
        LAMBERTAIN<span className="blink" style={{ color: "var(--accent)" }}>_</span>
      </h1>

      <div
        className="anim-2"
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 32,
          marginTop: 36,
          position: "relative",
          zIndex: 1,
          flexWrap: "wrap",
        }}
      >
        <div style={{ maxWidth: 380 }}>
          <strong style={{ display: "block", fontSize: 18, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
            Будую продукти, які працюють.
          </strong>
          <p style={{ fontSize: 14, lineHeight: 1.65, color: "var(--muted)" }}>
            AI-інтеграції, Telegram Mini Apps і SaaS-платформи —<br />від ідеї до production.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Btn href="https://github.com/Lambertain" primary icon={<GithubIcon />}>GitHub</Btn>
          <Btn href="https://t.me/solovenik" icon={<SendIcon />}>Telegram</Btn>
          <Btn href="https://www.instagram.com/solovey_nikita/" icon={<InstagramIcon />}>Instagram</Btn>
          <Btn href="https://www.youtube.com/@LazyIncome_AI" icon={<YoutubeIcon />}>YouTube</Btn>
          <Btn href="https://www.tiktok.com/@lazyincome_ai" icon={<TikTokIcon />}>TikTok</Btn>
        </div>
      </div>

      <div
        className="anim-3"
        aria-hidden
        style={{
          position: "absolute",
          right: 48,
          bottom: 84,
          writingMode: "vertical-rl",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "var(--muted)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        Scroll
        <span style={{ display: "block", width: 1, height: 56, background: "linear-gradient(to bottom, var(--accent), transparent)" }} />
      </div>
    </section>
  );
}

function Btn({
  href, children, icon, primary,
}: {
  href: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  primary?: boolean;
}) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "11px 22px",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.06em",
    textDecoration: "none",
    border: "1px solid",
    whiteSpace: "nowrap",
    transition: "color 0.25s, border-color 0.25s",
  };
  const variant: React.CSSProperties = primary
    ? { background: "var(--accent)", color: "#000", borderColor: "var(--accent)", fontWeight: 500 }
    : { background: "transparent", color: "var(--text)", borderColor: "var(--border-2)" };

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="btn-fill" style={{ ...base, ...variant }}>
      {icon}
      <span>{children}</span>
    </a>
  );
}
