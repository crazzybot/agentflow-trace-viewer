/**
 * Cost-computation utilities for AgentFlow run traces.
 *
 * These helpers extract total USD spend from either completed result records
 * (results.jsonl) or from accumulated SSE trace events — whichever source is
 * available.  Both return `0` when no cost data is present so callers can
 * safely show/hide the badge with a simple `> 0` guard.
 */

import type { SubtaskResult, TraceEvent } from "../types/events";
import { EventType } from "../types/events";

// ---------------------------------------------------------------------------
// computeResultsCost
// ---------------------------------------------------------------------------

/**
 * Sums `cost_usd` across all {@link SubtaskResult} records.
 *
 * Records that lack the field (cost_usd === undefined) contribute `0`, so
 * traces produced by older backends without cost telemetry still return `0`
 * rather than `NaN`.
 *
 * @param results - Array of parsed SubtaskResult objects.
 * @returns Total cost in USD, or `0` if no cost data is present.
 */
export function computeResultsCost(results: SubtaskResult[]): number {
  let total = 0;
  for (const r of results) {
    if (typeof r.cost_usd === "number") {
      total += r.cost_usd;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// computeEventsCost
// ---------------------------------------------------------------------------

/**
 * Extracts cumulative cost from a list of {@link TraceEvent}s.
 *
 * Strategy (in priority order):
 *  1. Sum `cost_usd` from every `task:complete` event payload.
 *  2. If no `task:complete` cost is found, check the first `run:complete`
 *     event for a top-level cost figure.
 *  3. Return `0` if no cost data exists anywhere.
 *
 * Cost is read from `event.payload.data.cost_usd` for GenericEvents
 * (task:complete / run:complete both land in the generic branch), and from
 * `event.payload.cost_usd` as a fallback for any future typed payload that
 * carries it at the payload root level.
 *
 * @param events - Array of parsed TraceEvents (order does not matter).
 * @returns Total cost in USD, or `0` if no cost data is present.
 */
export function computeEventsCost(events: TraceEvent[]): number {
  let taskCompleteTotal = 0;
  let hasTaskCompleteCost = false;

  let runCompleteTotal = 0;
  let hasRunCompleteCost = false;

  for (const event of events) {
    // ── payload-root cost_usd (works for any BasePayload variant) ──────────
    const payloadRootCost =
      typeof (event.payload as { cost_usd?: unknown }).cost_usd === "number"
        ? (event.payload as { cost_usd: number }).cost_usd
        : undefined;

    // ── payload.data.cost_usd (generic events: task:complete, run:complete) ─
    const data =
      event.payload.data !== null && typeof event.payload.data === "object"
        ? (event.payload.data as Record<string, unknown>)
        : null;
    const dataCost =
      data !== null && typeof data["cost_usd"] === "number"
        ? (data["cost_usd"] as number)
        : undefined;

    // The actual cost for this event — prefer data-level, fall back to root.
    const eventCost = dataCost ?? payloadRootCost;

    if (event.type === EventType.TaskComplete && eventCost !== undefined) {
      taskCompleteTotal += eventCost;
      hasTaskCompleteCost = true;
    }

    if (event.type === EventType.RunComplete && eventCost !== undefined) {
      runCompleteTotal += eventCost;
      hasRunCompleteCost = true;
    }
  }

  // Priority 1: sum of per-task costs
  if (hasTaskCompleteCost) return taskCompleteTotal;

  // Priority 2: run-level total from run:complete
  if (hasRunCompleteCost) return runCompleteTotal;

  // Priority 3: no cost data available
  return 0;
}
