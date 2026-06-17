"use client";

import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";

/**
 * Кнопка «Назад»: возвращает на предыдущую страницу (откуда пришёл), а не всегда в список задач.
 * Если истории нет (открыли задачу напрямую — например, из пуша) — фолбэк на fallbackHref.
 */
export function BackButton({ fallbackHref, label, style }: { fallbackHref: string; label: string; style: CSSProperties }) {
  const router = useRouter();
  function go() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(fallbackHref);
  }
  return (
    <button onClick={go} style={style}>
      {label}
    </button>
  );
}
