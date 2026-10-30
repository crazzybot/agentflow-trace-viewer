/**
 * The AgentFlow session log (`GET /api/runs/{id}/session`): the durable,
 * always-on record of a run. See AgentFlow docs/kb/subsystems/session-log.md.
 */

export type SessionEventType =
  | "run_started"
  | "plan_created"
  | "subtask_dispatched"
  | "subtask_decomposed"
  | "subtask_finished"
  | "subtask_verified"
  | "result_stored"
  | "cost_added"
  | "human_input_requested"
  | "human_input_received"
  | "agent_started"
  | "message_appended"
  | "message_discarded"
  | "context_snipped"
  | "agent_finished"
  | "checkpoint_created"
  | "workspace_restored"
  | "run_interrupted"
  | "run_resumed"
  | "run_finished";

export interface SessionEvent {
  run_id: string;
  seq: number;
  /** Unix ms. */
  ts: number;
  /** Kept as `string` so unknown future types do not break parsing. */
  type: SessionEventType | (string & {});
  agent_id: string | null;
  subtask_id: string | null;
  invocation_id: string | null;
  data: Record<string, unknown>;
}

/** Content block of an agent message (Anthropic Messages API shape). */
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; signature?: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: unknown; is_error?: boolean }
  | { type: string; [key: string]: unknown };

export interface SessionMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}
