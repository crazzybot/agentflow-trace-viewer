/** Workspace git checkpoints of a run (`GET /api/runs/{id}/checkpoints`). */
export interface RunCheckpoint {
  sha: string;
  label: string;
  subtask_id: string | null;
  agent_id: string | null;
  changed: string[];
  /** Unix ms. */
  ts: number;
}
