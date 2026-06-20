"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Живое обновление страницы: периодически дёргает router.refresh() — мягкий рефетч server-компонентов
 * (новые комменты/задачи/статусы появляются сами, без ручного F5). Это НЕ перезагрузка: состояние клиентских
 * компонентов (набранный коммент, скролл) сохраняется. Тикает только когда вкладка видима + при возврате фокуса.
 */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") router.refresh(); };
    const id = setInterval(tick, Math.max(5, seconds) * 1000);
    const onVisible = () => { if (document.visibilityState === "visible") router.refresh(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, seconds]);
  return null;
}
