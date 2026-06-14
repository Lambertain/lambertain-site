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
  return src.replace(/\{(?:width|height|border)[^}]*\}/gi, "");
}

const linkStyle: CSSProperties = { color: "var(--accent)", textDecoration: "underline" };
const imgStyle: CSSProperties = { maxWidth: "100%", height: "auto", borderRadius: 8, border: "1px solid var(--border-2)", margin: "8px 0", display: "block" };

export function Markdown({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text)", wordBreak: "break-word" }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: (props) => <ZoomableImage src={typeof props.src === "string" ? props.src : undefined} alt={props.alt} style={imgStyle} />,
          a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" style={linkStyle} />,
          p: (props) => <p style={{ margin: "8px 0" }}>{props.children}</p>,
          ul: (props) => <ul style={{ margin: "8px 0", paddingLeft: 20 }}>{props.children}</ul>,
          ol: (props) => <ol style={{ margin: "8px 0", paddingLeft: 20 }}>{props.children}</ol>,
          h1: (props) => <h3 style={{ fontSize: 17, margin: "12px 0 6px" }}>{props.children}</h3>,
          h2: (props) => <h3 style={{ fontSize: 16, margin: "12px 0 6px" }}>{props.children}</h3>,
          h3: (props) => <h4 style={{ fontSize: 15, margin: "10px 0 6px" }}>{props.children}</h4>,
          hr: () => <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />,
          code: (props) => <code style={{ fontFamily: "var(--font-mono)", fontSize: 13, background: "var(--surface-2)", padding: "1px 4px", borderRadius: 3 }}>{props.children}</code>,
        }}
      >
        {clean(children)}
      </ReactMarkdown>
    </div>
  );
}
