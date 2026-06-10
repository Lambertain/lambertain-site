"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { ui } from "../ui-styles";

export function OpenInBrowser({ label }: { label: string }) {
  const [inTelegram, setInTg] = useState(false);
  const [busy, setBusy] = useState(false);

  function check() {
    // @ts-expect-error — SDK Telegram
    const wa = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
    setInTg(!!wa?.initData);
  }

  useEffect(() => {
    check();
  }, []);

  async function open() {
    setBusy(true);
    try {
      const res = await fetch("/api/web-login-token", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.token) {
        const url = `${window.location.origin}/api/auth/web?token=${data.token}`;
        // @ts-expect-error — SDK Telegram
        const wa = window.Telegram?.WebApp;
        if (wa?.openLink) wa.openLink(url);
        else window.open(url, "_blank");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!inTelegram) return <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onLoad={check} />;

  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onLoad={check} />
      <button onClick={open} disabled={busy} style={{ ...ui.btn, padding: "7px 14px" }}>
        {busy ? "…" : label}
      </button>
    </>
  );
}
