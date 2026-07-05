import React from "react";
import { marked, type Tokens } from "marked";
import { Loader2, AlertCircle } from "lucide-react";
import { MermaidDiagram } from "./MermaidDiagram";

// ── Sentinel placeholder ─────────────────────────────────────────────────────
// When the custom renderer encounters a mermaid code block it emits a
// self-closing sentinel div.  The chart source is base64-encoded so it
// survives HTML attribute serialisation without any quoting issues.
//
// Format:
//   <div data-mermaid-placeholder data-chart="BASE64"></div>
//
// The split regex below matches these sentinels exactly so we can interleave
// <MermaidDiagram> components in place of each one.
// ─────────────────────────────────────────────────────────────────────────────

const PLACEHOLDER_ATTR = "data-mermaid-placeholder";
// Matches the full sentinel element; captures the base64 chart in group 1.
const PLACEHOLDER_RE =
  /<div data-mermaid-placeholder data-chart="([A-Za-z0-9+/=]*)"><\/div>/g;

function buildMermaidPlaceholder(chartSource: string): string {
  const encoded = btoa(unescape(encodeURIComponent(chartSource)));
  return `<div ${PLACEHOLDER_ATTR} data-chart="${encoded}"></div>`;
}

// Install the custom renderer once — idempotent because we guard with a flag.
let rendererInstalled = false;
function ensureRenderer(): void {
  if (rendererInstalled) return;
  rendererInstalled = true;

  marked.use({
    gfm: true,
    breaks: false,
    renderer: {
      code({ text, lang }: Tokens.Code): string | false {
        if (lang?.toLowerCase() === "mermaid") {
          return buildMermaidPlaceholder(text);
        }
        // Return false to fall through to the default renderer for all other
        // fenced code blocks.
        return false;
      },
    },
  });
}

// ── Splitting helper ─────────────────────────────────────────────────────────
// Splits the marked output into an alternating array of plain HTML strings and
// decoded chart sources.  Odd-indexed items are chart sources; even-indexed
// items are HTML fragments (may be empty strings).

type HtmlChunk = { kind: "html"; html: string };
type ChartChunk = { kind: "chart"; source: string; key: string };
type RenderChunk = HtmlChunk | ChartChunk;

function splitHtml(html: string): RenderChunk[] {
  const chunks: RenderChunk[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let chartIndex = 0;

  PLACEHOLDER_RE.lastIndex = 0; // reset stateful regex
  while ((match = PLACEHOLDER_RE.exec(html)) !== null) {
    // HTML before this placeholder
    chunks.push({ kind: "html", html: html.slice(lastIndex, match.index) });

    // Decode the base64 chart source
    const source = decodeURIComponent(escape(atob(match[1] ?? "")));
    chunks.push({ kind: "chart", source, key: `mermaid-${chartIndex++}` });

    lastIndex = match.index + match[0].length;
  }

  // Remaining HTML after the last placeholder
  chunks.push({ kind: "html", html: html.slice(lastIndex) });
  return chunks;
}

// ── Component ────────────────────────────────────────────────────────────────

export interface ReportViewerProps {
  markdown: string | null;
  isLoading?: boolean;
  error?: string | null;
}

export function ReportViewer({ markdown, isLoading = false, error = null }: ReportViewerProps) {
  // Ensure the custom marked renderer is registered before first parse.
  ensureRenderer();

  const chunks = React.useMemo<RenderChunk[]>(() => {
    if (!markdown) return [];
    const html = marked.parse(markdown) as string;
    return splitHtml(html);
  }, [markdown]);

  if (isLoading) {
    return (
      <div className="report-loading">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" aria-hidden="true" />
        <span>Loading report…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="report-error">
        <AlertCircle className="w-5 h-5 shrink-0 text-red-400" aria-hidden="true" />
        <span>{error}</span>
      </div>
    );
  }

  if (chunks.length === 0) return null;

  return (
    <div className="report-scroll">
      <article className="report-prose">
        {chunks.map((chunk, index) => {
          if (chunk.kind === "chart") {
            return <MermaidDiagram key={chunk.key} chart={chunk.source} />;
          }
          // Empty HTML segments produce no DOM output — still safe to render.
          if (!chunk.html) return null;
          return (
            <React.Fragment key={`html-${index}`}>
              {/* Content comes from marked parsing trusted local agentflow reports. */}
              {/* eslint-disable-next-line react/no-danger */}
              <div dangerouslySetInnerHTML={{ __html: chunk.html }} />
            </React.Fragment>
          );
        })}
      </article>
    </div>
  );
}
