/**
 * TimelineView — scrollable list of filtered trace events.
 *
 * Each card shows two visual layers:
 *
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │ ● #seq  │ 12:34:56.789  +0.12s  │  [Badge]  agent-chip  │  ›      │
 *   ├─────────────────────────────────────────────────────────────────────┤
 *   │  ⌘  [tool-chip]  label:  monospace value…                          │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 * The bottom strip carries the structured payload summary:
 *  - tool invocations → tool name chip + arg label + monospace value
 *  - plan events      → subtask count pill
 *  - dispatch events  → subtask → task routing arrows
 *  - narrative text   → italicised message
 *
 * Props
 * -----
 * - `events`          — filtered, ordered TraceEvent array to render.
 * - `startMs`         — epoch ms of the first event in the *full* trace.
 * - `selectedEvent`   — currently selected event (or null).
 * - `onSelectEvent`   — called when the user clicks / keys-activates a row.
 * - `emptyMessage`    — optional override for the no-events message.
 */

import React from "react";
import {
  Clock,
  ChevronRight,
  Play,
  ListTree,
  Send,
  Wrench,
  MessageCircle,
  CircleCheck,
  CircleDashed,
  CircleX,
  RefreshCw,
  FlagTriangleRight,
  OctagonAlert,
  Gauge,
  Terminal,
  FileText,
  Globe,
  Layers,
} from "lucide-react";
import type { TraceEvent } from "../types/events";
import {
  EVENT_META,
  formatTimestamp,
  formatElapsed,
  payloadSummaryStructured,
} from "./timelineUtils";
import type { RowSummary } from "./timelineUtils";

// ---------------------------------------------------------------------------
// Icon map — translates EventMeta.icon string → Lucide component
// ---------------------------------------------------------------------------

const EVENT_ICON_MAP: Record<string, React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>> = {
  Play,
  ListTree,
  Send,
  Wrench,
  MessageCircle,
  CircleCheck,
  CircleDashed,
  CircleX,
  RefreshCw,
  FlagTriangleRight,
  OctagonAlert,
  Gauge,
};

// ---------------------------------------------------------------------------
// Agent-ID chip
// ---------------------------------------------------------------------------

function AgentChip({ agentId }: { agentId: string | null }) {
  if (!agentId) return null;
  return (
    <span
      className="timeline-agent-chip"
      title={agentId}
      aria-label={`Agent: ${agentId}`}
    >
      {agentId}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Structured summary strip
// ---------------------------------------------------------------------------

/** Pick a contextual icon for the summary strip based on the tool name. */
function toolIcon(tool: string): React.ReactNode {
  if (/bash|shell|exec|command|run/.test(tool))
    return <Terminal className="timeline-summary-icon" aria-hidden="true" />;
  if (/file|read|write|append|delete/.test(tool))
    return <FileText className="timeline-summary-icon" aria-hidden="true" />;
  if (/fetch|http|url|web|request/.test(tool))
    return <Globe className="timeline-summary-icon" aria-hidden="true" />;
  return <Layers className="timeline-summary-icon" aria-hidden="true" />;
}

function summaryTooltip(summary: RowSummary): string {
  switch (summary.kind) {
    case "message":
      return summary.text;
    case "plan":
      return `${summary.count} subtask${summary.count !== 1 ? "s" : ""} planned`;
    case "dispatch":
      return `subtask ${summary.subtaskId} → task ${summary.taskIdShort}…`;
    case "tool":
      if (summary.argLabel && summary.argValue) {
        return `${summary.tool} ${summary.argLabel.toLowerCase()}: ${summary.argValue}${summary.purpose ? ` — Purpose: ${summary.purpose}` : ""}`;
      }
      if (summary.argValue) {
        return `${summary.tool}(${summary.argValue})${summary.purpose ? ` — Purpose: ${summary.purpose}` : ""}`;
      }
      return `${summary.tool}${summary.purpose ? ` — Purpose: ${summary.purpose}` : ""}`;
  }
}

/**
 * Renders the bottom summary strip of a TimelineRow card.
 * Each `RowSummary` variant gets its own structured layout.
 */
function SummaryStrip({ summary, metaSummaryBg, metaIconColor }: {
  summary: RowSummary;
  metaSummaryBg: string;
  metaIconColor: string;
}) {
  if (summary.kind === "tool") {
    const { tool, argLabel, argValue, purpose } = summary;
    // Truncate long values to keep rows compact; full value is in the title
    const displayValue = argValue
      ? argValue.length > 72
        ? argValue.slice(0, 72) + "…"
        : argValue
      : null;

    return (
      <div
        className={`timeline-summary-strip ${metaSummaryBg}`}
        title={summaryTooltip(summary)}
      >
        <span className={`timeline-summary-strip-icon ${metaIconColor}`} aria-hidden="true">
          {toolIcon(tool)}
        </span>
        <span className="timeline-summary-tool-chip">{tool}</span>
        {argLabel && displayValue && (
          <>
            <span className="timeline-summary-sep">{argLabel}</span>
            <code className="timeline-summary-value">{displayValue}</code>
          </>
        )}
        {!argLabel && displayValue && (
          <code className="timeline-summary-value timeline-summary-value--hint">
            {displayValue}
          </code>
        )}
        {purpose && (
          <div className="timeline-summary-purpose text-xs text-gray-400 mt-1 truncate" title={purpose}>
            {purpose}
          </div>
        )}
      </div>
    );
  }

  if (summary.kind === "plan") {
    return (
      <div className={`timeline-summary-strip ${metaSummaryBg}`}>
        <span className={`timeline-summary-strip-icon ${metaIconColor}`} aria-hidden="true">
          <ListTree className="timeline-summary-icon" aria-hidden="true" />
        </span>
        <span className="timeline-summary-plan-count">
          {summary.count}
        </span>
        <span className="timeline-summary-plan-label">
          {summary.count === 1 ? "subtask" : "subtasks"} planned
        </span>
      </div>
    );
  }

  if (summary.kind === "dispatch") {
    return (
      <div className={`timeline-summary-strip ${metaSummaryBg}`}>
        <span className={`timeline-summary-strip-icon ${metaIconColor}`} aria-hidden="true">
          <Send className="timeline-summary-icon" aria-hidden="true" />
        </span>
        <span className="timeline-summary-dispatch">
          <span className="timeline-summary-dispatch-label">subtask</span>
          <code className="timeline-summary-dispatch-id">{summary.subtaskId}</code>
          <span className="timeline-summary-dispatch-arrow">→</span>
          <span className="timeline-summary-dispatch-label">task</span>
          <code className="timeline-summary-dispatch-id">{summary.taskIdShort}…</code>
        </span>
      </div>
    );
  }

  // kind === "message"
  if (!summary.text) return null;
  return (
    <div className={`timeline-summary-strip ${metaSummaryBg}`}>
      <span className={`timeline-summary-strip-icon ${metaIconColor}`} aria-hidden="true">
        <MessageCircle className="timeline-summary-icon" aria-hidden="true" />
      </span>
      <p className="timeline-summary-message" title={summary.text}>
        {summary.text}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual row — memoised so only changed rows re-render
// ---------------------------------------------------------------------------

interface RowProps {
  event: TraceEvent;
  startMs: number;
  isSelected: boolean;
  onSelect: (event: TraceEvent) => void;
}

const TimelineRow = React.memo(function TimelineRow({
  event,
  startMs,
  isSelected,
  onSelect,
}: RowProps) {
  const meta    = EVENT_META[event.type];
  const summary = payloadSummaryStructured(event);

  const IconComponent = EVENT_ICON_MAP[meta.icon];

  return (
    <div
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      className={[
        "timeline-row",
        `border-l-4 ${meta.border}`,
        isSelected ? "timeline-row--selected" : meta.rowHover,
      ].join(" ")}
      onClick={() => onSelect(event)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(event);
        }
      }}
    >
      {/* ── Top meta bar ─────────────────────────────────────────────── */}
      <div className="timeline-row-meta">

        {/* Sequence number + dot */}
        <div className="timeline-seq-col" aria-hidden="true">
          <span className={`timeline-dot ${meta.dot}`} />
          <span className="timeline-seq-num">#{event.seq}</span>
        </div>

        {/* Divider */}
        <span className="timeline-meta-divider" aria-hidden="true" />

        {/* Timestamps */}
        <div className="timeline-ts-col" aria-label={`Timestamp ${formatTimestamp(event.ts)}`}>
          <Clock className="w-3 h-3 shrink-0 text-gray-400" aria-hidden="true" />
          <span className="timeline-ts-abs">{formatTimestamp(event.ts)}</span>
          <span className="timeline-ts-rel">{formatElapsed(event.ts, startMs)}</span>
        </div>

        {/* Spacer */}
        <span className="timeline-meta-spacer" aria-hidden="true" />

        {/* Event-type badge + agent chip */}
        <div className="timeline-type-col">
          {IconComponent && (
            <IconComponent
              className={`timeline-type-icon ${meta.iconColor}`}
              aria-hidden="true"
            />
          )}
          <span className={`timeline-badge ${meta.badge}`}>{meta.label}</span>
          <AgentChip agentId={event.agent_id} />
        </div>

        {/* Chevron affordance */}
        <ChevronRight
          className={[
            "timeline-chevron",
            isSelected ? "text-blue-400" : "text-gray-300",
          ].join(" ")}
          aria-hidden="true"
        />
      </div>

      {/* ── Summary strip ────────────────────────────────────────────── */}
      <SummaryStrip
        summary={summary}
        metaSummaryBg={meta.summaryBg}
        metaIconColor={meta.iconColor}
      />
    </div>
  );
});

// ---------------------------------------------------------------------------
// TimelineView
// ---------------------------------------------------------------------------

export interface TimelineViewProps {
  events: TraceEvent[];
  startMs: number;
  selectedEvent: TraceEvent | null;
  onSelectEvent: (event: TraceEvent) => void;
  emptyMessage?: string;
}

export function TimelineView({
  events,
  startMs,
  selectedEvent,
  onSelectEvent,
  emptyMessage = "No events match the current filters.",
}: TimelineViewProps) {
  const listRef = React.useRef<HTMLDivElement>(null);

  // Scroll selected row into view when selection changes via external means
  // (e.g. keyboard shortcut in parent).
  React.useEffect(() => {
    if (!selectedEvent || !listRef.current) return;
    const selected = listRef.current.querySelector('[aria-selected="true"]');
    selected?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedEvent]);

  if (events.length === 0) {
    return (
      <div className="timeline-empty" role="status">
        <p className="text-gray-500 text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Trace events"
      aria-multiselectable="false"
      className="timeline-list"
    >
      {events.map((event) => (
        <TimelineRow
          key={`${event.run_id}-${event.seq}`}
          event={event}
          startMs={startMs}
          isSelected={selectedEvent?.seq === event.seq}
          onSelect={onSelectEvent}
        />
      ))}
    </div>
  );
}
