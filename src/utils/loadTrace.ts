/**
 * Utilities for parsing, normalising, and analysing AgentFlow trace JSON.
 *
 * Public API
 * ----------
 *  parseTraceEvent(raw)          — validate + narrow one raw object → TraceEvent
 *  normalizeEvents(raws)         — sort an array of raw objects by seq → TraceEvent[]
 *  extractEventTypes(events)     — unique EventTypeValue set from an event array
 *  extractTimeRange(events)      — TimeRange (startMs / endMs / durationMs)
 *  parseTraceJson(jsonText)      — parse a full JSONL or JSON-array string → TraceEvent[]
 *  parseResultsJson(jsonText)    — parse a results.jsonl string → SubtaskResult[]
 *  loadTrace(eventsJson, resultsJson?) — full pipeline → RunTrace
 */

import type {
  AgentProgressEvent,
  AgentProgressPayload,
  EventTypeValue,
  GenericEvent,
  GenericEventType,
  PlanCreatedEvent,
  PlanCreatedPayload,
  RunStartedEvent,
  RunStartedPayload,
  RunTrace,
  SubtaskResult,
  TaskDispatchedEvent,
  TaskDispatchedPayload,
  TimeRange,
  TraceEvent,
} from "../types/events";
import { EventType } from "../types/events";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Throw a descriptive error if a condition is false. */
function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`[loadTrace] ${message}`);
}

/** Safely coerce a value to string or throw. */
function requireString(value: unknown, field: string): string {
  assert(typeof value === "string", `Expected string for "${field}", got ${typeof value}`);
  return value;
}

/** Safely coerce a value to number or throw. */
function requireNumber(value: unknown, field: string): number {
  assert(typeof value === "number", `Expected number for "${field}", got ${typeof value}`);
  return value;
}

/** Safely coerce a value to a plain object or throw. */
function requireObject(value: unknown, field: string): Record<string, unknown> {
  assert(
    typeof value === "object" && value !== null && !Array.isArray(value),
    `Expected object for "${field}", got ${Array.isArray(value) ? "array" : typeof value}`,
  );
  return value as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Per-type payload parsers
// ---------------------------------------------------------------------------

function parseRunStartedPayload(raw: Record<string, unknown>): RunStartedPayload {
  return {
    message: requireString(raw["message"], "payload.message"),
    partial: raw["partial"] ?? null,
    data: null,
  };
}

function parsePlanCreatedPayload(raw: Record<string, unknown>): PlanCreatedPayload {
  const data = requireObject(raw["data"], "payload.data");
  const run_id = requireString(data["run_id"], "payload.data.run_id");

  assert(Array.isArray(data["subtasks"]), 'payload.data.subtasks must be an array');
  const subtasks = (data["subtasks"] as unknown[]).map((st, i) => {
    const s = requireObject(st, `subtasks[${i}]`);
    return {
      id: requireString(s["id"], `subtasks[${i}].id`),
      agent_id: requireString(s["agent_id"], `subtasks[${i}].agent_id`),
      instruction: requireString(s["instruction"], `subtasks[${i}].instruction`),
      depends_on: Array.isArray(s["depends_on"])
        ? (s["depends_on"] as unknown[]).map((d, j) =>
            requireString(d, `subtasks[${i}].depends_on[${j}]`),
          )
        : [],
      expected_output: requireString(s["expected_output"], `subtasks[${i}].expected_output`),
    };
  });

  return {
    message: requireString(raw["message"], "payload.message"),
    partial: raw["partial"] ?? null,
    data: { run_id, subtasks },
  };
}

function parseTaskDispatchedPayload(raw: Record<string, unknown>): TaskDispatchedPayload {
  const data = requireObject(raw["data"], "payload.data");
  return {
    message: requireString(raw["message"], "payload.message"),
    partial: raw["partial"] ?? null,
    data: {
      subtask_id: requireString(data["subtask_id"], "payload.data.subtask_id"),
      task_id: requireString(data["task_id"], "payload.data.task_id"),
    },
  };
}

function parseAgentProgressPayload(raw: Record<string, unknown>): AgentProgressPayload {
  const rawData = raw["data"];
  let data: AgentProgressPayload["data"] = null;

  if (rawData !== null && rawData !== undefined) {
    const d = requireObject(rawData, "payload.data");
    if (typeof d["tool"] === "string") {
      data = {
        tool: d["tool"],
        input:
          typeof d["input"] === "object" && d["input"] !== null
            ? (d["input"] as Record<string, unknown>)
            : {},
      };
    }
    // else: non-tool-call data shape (e.g. planner exploration) — treat as null
  }

  return {
    message: requireString(raw["message"], "payload.message"),
    partial: raw["partial"] ?? null,
    data,
  };
}

function parseGenericPayload(raw: Record<string, unknown>): { message: string; partial: unknown; data: Record<string, unknown> | null } {
  const rawData = raw["data"];
  const data = rawData !== null && rawData !== undefined
    ? requireObject(rawData, "payload.data")
    : null;

  return {
    message: requireString(raw["message"], "payload.message"),
    partial: raw["partial"] ?? null,
    data,
  };
}

// ---------------------------------------------------------------------------
// Core public functions
// ---------------------------------------------------------------------------

/**
 * Parse and validate a single raw JSON object into a typed `TraceEvent`.
 *
 * Throws a descriptive `Error` if any required field is missing or has the
 * wrong type.
 */
export function parseTraceEvent(raw: unknown): TraceEvent {
  const obj = requireObject(raw, "<event root>");

  const run_id = requireString(obj["run_id"], "run_id");
  const seq = requireNumber(obj["seq"], "seq");
  const ts = requireNumber(obj["ts"], "ts");
  const type = requireString(obj["type"], "type");
  const rawPayload = requireObject(obj["payload"], "payload");

  const base = { run_id, seq, ts };

  switch (type) {
    case EventType.RunStarted: {
      assert(
        obj["agent_id"] === null || obj["agent_id"] === undefined,
        `run:started must have agent_id: null (got ${String(obj["agent_id"])})`,
      );
      const event: RunStartedEvent = {
        ...base,
        type: EventType.RunStarted,
        agent_id: null,
        payload: parseRunStartedPayload(rawPayload),
      };
      return event;
    }

    case EventType.PlanCreated: {
      assert(
        obj["agent_id"] === null || obj["agent_id"] === undefined,
        `plan:created must have agent_id: null (got ${String(obj["agent_id"])})`,
      );
      const event: PlanCreatedEvent = {
        ...base,
        type: EventType.PlanCreated,
        agent_id: null,
        payload: parsePlanCreatedPayload(rawPayload),
      };
      return event;
    }

    case EventType.TaskDispatched: {
      const event: TaskDispatchedEvent = {
        ...base,
        type: EventType.TaskDispatched,
        agent_id: requireString(obj["agent_id"], "agent_id"),
        payload: parseTaskDispatchedPayload(rawPayload),
      };
      return event;
    }

    case EventType.AgentProgress: {
      const event: AgentProgressEvent = {
        ...base,
        type: EventType.AgentProgress,
        agent_id: requireString(obj["agent_id"], "agent_id"),
        payload: parseAgentProgressPayload(rawPayload),
      };
      return event;
    }

    default: {
      const isKnownType = (Object.values(EventType) as string[]).includes(type);
      if (!isKnownType) {
        throw new Error(
          `[loadTrace] Unknown event type "${type}". ` +
            `Known types: ${Object.values(EventType).join(",")}`,
        );
      }

      const event: GenericEvent = {
        ...base,
        type: type as GenericEventType,
        agent_id:
          obj["agent_id"] === null || obj["agent_id"] === undefined
            ? null
            : requireString(obj["agent_id"], "agent_id"),
        payload: parseGenericPayload(rawPayload),
      };
      return event;
    }
  }
}

/**
 * Parse an array of raw objects into typed `TraceEvent[]`, sorted by `seq`.
 *
 * Invalid events cause an immediate throw with the offending seq / index
 * noted in the message.
 */
export function normalizeEvents(raws: unknown[]): TraceEvent[] {
  const events = raws.map((raw, idx) => {
    try {
      return parseTraceEvent(raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[loadTrace] Failed to parse event at index ${idx}: ${msg}`);
    }
  });

  // Sort by seq — canonical ordering per schema spec
  return events.slice().sort((a, b) => a.seq - b.seq);
}

/**
 * Extract the set of unique event-type strings present in an event array.
 */
export function extractEventTypes(events: TraceEvent[]): Set<EventTypeValue> {
  const types = new Set<EventTypeValue>();
  for (const event of events) {
    types.add(event.type);
  }
  return types;
}

/**
 * Compute the wall-clock time range across a sorted event array.
 *
 * Returns `{ startMs: 0, endMs: 0, durationMs: 0 }` for an empty array.
 */
export function extractTimeRange(events: TraceEvent[]): TimeRange {
  if (events.length === 0) {
    return { startMs: 0, endMs: 0, durationMs: 0 };
  }

  let startMs = Infinity;
  let endMs = -Infinity;

  for (const event of events) {
    if (event.ts < startMs) startMs = event.ts;
    if (event.ts > endMs) endMs = event.ts;
  }

  return {
    startMs,
    endMs,
    durationMs: endMs - startMs,
  };
}

/**
 * Parse a trace file body — accepts either:
 *  - **JSONL** (newline-delimited JSON): one event object per line.
 *  - **JSON array**: a standard `[...]` array of event objects.
 *
 * Returns events sorted by `seq`.
 *
 * @param jsonText - Raw file contents as a string.
 */
export function parseTraceJson(jsonText: string): TraceEvent[] {
  const trimmed = jsonText.trim();

  let raws: unknown[];

  if (trimmed.startsWith("[")) {
    // JSON array format
    const parsed: unknown = JSON.parse(trimmed);
    assert(Array.isArray(parsed), "Expected a top-level JSON array");
    raws = parsed;
  } else {
    // JSONL format — split on newlines, skip blank lines
    raws = trimmed
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line, idx) => {
        try {
          return JSON.parse(line) as unknown;
        } catch {
          throw new Error(`[loadTrace] Invalid JSON on JSONL line ${idx + 1}: ${line.slice(0, 80)}`);
        }
      });
  }

  return normalizeEvents(raws);
}

/**
 * Parse a `results.jsonl` file body into typed `SubtaskResult[]`.
 *
 * Accepts both JSONL and JSON-array formats, mirroring `parseTraceJson`.
 * Returns an empty array if `jsonText` is blank.
 *
 * Fields that are absent in the raw data fall back to safe defaults so that
 * partially-written results files do not crash the viewer.
 */
export function parseResultsJson(jsonText: string): SubtaskResult[] {
  const trimmed = jsonText.trim();
  if (trimmed.length === 0) return [];

  let raws: unknown[];

  if (trimmed.startsWith("[")) {
    const parsed: unknown = JSON.parse(trimmed);
    assert(Array.isArray(parsed), "Expected a top-level JSON array for results");
    raws = parsed;
  } else {
    raws = trimmed
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line, idx) => {
        try {
          return JSON.parse(line) as unknown;
        } catch {
          throw new Error(`[loadTrace] Invalid JSON on results JSONL line ${idx + 1}`);
        }
      });
  }

  return raws.map((raw, idx) => {
    const r = requireObject(raw, `results[${idx}]`);
    const output =
      typeof r["output"] === "object" && r["output"] !== null
        ? (r["output"] as Record<string, unknown>)
        : {};

    return {
      subtask_id: requireString(r["subtask_id"], `results[${idx}].subtask_id`),
      task_id: requireString(r["task_id"], `results[${idx}].task_id`),
      agent_id: requireString(r["agent_id"], `results[${idx}].agent_id`),
      status: (r["status"] ?? "success") as SubtaskResult["status"],
      output: {
        text: typeof output["text"] === "string" ? output["text"] : "",
        structured:
          typeof output["structured"] === "object" && output["structured"] !== null
            ? (output["structured"] as Record<string, unknown>)
            : {},
      },
      error: typeof r["error"] === "string" ? r["error"] : null,
      tokens_used: typeof r["tokens_used"] === "number" ? r["tokens_used"] : 0,
      duration_ms: typeof r["duration_ms"] === "number" ? r["duration_ms"] : 0,
    };
  });
}

/**
 * Full pipeline: parse events (and optionally results) and assemble a
 * `RunTrace` object ready for the UI.
 *
 * @param eventsJson  - Raw content of the `events.jsonl` (or JSON array) file.
 * @param resultsJson - Optional raw content of `results.jsonl`.
 *
 * @throws if `eventsJson` is empty, unparseable, or contains no valid events.
 */
export function loadTrace(eventsJson: string, resultsJson?: string): RunTrace {
  const events = parseTraceJson(eventsJson);

  assert(events.length > 0, "Trace contains no events");

  // Derive run_id from the first event — all events share the same run_id
  const run_id = events[0]?.run_id;
  assert(run_id !== undefined && run_id.length > 0, "Could not determine run_id from events");

  const eventTypes = extractEventTypes(events);
  const timeRange = extractTimeRange(events);
  const results = resultsJson !== undefined ? parseResultsJson(resultsJson) : [];

  return {
    run_id,
    events,
    eventTypes,
    timeRange,
    results,
  };
}
