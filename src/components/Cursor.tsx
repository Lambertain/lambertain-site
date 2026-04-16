"use client";
import { useEffect, useRef } from "react";

export default function Cursor() {
  const dot  = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const mx = useRef(0);
  const my = useRef(0);
  const rx = useRef(0);
  const ry = useRef(0);
  const raf = useRef<number>(0);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mx.current = e.clientX;
      my.current = e.clientY;
      if (dot.current) {
        dot.current.style.left = e.clientX + "px";
        dot.current.style.top  = e.clientY + "px";
      }
    };

    const tick = () => {
      rx.current += (mx.current - rx.current) * 0.11;
      ry.current += (my.current - ry.current) * 0.11;
      if (ring.current) {
        ring.current.style.left = rx.current + "px";
        ring.current.style.top  = ry.current + "px";
      }
      raf.current = requestAnimationFrame(tick);
    };

    const onEnter = () => {
      if (!ring.current) return;
      ring.current.style.width  = "56px";
      ring.current.style.height = "56px";
      ring.current.style.borderColor = "rgba(185,255,75,0.55)";
    };
    const onLeave = () => {
      if (!ring.current) return;
      ring.current.style.width  = "34px";
      ring.current.style.height = "34px";
      ring.current.style.borderColor = "rgba(185,255,75,0.28)";
    };

    document.addEventListener("mousemove", onMove);
    raf.current = requestAnimationFrame(tick);

    const targets = document.querySelectorAll("a, button, .proj-card, .skill-col");
    targets.forEach(el => {
      el.addEventListener("mouseenter", onEnter);
      el.addEventListener("mouseleave", onLeave);
    });

    return () => {
      document.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf.current);
      targets.forEach(el => {
        el.removeEventListener("mouseenter", onEnter);
        el.removeEventListener("mouseleave", onLeave);
      });
    };
  }, []);

  return (
    <>
      <div
        id="cur-dot"
        ref={dot}
        style={{
          width: 7, height: 7,
          background: "var(--accent)",
          borderRadius: "50%",
          position: "fixed",
          top: 0, left: 0,
          pointerEvents: "none",
          zIndex: 9999,
          transform: "translate(-50%,-50%)",
        }}
      />
      <div
        id="cur-ring"
        ref={ring}
        style={{
          width: 34, height: 34,
          border: "1px solid rgba(185,255,75,0.28)",
          borderRadius: "50%",
          position: "fixed",
          top: 0, left: 0,
          pointerEvents: "none",
          zIndex: 9998,
          transform: "translate(-50%,-50%)",
          transition: "width 0.2s, height 0.2s, border-color 0.2s",
        }}
      />
    </>
  );
}
