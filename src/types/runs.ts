export interface RunInfo {
  run_id: string;
  has_events: boolean;
  has_results: boolean;
  has_report: boolean;
  has_artifacts?: boolean;
  /** True when the run's SSE stream is still open and emitting events. */
  is_streaming?: boolean;
  /** Short display name assigned by the service, if available. */
  name?: string | null;
  /** The task text submitted for this run, if available. */
  task?: string | null;
  /** ISO-8601 creation timestamp, if available. */
  created_at?: string | null;
}
