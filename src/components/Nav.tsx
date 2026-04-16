"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <nav
      style={{
        position: "fixed",
        inset: "0 0 auto",
        zIndex: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "18px 48px",
        borderBottom: `1px solid ${scrolled ? "var(--border-2)" : "var(--border)"}`,
        background: "rgba(8,8,8,0.9)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        transition: "border-color 0.3s",
      }}
    >
      <Link
        href="#"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 20,
          letterSpacing: "0.08em",
          color: "var(--text)",
          textDecoration: "none",
        }}
      >
        LAMB<span style={{ color: "var(--accent)" }}>.</span>
      </Link>

      <ul className="nav-links" style={{ display: "flex", gap: 28, listStyle: "none" }}>
        {[
          { href: "#services", label: "Послуги" },
          { href: "#projects", label: "Проекти" },
          { href: "#stack",    label: "Стек" },
          { href: "#contact",  label: "Контакти" },
        ].map(({ href, label }) => (
          <li key={href}>
            <a
              href={href}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--muted)",
                textDecoration: "none",
                transition: "color 0.2s",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--accent)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--muted)")}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
