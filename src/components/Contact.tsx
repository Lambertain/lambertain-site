import { GithubIcon, SendIcon, InstagramIcon, YoutubeIcon, TikTokIcon } from "./Icons";

export default function Contact() {
  return (
    <section
      id="contact"
      style={{
        padding: "96px 48px",
        background: "var(--surface)",
        borderTop: "1px solid var(--border)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -100,
          right: -100,
          width: 500,
          height: 500,
          background: "radial-gradient(circle, rgba(185,255,75,0.05) 0%, transparent 65%)",
          pointerEvents: "none",
        }}
      />

      <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 10, display: "flex", alignItems: "center", gap: 12, position: "relative", zIndex: 1 }}>
        Зв&apos;язок
        <span style={{ display: "inline-block", height: 1, width: 40, background: "var(--accent)" }} />
      </p>

      <h2
        className="reveal"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(60px,9vw,130px)",
          lineHeight: 0.92,
          color: "var(--text)",
          marginBottom: 52,
          position: "relative",
          zIndex: 1,
        }}
      >
        МАЄШ<br />
        <span style={{ color: "var(--accent)" }}>ІДЕЮ?</span>
      </h2>

      <div className="reveal" style={{ display: "flex", gap: 12, flexWrap: "wrap", position: "relative", zIndex: 1 }}>
        <ContactBtn href="https://t.me/solovenik" icon={<SendIcon />} primary>
          @solovenik
        </ContactBtn>
        <ContactBtn href="https://github.com/Lambertain" icon={<GithubIcon />}>
          github.com/Lambertain
        </ContactBtn>
        <ContactBtn href="https://www.instagram.com/solovey_nikita/" icon={<InstagramIcon />}>
          @solovey_nikita
        </ContactBtn>
        <ContactBtn href="https://www.youtube.com/@LazyIncome_AI" icon={<YoutubeIcon />}>
          @LazyIncome_AI
        </ContactBtn>
        <ContactBtn href="https://www.tiktok.com/@lazyincome_ai" icon={<TikTokIcon />}>
          @lazyincome_ai
        </ContactBtn>
      </div>

      <footer style={{ marginTop: 80, borderTop: "1px solid var(--border)", paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--muted)" }}>
          © 2026 Lambertain · Full-Stack Developer
        </p>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--muted)" }}>
          Побудовано з ☕ та надмірною кількістю npm пакетів
        </p>
      </footer>
    </section>
  );
}

function ContactBtn({
  href, children, icon, primary,
}: {
  href: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="btn-fill"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 9,
        padding: "13px 26px",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        letterSpacing: "0.05em",
        textDecoration: "none",
        border: "1px solid",
        borderColor: primary ? "var(--accent)" : "var(--border-2)",
        background: primary ? "var(--accent)" : "transparent",
        color: primary ? "#000" : "var(--text)",
        fontWeight: primary ? 500 : 400,
        whiteSpace: "nowrap",
        transition: "color 0.25s, border-color 0.25s",
      }}
    >
      {icon}
      <span>{children}</span>
    </a>
  );
}
