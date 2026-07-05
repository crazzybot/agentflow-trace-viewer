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

/**
 * Removes any leftover mermaid sentinel / error elements that mermaid v11 may
 * have appended directly to document.body during a failed (or interrupted)
 * render.  We match by id prefix ("mermaid") but skip any element that is
 * inside a React-controlled container so we never remove live diagram output.
 */
function purgeMermaidSentinels(ownId: string): void {
  const sentinels = document.body.querySelectorAll<HTMLElement>('[id^="mermaid"]');
  sentinels.forEach((el) => {
    // Skip the element if it is the scratch container we created (identified by
    // our own id) — that is managed explicitly by the caller.
    // Also skip elements that are not direct children of body; those belong to
    // React-rendered subtrees and must not be touched.
    if (el.id === ownId) return;
    if (el.parentElement !== document.body) return;
    el.remove();
  });
}

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  // useId generates a stable React-unique id; mermaid requires alphanumeric ids.
  const rawId = React.useId();
  const id = `mermaid${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;

  const containerRef = React.useRef<HTMLDivElement>(null);
  const [state, setState] = React.useState<RenderState>({ status: "loading" });

  React.useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    // Create a detached off-screen element and attach it to document.body.
    // Passing it as the third argument to mermaid.render() tells mermaid v11
    // to use THIS element as its internal staging/scratch area instead of
    // appending an arbitrary sentinel directly to document.body.  We remove
    // the scratch element ourselves in every exit path (success, error, and
    // effect cleanup), so it never lingers visibly on the page.
    const scratch = document.createElement("div");
    scratch.id = id;
    scratch.style.cssText =
      "position:absolute;top:-9999px;left:-9999px;visibility:hidden;pointer-events:none;";
    document.body.appendChild(scratch);

    mermaid
      .render(id, chart, scratch)
      .then(({ svg, bindFunctions }) => {
        // Always remove the scratch element first, whether we use the result or not.
        if (document.body.contains(scratch)) document.body.removeChild(scratch);
        // Remove any additional mermaid sentinels left by this or prior renders.
        purgeMermaidSentinels(id);

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
        // Always clean up the scratch element even on error.
        if (document.body.contains(scratch)) document.body.removeChild(scratch);
        // Remove any additional mermaid sentinels left by this or prior renders.
        purgeMermaidSentinels(id);

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
      // Cleanup if the effect is torn down before the promise settles
      // (e.g. chart prop changes rapidly, or the component unmounts).
      if (document.body.contains(scratch)) document.body.removeChild(scratch);
      // Purge any sentinels that may have been left by the interrupted render.
      purgeMermaidSentinels(id);
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
