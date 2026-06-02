import React from "react";
import { History, Loader2, WifiOff, RefreshCw, Database, FileText, FileBarChart2, ChevronRight } from "lucide-react";
import type { RunInfo } from "../types/runs";
import { fetchRuns } from "../api/agentflow";

export interface RunSelectorProps {
  onSelectRun: (run: RunInfo) => void;
  isLoading?: boolean;
}

type FetchState =
  | { status: "loading" }
  | { status: "loaded"; runs: RunInfo[] }
  | { status: "error" };

export function RunSelector({ onSelectRun, isLoading = false }: RunSelectorProps) {
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

  return (
    <div className="run-selector">
      <div className="run-selector-header">
        <div className="run-selector-title">
          <History className="w-4 h-4 text-indigo-600" aria-hidden="true" />
          <span>Recent Runs</span>
        </div>
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
      </div>

      <div className="run-selector-body">
        {fetchState.status === "loading" && (
          <div className="run-selector-status">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-400" aria-hidden="true" />
            <span>Fetching runs…</span>
          </div>
        )}

        {fetchState.status === "error" && (
          <div className="run-selector-offline">
            <WifiOff className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-slate-600">Service unavailable</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Start the agentflow service to browse historical runs
              </p>
            </div>
          </div>
        )}

        {fetchState.status === "loaded" && fetchState.runs.length === 0 && (
          <div className="run-selector-empty">
            <p className="text-sm text-slate-500">No runs found</p>
          </div>
        )}

        {fetchState.status === "loaded" && fetchState.runs.length > 0 && (
          <ul className="run-selector-list" role="list">
            {fetchState.runs.map((run) => (
              <li key={run.run_id}>
                <button
                  type="button"
                  className="run-selector-row"
                  onClick={() => onSelectRun(run)}
                  disabled={isLoading || !run.has_events}
                  title={run.run_id}
                  aria-label={`Load run ${run.run_id}`}
                >
                  <span className="run-selector-row-id">{run.run_id.slice(0, 8)}…</span>
                  <div className="run-selector-badges">
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
