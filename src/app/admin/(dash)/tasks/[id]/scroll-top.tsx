"use client";

import { useEffect, useState } from "react";

/** DEV-23: кнопка быстрого подъёма наверх на длинной задаче. Скроллит контейнер .pm-main (не window). */
export function ScrollTop({ label }: { label: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = document.querySelector(".pm-main");
    if (!el) return;
    const onScroll = () => setShow(el.scrollTop > 400);
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  if (!show) return null;
  return (
    <button
      onClick={() => document.querySelector(".pm-main")?.scrollTo({ top: 0, behavior: "smooth" })}
      title={label}
      aria-label={label}
      style={{ position: "fixed", right: 20, bottom: 20, zIndex: 900, width: 44, height: 44, borderRadius: 999, background: "var(--accent)", color: "#000", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(0,0,0,0.4)" }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
    </button>
  );
}
