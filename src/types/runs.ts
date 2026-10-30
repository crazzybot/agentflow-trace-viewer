export interface RunInfo {
  run_id: string;
  has_events: boolean;
  has_results: boolean;
  has_report: boolean;
  has_artifacts?: boolean;
  /** True when the run's SSE stream is still open and emitting events. */
  is_streaming?: boolean;
  /** True when the run is paused and waiting for a human response. */
  is_awaiting_input?: boolean;
  /** Short display name assigned by the service, if available. */
  name?: string | null;
  /** The task text submitted for this run, if available. */
  task?: string | null;
  /** ISO-8601 creation timestamp, if available. */
  created_at?: string | null;
  /** True when the run has a durable session log (every run since Oct 2026). */
  has_session?: boolean;
  /** Workspace path relative to the workspace root ("runs/<id>" or a project name). */
  workspace?: string | null;
}
