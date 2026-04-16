const SERVICES = [
  {
    icon: "✦",
    title: "Telegram боти та Mini Apps",
    desc: "Складні multi-step боти, inline-режими, Telegram Stars/Stripe оплата. TWA з React-фронтендом і повноцінним бекенд API.",
  },
  {
    icon: "◈",
    title: "AI-інтеграції",
    desc: "ChatGPT, Claude, Grok, Whisper — в будь-який продукт. Транскрипція, аналіз документів, чат-боти, AI-конспекти, голосові помічники.",
  },
  {
    icon: "⬡",
    title: "SaaS-платформи",
    desc: "Multi-tenant архітектура, ролі та права, Stripe-оплата, адмін-панель, аналітика. Від MVP за 2 тижні до production.",
  },
  {
    icon: "◻",
    title: "Full-Stack веб-застосунки",
    desc: "React + Next.js фронтенди, Node.js / Python / FastAPI бекенди. PostgreSQL, Prisma, tRPC. Docker-деплой на VPS або Railway.",
  },
  {
    icon: "⟐",
    title: "Автоматизація та парсинг",
    desc: "Playwright / Telethon / Selenium. Парсинг сайтів і Telegram-чатів, API-інтеграції з CRM, webhook-обробники, workflow-автоматизація.",
  },
  {
    icon: "⊕",
    title: "Мобільні застосунки",
    desc: "PWA та Capacitor Android-застосунки. Публікація у Google Play. Той самий React-код — у веб і мобайл без подвійної розробки.",
  },
];

export default function Services() {
  return (
    <section
      id="services"
      style={{
        padding: "96px 48px",
        borderTop: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
        Послуги
        <span style={{ display: "inline-block", height: 1, width: 40, background: "var(--accent)" }} />
      </p>
      <h2 className="reveal" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(52px,7vw,96px)", lineHeight: 0.95, color: "var(--text)", marginBottom: 56 }}>
        ЩО Я<br />
        <span style={{ color: "var(--accent)" }}>РОБЛЮ</span>
      </h2>

      <div
        className="reveal"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 1,
          background: "var(--border)",
          border: "1px solid var(--border)",
          overflow: "hidden",
        }}
      >
        {SERVICES.map((s) => (
          <div
            key={s.title}
            className="service-tile"
            style={{
              background: "var(--surface)",
              padding: "36px 32px 32px",
              transition: "background 0.22s",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <span
              style={{
                display: "block",
                fontFamily: "var(--font-display)",
                fontSize: 28,
                color: "var(--accent)",
                marginBottom: 18,
                lineHeight: 1,
                opacity: 0.7,
              }}
            >
              {s.icon}
            </span>
            <h3
              className="service-title"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 20,
                letterSpacing: "0.03em",
                color: "var(--text)",
                marginBottom: 12,
                lineHeight: 1.2,
                transition: "color 0.2s",
              }}
            >
              {s.title}
            </h3>
            <p style={{ fontSize: 13, lineHeight: 1.65, color: "var(--muted)" }}>
              {s.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
