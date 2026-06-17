import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { CSSProperties } from "react";
import { ZoomableImage } from "./zoomable-image";

/**
 * Рендер описания задачи как markdown (картинки, ссылки, жирный, списки).
 * Источник — импортированный markdown YouTrack: картинки вида `![](/api/files/12){width=70%}`.
 * Аннотации размера YouTrack (`{width=..}`) markdown не понимает — срезаем перед рендером.
 */
function clean(src: string): string {
  return src
    .replace(/\{(?:width|height|border)[^}]*\}/gi, "")
    // Тела комментов/триажа/итогов хранят HTML-разметку для Telegram (parse_mode=HTML): <b>/<i>/<code>.
    // На портале рендерим Markdown — конвертируем этот узкий набор тегов, чтобы не показывать <b></b> текстом.
    // Сырой HTML (rehype-raw) НЕ включаем — переводим только эти теги в Markdown-эквиваленты.
    .replace(/<\/?(?:b|strong)>/gi, "**")
    .replace(/<\/?(?:i|em)>/gi, "*")
    .replace(/<\/?code>/gi, "`")
    .replace(/<br\s*\/?>/gi, "\n");
}

const linkStyle: CSSProperties = { color: "var(--accent)", textDecoration: "underline" };
const imgStyle: CSSProperties = { maxWidth: "100%", height: "auto", borderRadius: 8, border: "1px solid var(--border-2)", margin: "8px 0", display: "block" };
// Карточка-файл (вложение-документ: .apk/.pdf/.docx и т.п.) — иконка + имя + «скачать», вместо голой ссылки.
const fileChipStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, margin: "6px 0", padding: "8px 12px", border: "1px solid var(--border-2)", borderRadius: 8, background: "var(--surface-2)", color: "var(--text)", textDecoration: "none", maxWidth: "100%" };
/** Ссылка на самохостинговое вложение (файл задачи/коммента). */
function isAttachmentHref(href: string): boolean {
  return /\/api\/(?:files|dev\/files|guide-files|onboarding-media)\/\d+/.test(href);
}

export function Markdown({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text)", wordBreak: "break-word" }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: (props) => <ZoomableImage src={typeof props.src === "string" ? props.src : undefined} alt={props.alt} style={imgStyle} />,
          a: (props) => {
            const href = typeof props.href === "string" ? props.href : "";
            // Вложение-файл → карточка с иконкой и «скачать»; обычная ссылка — как было.
            if (href && isAttachmentHref(href)) {
              return (
                <a href={href} target="_blank" rel="noopener noreferrer" download style={fileChipStyle}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{props.children}</span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                </a>
              );
            }
            return <a {...props} target="_blank" rel="noopener noreferrer" style={linkStyle} />;
          },
          p: (props) => <p style={{ margin: "8px 0" }}>{props.children}</p>,
          // listStyle задаём явно: Tailwind-preflight сбрасывает list-style на none → иначе маркеры/нумерация пропадают.
          ul: (props) => <ul style={{ margin: "8px 0", paddingLeft: 22, listStyleType: "disc", listStylePosition: "outside" }}>{props.children}</ul>,
          ol: (props) => <ol style={{ margin: "8px 0", paddingLeft: 22, listStyleType: "decimal", listStylePosition: "outside" }}>{props.children}</ol>,
          li: (props) => <li style={{ margin: "2px 0" }}>{props.children}</li>,
          h1: (props) => <h3 style={{ fontSize: 17, margin: "12px 0 6px" }}>{props.children}</h3>,
          h2: (props) => <h3 style={{ fontSize: 16, margin: "12px 0 6px" }}>{props.children}</h3>,
          h3: (props) => <h4 style={{ fontSize: 15, margin: "10px 0 6px" }}>{props.children}</h4>,
          hr: () => <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />,
          code: (props) => <code style={{ fontFamily: "var(--font-mono)", fontSize: 13, background: "var(--surface-2)", padding: "1px 4px", borderRadius: 3 }}>{props.children}</code>,
          blockquote: (props) => <blockquote style={{ borderLeft: "3px solid var(--border-2)", margin: "8px 0", padding: "2px 0 2px 12px", color: "var(--muted)" }}>{props.children}</blockquote>,
          // GFM-таблицы: горизонтальный скролл на узких экранах (TMA) — таблица не разъезжает вёрстку.
          table: (props) => (
            <div style={{ overflowX: "auto", margin: "10px 0", WebkitOverflowScrolling: "touch" }}>
              <table style={{ borderCollapse: "collapse", fontSize: 13, minWidth: "100%" }}>{props.children}</table>
            </div>
          ),
          th: (props) => <th style={{ border: "1px solid var(--border-2)", padding: "6px 10px", background: "var(--surface-2)", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>{props.children}</th>,
          td: (props) => <td style={{ border: "1px solid var(--border-2)", padding: "6px 10px", verticalAlign: "top" }}>{props.children}</td>,
        }}
      >
        {clean(children)}
      </ReactMarkdown>
    </div>
  );
}
