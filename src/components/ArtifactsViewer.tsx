import React from "react";
import { Loader2, AlertCircle, FileText, File } from "lucide-react";
import { fetchRunArtifacts, fetchRunArtifactContent } from "../api/agentflow";
import type { RunArtifact } from "../types/artifacts";
import { ReportViewer } from "./ReportViewer";

interface ArtifactsViewerProps {
  runId: string;
}

function getExt(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot + 1).toLowerCase() : "";
}

export function ArtifactsViewer({ runId }: ArtifactsViewerProps) {
  const [artifacts, setArtifacts] = React.useState<RunArtifact[] | null>(null);
  const [listError, setListError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<RunArtifact | null>(null);
  const [content, setContent] = React.useState<string | null>(null);
  const [contentLoading, setContentLoading] = React.useState(false);
  const [contentError, setContentError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetchRunArtifacts(runId)
      .then((list) => { if (!cancelled) setArtifacts(list); })
      .catch((err) => { if (!cancelled) setListError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [runId]);

  async function handleSelect(artifact: RunArtifact) {
    if (selected?.id === artifact.id) return;
    setSelected(artifact);
    setContent(null);
    setContentError(null);
    setContentLoading(true);
    try {
      const data = await fetchRunArtifactContent(runId, artifact.id);
      setContent(data.content);
    } catch (err) {
      setContentError(err instanceof Error ? err.message : String(err));
    } finally {
      setContentLoading(false);
    }
  }

  const selectedExt = selected ? getExt(selected.path) : "";
  const isMarkdown = selectedExt === "md" || selectedExt === "markdown";

  return (
    <div className="artifacts-layout">
      <aside className="artifacts-sidebar">
        {!artifacts && !listError && (
          <div className="artifacts-sidebar-state">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" aria-hidden="true" />
            <span>Loading artifacts…</span>
          </div>
        )}
        {listError && (
          <div className="artifacts-sidebar-state artifacts-sidebar-state--error">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" aria-hidden="true" />
            <span>{listError}</span>
          </div>
        )}
        {artifacts && artifacts.length === 0 && (
          <p className="artifacts-sidebar-empty">No artifacts for this run.</p>
        )}
        {artifacts && artifacts.length > 0 && (
          <ul className="artifacts-list" role="listbox" aria-label="Artifacts">
            {artifacts.map((a) => {
              const ext = getExt(a.path);
              const isMd = ext === "md" || ext === "markdown";
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected?.id === a.id}
                    className={`artifacts-item ${selected?.id === a.id ? "artifacts-item--active" : ""}`}
                    onClick={() => handleSelect(a)}
                  >
                    {isMd ? (
                      <FileText className="w-3.5 h-3.5 shrink-0 text-indigo-400" aria-hidden="true" />
                    ) : (
                      <File className="w-3.5 h-3.5 shrink-0 text-gray-400" aria-hidden="true" />
                    )}
                    <span className="artifacts-item-name">{a.name}</span>
                    {a.path !== a.name && (
                      <span className="artifacts-item-path">{a.path}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <div className="artifacts-content">
        {!selected && (
          <p className="artifacts-content-placeholder">Select an artifact to view its contents.</p>
        )}
        {selected && contentLoading && (
          <div className="artifacts-content-state">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-400" aria-hidden="true" />
            <span>Loading…</span>
          </div>
        )}
        {selected && contentError && (
          <div className="artifacts-content-state artifacts-content-state--error">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" aria-hidden="true" />
            <span>{contentError}</span>
          </div>
        )}
        {selected && content !== null && !contentLoading && (
          isMarkdown ? (
            <ReportViewer markdown={content} />
          ) : (
            <div className="artifacts-code-wrap">
              {selectedExt && <span className="artifacts-code-lang">{selectedExt}</span>}
              <pre className="artifacts-code"><code>{content}</code></pre>
            </div>
          )
        )}
      </div>
    </div>
  );
}
