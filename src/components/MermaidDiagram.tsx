import React from "react";
import mermaid from "mermaid";
import { Loader2, AlertCircle } from "lucide-react";

// Initialise once at module load — never call startOnLoad inside a SPA.
mermaid.initialize({ startOnLoad: false, theme: "default" });

interface MermaidDiagramProps {
  chart: string;
}

type RenderState =
  | { status: "loading" }
  | { status: "success"; svg: string }
  | { status: "error"; message: string };

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  // useId generates a stable React-unique id; mermaid requires alphanumeric ids.
  const rawId = React.useId();
  const id = `mermaid${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;

  const containerRef = React.useRef<HTMLDivElement>(null);
  const [state, setState] = React.useState<RenderState>({ status: "loading" });

  React.useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    mermaid
      .render(id, chart)
      .then(({ svg, bindFunctions }) => {
        if (cancelled) return;
        setState({ status: "success", svg });
        // bindFunctions attaches interactive event listeners (e.g. for flowchart
        // click events). We call it after the next paint once the SVG is in the DOM.
        if (bindFunctions) {
          // Use a micro-task; the state update above will trigger a re-render that
          // inserts the SVG, then bindFunctions wires up any listeners.
          Promise.resolve().then(() => {
            if (!cancelled && containerRef.current) {
              bindFunctions(containerRef.current);
            }
          });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "Failed to render diagram";
        setState({ status: "error", message });
      });

    return () => {
      cancelled = true;
    };
    // chart and id are both stable/derived from props — re-run only when chart changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart]);

  if (state.status === "loading") {
    return (
      <div className="mermaid-loading" role="status" aria-label="Rendering diagram…">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        <span>Rendering diagram…</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mermaid-error" role="alert">
        <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>Diagram error: {state.message}</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mermaid-diagram"
      // SVG comes from mermaid's own renderer — trusted content, not user-supplied HTML.
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: state.svg }}
      aria-label="Mermaid diagram"
    />
  );
}
