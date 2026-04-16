"use client";
import { useEffect, useRef } from "react";

export default function ScrollReveal() {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target as HTMLElement;
          const siblings = Array.from(el.parentElement?.children ?? []);
          const col = siblings.indexOf(el) % 3;
          setTimeout(() => el.classList.add("in"), col * 90);
          io.unobserve(el);
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -36px 0px" }
    );

    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}
