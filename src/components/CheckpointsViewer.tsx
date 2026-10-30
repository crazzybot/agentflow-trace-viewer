import React from "react";
import { Loader2, AlertCircle, GitCommitHorizontal, Copy, Check, FileDiff } from "lucide-react";
import { fetchRunCheckpoints } from "../api/agentflow";
import type { RunCheckpoint } from "../types/checkpoints";

interface CheckpointsViewerProps {
  runId: string;
  /** Workspace path relative to the workspace root, e.g. "runs/<id>" or "app-gateway". */
  workspace: string | null;
}

/**
 * Git snapshots of the run's workspace, taken at run start and after each
 * finished subtask, in a shadow repository under the run directory (never the
 * project's own .git). Restoring is a manual git command: AgentFlow deliberately
 * has no restore endpoint, since restoring during a live run would race its agents.
 */
export function CheckpointsViewer({ runId, workspace }: CheckpointsViewerProps) {
  const [checkpoints, setCheckpoints] = React.useState<RunCheckpoint[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedSha, setSelectedSha] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetchRunCheckpoints(runId)
      .then((list) => {
        if (cancelled) return;
        setCheckpoints(list);
        if (list.length > 0) setSelectedSha(list[list.length - 1].sha);
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [runId]);

  const selected = checkpoints?.find((c) => c.sha === selectedSha) ?? null;
  const restoreCommand = selected
    ? `git --git-dir .runs/${runId}/checkpoints.git --work-tree workspace/${workspace ?? `runs/${runId}`} checkout ${selected.sha} -- .`
    : "";

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(restoreCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable (e.g. insecure context) — the command stays selectable */ }
  }

  return (
    <div className="artifacts-layout">
      <aside className="artifacts-sidebar">
        {!checkpoints && !error && (
          <div className="artifacts-sidebar-state">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" aria-hidden="true" />
            <span>Loading checkpoints…</span>
          </div>
        )}
        {error && (
          <div className="artifacts-sidebar-state artifacts-sidebar-state--error">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        {checkpoints && checkpoints.length === 0 && (
          <p className="artifacts-sidebar-empty">
            No checkpoints. Either nothing changed in the workspace, or checkpoints were
            disabled (ENABLE_CHECKPOINTS) or git was unavailable on the server.
          </p>
        )}
        {checkpoints && checkpoints.length > 0 && (
          <ul className="artifacts-list" role="listbox" aria-label="Checkpoints">
            {checkpoints.map((c) => (
              <li key={c.sha}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selectedSha === c.sha}
                  className={`artifacts-item ${selectedSha === c.sha ? "artifacts-item--active" : ""}`}
                  onClick={() => setSelectedSha(c.sha)}
                >
                  <GitCommitHorizontal className="w-3.5 h-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                  <span className="artifacts-item-name">{c.label}</span>
                  <span className="artifacts-item-path">
                    {c.sha.slice(0, 7)} · {c.changed.length} file{c.changed.length !== 1 ? "s" : ""} ·{" "}
                    {new Date(c.ts).toLocaleTimeString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="artifacts-content">
        {!selected && checkpoints && checkpoints.length > 0 && (
          <p className="artifacts-content-placeholder">Select a checkpoint.</p>
        )}
        {selected && (
          <div className="checkpoint-detail">
            <h3 className="checkpoint-title">{selected.label}</h3>
            <dl className="checkpoint-meta">
              <dt>Commit</dt><dd className="font-mono">{selected.sha}</dd>
              {selected.subtask_id && (<><dt>Subtask</dt><dd className="font-mono">{selected.subtask_id}</dd></>)}
              {selected.agent_id && (<><dt>Agent</dt><dd>{selected.agent_id}</dd></>)}
              <dt>Taken</dt><dd>{new Date(selected.ts).toLocaleString()}</dd>
            </dl>

            <p className="checkpoint-section-label">
              <FileDiff className="w-3.5 h-3.5" aria-hidden="true" />
              Changed files ({selected.changed.length})
            </p>
            {selected.changed.length === 0 ? (
              <p className="checkpoint-note">No file changes recorded.</p>
            ) : (
              <ul className="checkpoint-files">
                {selected.changed.map((path) => <li key={path} className="font-mono">{path}</li>)}
              </ul>
            )}
            <p className="checkpoint-note">
              With parallel subtasks, a checkpoint can include another subtask's in-progress
              files: the list shows what changed by this point in time.
            </p>

            <p className="checkpoint-section-label">Restore the workspace to this checkpoint</p>
            <div className="checkpoint-command">
              <code>{restoreCommand}</code>
              <button type="button" onClick={copyCommand} className="checkpoint-copy" aria-label="Copy command">
                {copied ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
              </button>
            </div>
            <p className="checkpoint-note">
              Run it from the AgentFlow server's directory, and not while a run is using this
              workspace.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
