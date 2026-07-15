/**
 * TypeScript type definitions for AgentFlow run-trace events.
 *
 * Schema source: src/event-schema.md
 *
 * Design decisions:
 *  - `EventType` is a const enum-like string union kept as a plain `const` object
 *    so it survives `isolatedModules` / esbuild erasure and remains usable at runtime.
 *  - Every payload shape is modelled as a discriminated union on `TraceEvent` so
 *    that narrowing on `event.type` gives full inference of `event.payload`.
 *  - `RunTrace` is the top-level container returned by `loadTrace`.
 *  - `SubtaskResult` models the `results.jsonl` record schema.
 */

// ---------------------------------------------------------------------------
// Event-type constants (safe for runtime use unlike `const enum`)
// ---------------------------------------------------------------------------

export const EventType = {
  RunStarted: "run:started",
  PlanCreated: "plan:created",
  TaskDispatched: "task:dispatched",
  AgentProgress: "agent:progress",
  AgentThought: "agent:thought",
  AgentQuery: "agent:query",
  AgentToolResult: "agent:tool_result",
  TaskComplete: "task:complete",
  TaskPartial: "task:partial",
  TaskFailed: "task:failed",
  TaskContinuing: "task:continuing",
  RunComplete: "run:complete",
  RunError: "run:error",
  RunBudgetExceeded: "run:budget_exceeded",
  RunAwaitingInput: "run:awaiting_input",
  RunCancelled: "run:cancelled",
  RunMessageReceived: "run:message_received",
} as const;

/** Union of all known event-type string literals. */
export type EventTypeValue = (typeof EventType)[keyof typeof EventType];

/** Non-specialized event types that share a generic payload shape. */
export type GenericEventType = Exclude<
  EventTypeValue,
  | typeof EventType.RunStarted
  | typeof EventType.PlanCreated
  | typeof EventType.TaskDispatched
  | typeof EventType.AgentProgress
  | typeof EventType.AgentToolResult
>;

// ---------------------------------------------------------------------------
// Subtask (appears inside plan:created payload.data)
// ---------------------------------------------------------------------------

export interface Subtask {
  /** Subtask identifier, e.g. "st_1_a". */
  id: string;
  /** Agent assigned to execute this subtask. */
  agent_id: string;
  /** Full natural-language instruction. */
  instruction: string;
  /** IDs of subtasks that must complete before this one can start. */
  depends_on: string[];
  /** Human-readable description of the expected deliverable. */
  expected_output: string;
}

// ---------------------------------------------------------------------------
// Payload `data` shapes — one per event type
// ---------------------------------------------------------------------------

/** payload.data for `run:started` — always null. */
export type RunStartedData = null;

/** payload.data for `plan:created`. */
export interface PlanCreatedData {
  /** UUID of this run — matches the top-level run_id. */
  run_id: string;
  subtasks: Subtask[];
}

/** payload.data for `task:dispatched`. */
export interface TaskDispatchedData {
  /** Subtask identifier being dispatched. */
  subtask_id: string;
  /** UUID of the task instance created for this dispatch. */
  task_id: string;
}

/** payload.data for `agent:progress` when the event represents a tool call. */
export interface AgentProgressToolCallData {
  /** Tool name, e.g. "bash_exec", "python_exec", "file_write", "read_skill". */
  tool: string;
  /** Tool-specific input parameters. */
  input: Record<string, unknown>;
}

/**
 * payload.data for `agent:progress`.
 * - `null`  → free-text progress narrative (no structured data).
 * - object  → tool-call record with `tool` + `input`.
 */
export type AgentProgressData = AgentProgressToolCallData | null;

/** payload.data for `agent:tool_result`. */
export interface AgentToolResultData {
  /** The tool name that produced this result. */
  tool: string;
  /** The tool's output text. */
  result: string | null;
  /** Present and `true` when the tool returned an error. */
  is_error?: boolean;
}

// ---------------------------------------------------------------------------
// Payload objects — one per event type
// ---------------------------------------------------------------------------

interface BasePayload<D> {
  /** Short human-readable summary suitable for list views / logs. */
  message: string;
  /**
   * Streaming / incremental content for in-progress events.
   * `null` when not applicable.
   */
  partial: unknown;
  /** Structured, type-specific payload data. */
  data: D;
  /**
   * Optional USD cost reported directly on the event payload (e.g. on
   * `task:complete` / `run:complete`).  Present only when the backend
   * includes per-event cost telemetry.
   */
  cost_usd?: number;
}

export type RunStartedPayload = BasePayload<RunStartedData>;
export type PlanCreatedPayload = BasePayload<PlanCreatedData>;
export type TaskDispatchedPayload = BasePayload<TaskDispatchedData>;
export type AgentProgressPayload = BasePayload<AgentProgressData>;
export type AgentToolResultPayload = BasePayload<AgentToolResultData>;

// ---------------------------------------------------------------------------
// Per-type event shapes
// ---------------------------------------------------------------------------

interface BaseEvent {
  /** UUID v4 — unique identifier for the overall run. */
  run_id: string;
  /** Monotonically increasing sequence number. Starts at 1. */
  seq: number;
  /** Unix timestamp in milliseconds. */
  ts: number;
  /**
   * LLM turn index — top-level event field that groups all events belonging
   * to the same agent turn (thought + tool calls + results). Absent on
   * non-agent events or older traces that predate this field.
   */
  turn_index?: number;
  /**
   * Tool-call correlation ID — top-level event field present on both the
   * `agent:progress` tool-call event and the corresponding `agent:tool_result`
   * event, allowing the UI to link them together.
   */
  tool_call_id?: string;
}

export interface RunStartedEvent extends BaseEvent {
  type: typeof EventType.RunStarted;
  agent_id: null;
  payload: RunStartedPayload;
}

export interface PlanCreatedEvent extends BaseEvent {
  type: typeof EventType.PlanCreated;
  agent_id: null;
  payload: PlanCreatedPayload;
}

export interface TaskDispatchedEvent extends BaseEvent {
  type: typeof EventType.TaskDispatched;
  /** The agent being dispatched to. */
  agent_id: string;
  payload: TaskDispatchedPayload;
}

export interface AgentProgressEvent extends BaseEvent {
  type: typeof EventType.AgentProgress;
  /** The executing agent. */
  agent_id: string;
  payload: AgentProgressPayload;
}

export interface AgentToolResultEvent extends BaseEvent {
  type: typeof EventType.AgentToolResult;
  /** The executing agent. */
  agent_id: string;
  payload: AgentToolResultPayload;
}

export interface GenericEvent extends BaseEvent {
  type: GenericEventType;
  agent_id: string | null;
  payload: BasePayload<Record<string, unknown> | null>;
}

/**
 * Discriminated union of all event types.
 * Narrow with `event.type` to get full inference of `event.payload`.
 */
export type TraceEvent =
  | RunStartedEvent
  | PlanCreatedEvent
  | TaskDispatchedEvent
  | AgentProgressEvent
  | AgentToolResultEvent
  | GenericEvent;

// ---------------------------------------------------------------------------
// results.jsonl — SubtaskResult record
// ---------------------------------------------------------------------------

export type SubtaskResultStatus = "success" | "partial" | "error";

export interface SubtaskResultOutput {
  /** Free-text output from the agent. */
  text: string;
  /** Optional machine-readable output; empty `{}` when not produced. */
  structured: Record<string, unknown>;
}

export interface SubtaskResult {
  /** ID of the subtask — matches `subtasks[].id` from `plan:created`. */
  subtask_id: string;
  /** UUID of the task instance — matches `task:dispatched → data.task_id`. */
  task_id: string;
  /** The agent that executed this subtask. */
  agent_id: string;
  /** Completion status. */
  status: SubtaskResultStatus;
  output: SubtaskResultOutput;
  /** Error message if the subtask failed; `null` on success. */
  error: string | null;
  /** Total LLM tokens consumed during this subtask. */
  tokens_used: number;
  /** Wall-clock execution time of the subtask in milliseconds. */
  duration_ms: number;
  /**
   * Optional USD cost for this subtask.  Present only when the backend
   * includes cost telemetry in `results.jsonl`.
   */
  cost_usd?: number;
}

// ---------------------------------------------------------------------------
// RunTrace — top-level container
// ---------------------------------------------------------------------------

export interface TimeRange {
  /** Earliest `ts` value across all events (ms epoch). */
  startMs: number;
  /** Latest `ts` value across all events (ms epoch). */
  endMs: number;
  /** Total duration in milliseconds (`endMs - startMs`). */
  durationMs: number;
}

/** Full in-memory representation of a loaded run trace. */
export interface RunTrace {
  /** UUID v4 of this run. */
  run_id: string;
  /**
   * All events sorted by `seq` (canonical ordering).
   * Use the `type` discriminant to narrow individual events.
   */
  events: TraceEvent[];
  /** Set of distinct event-type strings present in this trace. */
  eventTypes: Set<EventTypeValue>;
  /** Wall-clock time range derived from `ts` fields. */
  timeRange: TimeRange;
  /**
   * Subtask result records loaded from `results.jsonl`.
   * Empty array if the file was absent or not provided.
   */
  results: SubtaskResult[];
}
