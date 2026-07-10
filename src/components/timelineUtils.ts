/**
 * Shared constants and helpers for the Timeline and EventDetail components.
 */

import { EventType } from "../types/events";
import type { EventTypeValue, TraceEvent } from "../types/events";

// ---------------------------------------------------------------------------
// Per-event-type visual metadata
// ---------------------------------------------------------------------------

export interface EventMeta {
  /** Short display label. */
  label: string;
  /** Tailwind classes for the coloured left border on timeline rows. */
  border: string;
  /** Tailwind classes for the dot / circle indicator. */
  dot: string;
  /** Tailwind classes for the badge pill shown in the timeline row. */
  badge: string;
  /** Tailwind classes for the row background on hover. */
  rowHover: string;
  /**
   * Lucide icon name for this event type.
   * Used to pick the right icon in TimelineRow via the iconMap in TimelineView.
   */
  icon: string;
  /** Tailwind text-color class for the summary icon. */
  iconColor: string;
  /** Tailwind bg+text classes for the summary pill area. */
  summaryBg: string;
}

export const EVENT_META: Record<EventTypeValue, EventMeta> = {
  [EventType.RunStarted]: {
    label:     "Run Started",
    border:    "border-l-violet-500",
    dot:       "bg-violet-500 ring-violet-300",
    badge:     "bg-violet-900/60 text-violet-300 ring-1 ring-violet-500/40",
    rowHover:  "hover:bg-violet-950/30",
    icon:      "Play",
    iconColor: "text-violet-400",
    summaryBg: "bg-violet-50 border-violet-100",
  },
  [EventType.PlanCreated]: {
    label:     "Plan Created",
    border:    "border-l-blue-500",
    dot:       "bg-blue-500 ring-blue-300",
    badge:     "bg-blue-900/60 text-blue-300 ring-1 ring-blue-500/40",
    rowHover:  "hover:bg-blue-950/30",
    icon:      "ListTree",
    iconColor: "text-blue-400",
    summaryBg: "bg-blue-50 border-blue-100",
  },
  [EventType.TaskDispatched]: {
    label:     "Task Dispatched",
    border:    "border-l-emerald-500",
    dot:       "bg-emerald-500 ring-emerald-300",
    badge:     "bg-emerald-900/60 text-emerald-300 ring-1 ring-emerald-500/40",
    rowHover:  "hover:bg-emerald-950/30",
    icon:      "Send",
    iconColor: "text-emerald-500",
    summaryBg: "bg-emerald-50 border-emerald-100",
  },
  [EventType.AgentProgress]: {
    label:     "Agent Progress",
    border:    "border-l-amber-500",
    dot:       "bg-amber-500 ring-amber-300",
    badge:     "bg-amber-900/60 text-amber-300 ring-1 ring-amber-500/40",
    rowHover:  "hover:bg-amber-950/30",
    icon:      "Wrench",
    iconColor: "text-amber-500",
    summaryBg: "bg-amber-50 border-amber-100",
  },
  [EventType.AgentThought]: {
    label:     "Agent Thought",
    border:    "border-l-purple-400",
    dot:       "bg-purple-400 ring-purple-200",
    badge:     "bg-purple-900/60 text-purple-300 ring-1 ring-purple-400/40",
    rowHover:  "hover:bg-purple-950/30",
    icon:      "Brain",
    iconColor: "text-purple-400",
    summaryBg: "bg-purple-50 border-purple-100",
  },
  [EventType.AgentQuery]: {
    label:     "Agent Query",
    border:    "border-l-sky-500",
    dot:       "bg-sky-500 ring-sky-300",
    badge:     "bg-sky-900/60 text-sky-300 ring-1 ring-sky-500/40",
    rowHover:  "hover:bg-sky-950/30",
    icon:      "MessageCircle",
    iconColor: "text-sky-400",
    summaryBg: "bg-sky-50 border-sky-100",
  },
  [EventType.TaskComplete]: {
    label:     "Task Complete",
    border:    "border-l-emerald-600",
    dot:       "bg-emerald-600 ring-emerald-300",
    badge:     "bg-emerald-950/60 text-emerald-300 ring-1 ring-emerald-600/40",
    rowHover:  "hover:bg-emerald-950/30",
    icon:      "CircleCheck",
    iconColor: "text-emerald-500",
    summaryBg: "bg-emerald-50 border-emerald-100",
  },
  [EventType.TaskPartial]: {
    label:     "Task Partial",
    border:    "border-l-amber-600",
    dot:       "bg-amber-600 ring-amber-300",
    badge:     "bg-amber-950/60 text-amber-300 ring-1 ring-amber-600/40",
    rowHover:  "hover:bg-amber-950/30",
    icon:      "CircleDashed",
    iconColor: "text-amber-500",
    summaryBg: "bg-amber-50 border-amber-100",
  },
  [EventType.TaskFailed]: {
    label:     "Task Failed",
    border:    "border-l-red-500",
    dot:       "bg-red-500 ring-red-300",
    badge:     "bg-red-950/60 text-red-300 ring-1 ring-red-500/40",
    rowHover:  "hover:bg-red-950/30",
    icon:      "CircleX",
    iconColor: "text-red-500",
    summaryBg: "bg-red-50 border-red-100",
  },
  [EventType.TaskContinuing]: {
    label:     "Task Continuing",
    border:    "border-l-yellow-500",
    dot:       "bg-yellow-500 ring-yellow-300",
    badge:     "bg-yellow-950/60 text-yellow-300 ring-1 ring-yellow-500/40",
    rowHover:  "hover:bg-yellow-950/30",
    icon:      "RefreshCw",
    iconColor: "text-yellow-500",
    summaryBg: "bg-yellow-50 border-yellow-100",
  },
  [EventType.RunComplete]: {
    label:     "Run Complete",
    border:    "border-l-green-500",
    dot:       "bg-green-500 ring-green-300",
    badge:     "bg-green-900/60 text-green-300 ring-1 ring-green-500/40",
    rowHover:  "hover:bg-green-950/30",
    icon:      "FlagTriangleRight",
    iconColor: "text-green-500",
    summaryBg: "bg-green-50 border-green-100",
  },
  [EventType.RunError]: {
    label:     "Run Error",
    border:    "border-l-red-600",
    dot:       "bg-red-600 ring-red-300",
    badge:     "bg-red-950/60 text-red-300 ring-1 ring-red-600/40",
    rowHover:  "hover:bg-red-950/30",
    icon:      "OctagonAlert",
    iconColor: "text-red-500",
    summaryBg: "bg-red-50 border-red-200",
  },
  [EventType.RunBudgetExceeded]: {
    label:     "Budget Exceeded",
    border:    "border-l-pink-500",
    dot:       "bg-pink-500 ring-pink-300",
    badge:     "bg-pink-950/60 text-pink-300 ring-1 ring-pink-500/40",
    rowHover:  "hover:bg-pink-950/30",
    icon:      "Gauge",
    iconColor: "text-pink-500",
    summaryBg: "bg-pink-50 border-pink-100",
  },
  [EventType.RunAwaitingInput]: {
    label:     "Awaiting Input",
    border:    "border-l-orange-500",
    dot:       "bg-orange-500 ring-orange-300",
    badge:     "bg-orange-950/60 text-orange-300 ring-1 ring-orange-500/40",
    rowHover:  "hover:bg-orange-950/30",
    icon:      "CirclePause",
    iconColor: "text-orange-400",
    summaryBg: "bg-orange-50 border-orange-100",
  },
};

// ---------------------------------------------------------------------------
// Tool-call category classifier
// ---------------------------------------------------------------------------

/**
 * Known tool categories for structured rendering in the detail panel and
 * summary extractor.  Each category defines:
 *  - `tools`      — set of tool name strings that belong to this category.
 *  - `argKey`     — the input field that carries the primary display value.
 *  - `label`      — human-readable argument label shown in the detail panel.
 */
export interface ToolCategory {
  tools: ReadonlySet<string>;
  argKey: string;
  label: string;
}

export const TOOL_CATEGORIES: readonly ToolCategory[] = [
  {
    // Shell execution — argument key is "command"
    tools:  new Set(["bash_exec", "shell_exec", "run_command", "exec"]),
    argKey: "command",
    label:  "Command",
  },
  {
    // File read / write — argument key is "path"
    tools:  new Set([
      "file_read", "read_file",
      "file_write", "write_file",
      "file_append", "append_file",
      "file_delete", "delete_file",
    ]),
    argKey: "path",
    label:  "Path",
  },
  {
    // URL fetch — argument key is "url"
    tools:  new Set([
      "fetch_url", "http_fetch", "web_fetch",
      "fetch", "get_url", "request_url",
    ]),
    argKey: "url",
    label:  "URL",
  },
] as const;

/**
 * Return the `ToolCategory` that matches `toolName`, or `undefined` for
 * tools that have no structured category (e.g. `python_exec`, `read_skill`).
 */
export function classifyTool(toolName: string): ToolCategory | undefined {
  return TOOL_CATEGORIES.find((cat) => cat.tools.has(toolName));
}

// ---------------------------------------------------------------------------
// Structured summary type
// ---------------------------------------------------------------------------

/**
 * A richer, structured representation of a row summary that allows the
 * timeline to render the content with proper visual hierarchy rather than
 * as a single flat string.
 *
 * Variants:
 *  - `message`   — plain narrative text (italicised in the UI).
 *  - `tool`      — a tool invocation: chip for the name + optional arg label/value.
 *  - `plan`      — the number of subtasks in a plan.
 *  - `dispatch`  — subtask→task routing info.
 */
export type RowSummary =
  | { kind: "message"; text: string }
  | { kind: "tool"; tool: string; argLabel?: string; argValue?: string; purpose?: string }
  | { kind: "plan"; count: number }
  | { kind: "dispatch"; subtaskId: string; taskIdShort: string };

/**
 * Returns a structured `RowSummary` for the given event.
 *
 * The TimelineRow component renders this with visual hierarchy (chips,
 * labels, monospace values) instead of a raw string dump.
 */
export function payloadSummaryStructured(event: TraceEvent): RowSummary {
  switch (event.type) {
    case EventType.RunStarted:
      return { kind: "message", text: event.payload.message };

    case EventType.PlanCreated: {
      return { kind: "plan", count: event.payload.data.subtasks.length };
    }

    case EventType.TaskDispatched: {
      const { subtask_id, task_id } = event.payload.data;
      return { kind: "dispatch", subtaskId: subtask_id, taskIdShort: task_id.slice(0, 8) };
    }

    case EventType.AgentProgress: {
      if (event.payload.data === null) {
        return { kind: "message", text: event.payload.message };
      }
      const { tool, input } = event.payload.data;
      const purpose = typeof input.purpose === "string" ? input.purpose : undefined;
      const category = classifyTool(tool);

      if (category) {
        const rawVal = input[category.argKey];
        const val =
          typeof rawVal === "string"
            ? rawVal
            : (Object.values(input).find((v) => typeof v === "string") as string | undefined);
        return {
          kind:     "tool",
          tool,
          argLabel: category.label,
          argValue: val,
          purpose,
        };
      }

      // Generic tool without a category: show first string arg as hint
      const firstVal = Object.values(input)[0];
      const hint = typeof firstVal === "string" ? firstVal : undefined;
      return { kind: "tool", tool, argLabel: undefined, argValue: hint, purpose };
    }

    default:
      return { kind: "message", text: event.payload.message };
  }
}

/**
 * Plain-string fallback (used for `title` tooltip and backward compat).
 * Prefer `payloadSummaryStructured` for rendered output.
 */
export function payloadSummary(event: TraceEvent): string {
  const s = payloadSummaryStructured(event);
  switch (s.kind) {
    case "message":  return s.text;
    case "plan":     return `${s.count} subtask${s.count !== 1 ? "s" : ""} planned`;
    case "dispatch": return `subtask ${s.subtaskId} → task ${s.taskIdShort}…`;
    case "tool":
      if (s.argLabel && s.argValue) return `${s.tool}  ${s.argLabel.toLowerCase()}: ${s.argValue}`;
      if (s.argValue) return `${s.tool}(${s.argValue})`;
      return s.tool;
  }
}

// ---------------------------------------------------------------------------
// Timestamp formatter
// ---------------------------------------------------------------------------

/**
 * Formats a Unix-ms timestamp as a human-readable local time string:
 * `HH:MM:SS.mmm`
 */
export function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

/**
 * Returns elapsed milliseconds from `startMs` to `ts`, formatted as `+NNNms`.
 */
export function formatElapsed(ts: number, startMs: number): string {
  const delta = ts - startMs;
  if (delta < 1000) return `+${delta}ms`;
  return `+${(delta / 1000).toFixed(2)}s`;
}
