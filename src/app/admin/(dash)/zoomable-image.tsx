"use client";

import { useState, type CSSProperties } from "react";

/** Картинка в markdown: адаптив по ширине + клик → полноэкранный просмотр (зум). */
export function ZoomableImage({ src, alt, style }: { src?: string; alt?: string; style?: CSSProperties }) {
  const [zoom, setZoom] = useState(false);
  if (!src) return null;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt || ""} loading="lazy" onClick={() => setZoom(true)} style={{ ...style, cursor: "zoom-in" }} />
      {zoom && (
        <div
          onClick={() => setZoom(false)}
          style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, cursor: "zoom-out" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt || ""} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 6 }} />
        </div>
      )}
    </>
  );
}
