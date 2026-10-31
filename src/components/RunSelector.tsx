import React from "react";
import {
  History,
  Loader2,
  WifiOff,
  RefreshCw,
  Database,
  FileText,
  FileBarChart2,
  CirclePause,
  ChevronRight,
  Plus,
  Search,
  X,
} from "lucide-react";
import type { RunInfo } from "../types/runs";
import { fetchRuns } from "../api/agentflow";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAge(isoString: string): string {
  const ms = Date.now() - new Date(isoString).getTime();
  if (isNaN(ms) || ms < 0) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(isoString).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

/** Every whitespace-separated term must appear in the run's name, task, id or workspace. */
function matchesQuery(run: RunInfo, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [run.name, run.task, run.run_id, run.workspace].filter(Boolean).join("\n").toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface RunSelectorProps {
  onSelectRun: (run: RunInfo) => void;
  onNewRun: () => void;
  isLoading?: boolean;
}

type FetchState =
  | { status: "loading" }
  | { status: "loaded"; runs: RunInfo[] }
  | { status: "error" };

export function RunSelector({ onSelectRun, onNewRun, isLoading = false }: RunSelectorProps) {
  const [fetchState, setFetchState] = React.useState<FetchState>({ status: "loading" });

  const load = React.useCallback(async () => {
    setFetchState({ status: "loading" });
    try {
      const runs = await fetchRuns();
      setFetchState({ status: "loaded", runs });
    } catch {
      setFetchState({ status: "error" });
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const [query, setQuery] = React.useState("");
  const runs = React.useMemo(() => (fetchState.status === "loaded" ? fetchState.runs : []), [fetchState]);
  const visibleRuns = React.useMemo(() => runs.filter((r) => matchesQuery(r, query)), [runs, query]);

  return (
    <div className="run-selector">
      <div className="run-selector-header">
        <div className="run-selector-title">
          <History className="w-4 h-4 text-accent" aria-hidden="true" />
          <span>Recent Runs</span>
        </div>
        <div className="run-selector-header-actions">
          {fetchState.status !== "loading" && (
            <button
              type="button"
              onClick={load}
              disabled={isLoading}
              className="run-selector-refresh"
              aria-label="Refresh runs list"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={onNewRun}
            disabled={isLoading}
            className="run-selector-new-btn"
            aria-label="Create new run"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            New Run
          </button>
        </div>
      </div>

      {runs.length > 0 && (
        <div className="run-selector-search">
          <div className="run-selector-search-field">
            <Search className="run-selector-search-icon" aria-hidden="true" />
            <input
              type="search"
              className="new-run-input run-selector-search-input"
              placeholder="Search by name, task, run ID or workspace"
              aria-label="Search runs"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); }}
            />
            {query && (
              <button
                type="button"
                className="run-selector-search-clear"
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
          {query && (
            <span className="run-selector-search-count" aria-live="polite">
              {visibleRuns.length} of {runs.length}
            </span>
          )}
        </div>
      )}

      <div className="run-selector-body">
        {fetchState.status === "loading" && (
          <div className="run-selector-status">
            <Loader2 className="w-5 h-5 animate-spin text-accent" aria-hidden="true" />
            <span>Fetching runs…</span>
          </div>
        )}

        {fetchState.status === "error" && (
          <div className="run-selector-offline">
            <WifiOff className="w-5 h-5 text-ink-subtle shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-ink-muted">Service unavailable</p>
              <p className="text-xs text-ink-subtle mt-0.5">
                Start the agentflow service to browse historical runs
              </p>
            </div>
          </div>
        )}

        {fetchState.status === "loaded" && fetchState.runs.length === 0 && (
          <div className="run-selector-empty">
            <p className="text-sm text-ink-subtle">No runs found</p>
          </div>
        )}

        {runs.length > 0 && visibleRuns.length === 0 && (
          <div className="run-selector-empty">
            <p className="text-sm text-ink-subtle">No runs match “{query.trim()}”</p>
          </div>
        )}

        {visibleRuns.length > 0 && (
          <ul className="run-selector-list" role="list">
            {visibleRuns.map((run) => (
              <li key={run.run_id}>
                <button
                  type="button"
                  className="run-selector-row"
                  onClick={() => onSelectRun(run)}
                  disabled={isLoading || (!run.has_events && !run.is_streaming)}
                  title={run.run_id}
                  aria-label={`Load run ${run.name ?? run.run_id}`}
                >
                  <div className="run-selector-row-main">
                    {/* Top line: name/id + age */}
                    <div className="run-selector-row-top">
                      <span className="run-selector-row-name">
                        {run.name ?? run.run_id}
                      </span>
                      {run.created_at && (
                        <span className="run-selector-row-age">
                          {formatAge(run.created_at)}
                        </span>
                      )}
                    </div>

                    {/* Task snippet */}
                    {run.task && (
                      <p className="run-selector-row-task">
                        {truncate(run.task, 90)}
                      </p>
                    )}

                    {/* Availability badges */}
                    <div className="run-selector-badges">
                      {run.is_awaiting_input && (
                        <span className="run-badge run-badge--awaiting" title="Waiting for your input">
                          <CirclePause className="w-2.5 h-2.5" aria-hidden="true" />
                          Awaiting Input
                        </span>
                      )}
                      {run.is_streaming && !run.is_awaiting_input && (
                        <span className="run-badge run-badge--live" title="Stream active">
                          <span className="run-badge-live-dot" aria-hidden="true" />
                          Live
                        </span>
                      )}
                      {run.has_events && (
                        <span className="run-badge run-badge--events" title="Events available">
                          <Database className="w-2.5 h-2.5" aria-hidden="true" />
                          Events
                        </span>
                      )}
                      {run.has_results && (
                        <span className="run-badge run-badge--results" title="Results available">
                          <FileText className="w-2.5 h-2.5" aria-hidden="true" />
                          Results
                        </span>
                      )}
                      {run.has_report && (
                        <span className="run-badge run-badge--report" title="Report available">
                          <FileBarChart2 className="w-2.5 h-2.5" aria-hidden="true" />
                          Report
                        </span>
                      )}
                    </div>
                  </div>

                  <ChevronRight className="run-selector-chevron" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
