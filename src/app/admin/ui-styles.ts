/**
 * Общие стили админки/портала — в дизайн-языке lambertain.site.
 * Тёмный фон, лаймовый акцент, моно-лейблы капсом, острые углы.
 * Чистые объекты стилей: импортируются и в server, и в client компоненты.
 */
import type { CSSProperties } from "react";

export const ui = {
  page: {
    minHeight: "100vh",
    background: "var(--bg)",
    color: "var(--text)",
    fontFamily: "var(--font-body), system-ui, sans-serif",
    cursor: "auto", // на сайте глобально cursor:none — в админке возвращаем обычный
  } as CSSProperties,

  monoLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--muted)",
  } as CSSProperties,

  h1: {
    fontFamily: "var(--font-display)",
    fontSize: 40,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    margin: 0,
    lineHeight: 1,
  } as CSSProperties,

  card: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    padding: 24,
  } as CSSProperties,

  input: {
    width: "100%",
    padding: "10px 12px",
    background: "var(--surface-2)",
    border: "1px solid var(--border-2)",
    color: "var(--text)",
    fontFamily: "var(--font-body)",
    fontSize: 14,
    outline: "none",
  } as CSSProperties,

  fieldLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--muted)",
    marginBottom: 6,
    display: "block",
  } as CSSProperties,

  btn: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    padding: "11px 22px",
    border: "1px solid var(--border-2)",
    background: "transparent",
    color: "var(--text)",
    cursor: "pointer",
  } as CSSProperties,

  btnAccent: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    padding: "11px 22px",
    border: "1px solid var(--accent)",
    background: "var(--accent)",
    color: "#000",
    fontWeight: 500,
    cursor: "pointer",
  } as CSSProperties,
};
