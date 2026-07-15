/**
 * TimelineView — scrollable list of trace events grouped by LLM turn.
 *
 * Layout overview
 * ---------------
 * Events that carry a `turn_index` in their payload are collected into
 * TurnGroupCards. Each card shows:
 *
 *   ┌── thought caption (clickable) ───────────────────────────────────┐
 *   │  🧠  [thought text...]                                  +0.5s   │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │  │ ●  bash_exec  cmd: echo hello                        +0.6s   │
 *   │  │ ⟳  file_read  path: /foo/bar              [pending]          │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Events without a `turn_index` (run-level events, task events, etc.) are
 * rendered as the existing flat TimelineRow cards.
 *
 * Props
 * -----
 * - `events`     — filtered, ordered TraceEvent array to render.
 * - `allEvents`  — full (unfiltered) event list used to resolve tool results.
 * - `startMs`    — epoch ms of the first event in the *full* trace.
 * - `selectedEvent`  — currently selected event (or null).
 * - `onSelectEvent`  — called when the user clicks a row.
 * - `emptyMessage`   — optional override for the no-events message.
 * - `scrollToEnd`    — when true, auto-scrolls to the bottom (live mode).
 */

import React from "react";
import {
  Clock,
  ChevronRight,
  Play,
  ListTree,
  Send,
  Wrench,
  Brain,
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
  Loader2,
} from "lucide-react";
import type { TraceEvent } from "../types/events";
import { EventType } from "../types/events";
import {
  EVENT_META,
  formatTimestamp,
  formatElapsed,
  payloadSummaryStructured,
  groupEventsByTurn,
  buildToolResultMap,
} from "./timelineUtils";
import type { RowSummary, TurnGroup } from "./timelineUtils";

// ---------------------------------------------------------------------------
// Icon map — translates EventMeta.icon string → Lucide component
// ---------------------------------------------------------------------------

const EVENT_ICON_MAP: Record<string, React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>> = {
  Play,
  ListTree,
  Send,
  Wrench,
  Brain,
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
// Structured summary strip (used inside flat TimelineRow cards)
// ---------------------------------------------------------------------------

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

function SummaryStrip({ summary, metaSummaryBg, metaIconColor }: {
  summary: RowSummary;
  metaSummaryBg: string;
  metaIconColor: string;
}) {
  if (summary.kind === "tool") {
    const { tool, argLabel, argValue, purpose } = summary;
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
// Flat TimelineRow — unchanged from the original, used for standalone events
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
// Compact item row inside a TurnGroupCard
// ---------------------------------------------------------------------------

/** Compact inline summary for an item inside a turn group. */
function TurnItemContent({ event }: { event: TraceEvent }) {
  const meta = EVENT_META[event.type];
  const summary = payloadSummaryStructured(event);

  if (summary.kind === "tool") {
    const displayValue = summary.argValue
      ? summary.argValue.length > 40
        ? summary.argValue.slice(0, 40) + "…"
        : summary.argValue
      : null;
    return (
      <>
        <span className={`turn-item-badge ${meta.badge}`}>{meta.label}</span>
        <span className="turn-item-tool-chip">{summary.tool}</span>
        {displayValue && (
          <code className="turn-item-value">{displayValue}</code>
        )}
      </>
    );
  }

  const text = summary.kind === "message" ? summary.text
    : summary.kind === "plan" ? `${summary.count} subtasks planned`
    : summary.kind === "dispatch" ? `${summary.subtaskId} → ${summary.taskIdShort}…`
    : "";

  return (
    <>
      <span className={`turn-item-badge ${meta.badge}`}>{meta.label}</span>
      {text && <span className="turn-item-message">{text}</span>}
    </>
  );
}

interface TurnItemRowProps {
  event: TraceEvent;
  startMs: number;
  isSelected: boolean;
  isPending: boolean;
  hasResult: boolean;
  resultIsError: boolean;
  onSelect: (event: TraceEvent) => void;
}

const TurnItemRow = React.memo(function TurnItemRow({
  event,
  startMs,
  isSelected,
  isPending,
  hasResult,
  resultIsError,
  onSelect,
}: TurnItemRowProps) {
  const meta = EVENT_META[event.type];

  return (
    <div
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      className={[
        "turn-item-row",
        isSelected ? "turn-item-row--selected" : "",
      ].join(" ")}
      onClick={() => onSelect(event)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(event);
        }
      }}
      title={`#${event.seq} ${meta.label}`}
    >
      {/* Bullet dot or spinner */}
      {isPending ? (
        <Loader2 className="turn-item-spinner" aria-hidden="true" />
      ) : (
        <span className={`turn-item-dot ${meta.dot}`} aria-hidden="true" />
      )}

      {/* Item content */}
      <div className="turn-item-content">
        <TurnItemContent event={event} />
      </div>

      {/* Result status indicator */}
      {hasResult && !isPending && (
        resultIsError
          ? <span className="turn-item-result-error-dot" title="Tool returned an error" aria-hidden="true" />
          : <span className="turn-item-result-dot" title="Tool completed successfully" aria-hidden="true" />
      )}

      {/* Timestamp */}
      <span className="turn-item-time">{formatElapsed(event.ts, startMs)}</span>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Turn group card
// ---------------------------------------------------------------------------

interface TurnGroupCardProps {
  group: Extract<TurnGroup, { kind: "turn" }>;
  startMs: number;
  selectedEvent: TraceEvent | null;
  onSelectEvent: (event: TraceEvent) => void;
  toolResultMap: Map<string, TraceEvent>;
}

const TurnGroupCard = React.memo(function TurnGroupCard({
  group,
  startMs,
  selectedEvent,
  onSelectEvent,
  toolResultMap,
}: TurnGroupCardProps) {
  const { thought, items } = group;

  // Is any event in this group currently selected?
  const hasSelected =
    (thought != null && selectedEvent?.seq === thought.seq) ||
    items.some((e) => selectedEvent?.seq === e.seq);

  const thoughtSelected = thought != null && selectedEvent?.seq === thought.seq;

  return (
    <div
      className={[
        "turn-group-card",
        hasSelected ? "turn-group-card--has-selected" : "",
      ].join(" ")}
    >
      {/* ── Thought caption ────────────────────────────────────────────── */}
      {thought ? (
        <button
          type="button"
          className={[
            "turn-group-thought",
            thoughtSelected ? "turn-group-thought--selected" : "",
          ].join(" ")}
          onClick={() => onSelectEvent(thought)}
          aria-selected={thoughtSelected}
          title={thought.payload.message}
        >
          <Brain className="turn-group-thought-icon" aria-hidden="true" />
          <span className="turn-group-thought-text">{thought.payload.message}</span>
          <span className="turn-group-thought-time">{formatElapsed(thought.ts, startMs)}</span>
        </button>
      ) : (
        <div className="turn-group-no-thought">
          <span className="turn-group-no-thought-label">
            turn {group.turn_index}{group.agent_id ? ` · ${group.agent_id}` : ""}
          </span>
        </div>
      )}

      {/* ── Items list ─────────────────────────────────────────────────── */}
      {items.length > 0 && (
        <div className="turn-group-items">
          {items.map((event) => {
            const toolCallId = event.tool_call_id;
            const toolResult = toolCallId ? toolResultMap.get(toolCallId) : undefined;
            const isPending = toolCallId != null && toolResult == null;
            const hasResult = toolResult != null;
            const resultIsError =
              hasResult &&
              toolResult != null &&
              toolResult.type === EventType.AgentToolResult &&
              toolResult.payload.data.is_error === true;

            return (
              <TurnItemRow
                key={event.seq}
                event={event}
                startMs={startMs}
                isSelected={selectedEvent?.seq === event.seq}
                isPending={isPending}
                hasResult={hasResult}
                resultIsError={resultIsError}
                onSelect={onSelectEvent}
              />
            );
          })}
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// TimelineView
// ---------------------------------------------------------------------------

export interface TimelineViewProps {
  events: TraceEvent[];
  /** Full (unfiltered) event list — used to resolve tool results. */
  allEvents?: TraceEvent[];
  startMs: number;
  selectedEvent: TraceEvent | null;
  onSelectEvent: (event: TraceEvent) => void;
  emptyMessage?: string;
  /** When true, scrolls to the bottom whenever the event list grows (live streaming mode). */
  scrollToEnd?: boolean;
}

export function TimelineView({
  events,
  allEvents,
  startMs,
  selectedEvent,
  onSelectEvent,
  emptyMessage = "No events match the current filters.",
  scrollToEnd = false,
}: TimelineViewProps) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  // Build the tool-result map from the full event list so pending state is
  // correct even when agent:tool_result events are filtered out.
  const toolResultMap = React.useMemo(
    () => buildToolResultMap(allEvents ?? events),
    [allEvents, events],
  );

  // Group the filtered events into turn groups.
  const groups = React.useMemo(() => groupEventsByTurn(events), [events]);

  // Flat list of all selectable events in display order, used for keyboard nav.
  const selectableEvents = React.useMemo<TraceEvent[]>(() => {
    const result: TraceEvent[] = [];
    for (const group of groups) {
      if (group.kind === "standalone") {
        result.push(group.event);
      } else {
        if (group.thought) result.push(group.thought);
        result.push(...group.items);
      }
    }
    return result;
  }, [groups]);

  // Scroll selected row into view when selection changes.
  React.useEffect(() => {
    if (!selectedEvent || !listRef.current) return;
    const selected = listRef.current.querySelector('[aria-selected="true"]');
    selected?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedEvent]);

  function handleListKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    if (selectableEvents.length === 0) return;
    e.preventDefault();

    const currentIndex = selectedEvent
      ? selectableEvents.findIndex((ev) => ev.seq === selectedEvent.seq)
      : -1;

    let nextIndex: number;
    if (e.key === "ArrowDown") {
      nextIndex = currentIndex === -1 ? 0 : Math.min(currentIndex + 1, selectableEvents.length - 1);
    } else {
      nextIndex = currentIndex === -1 ? selectableEvents.length - 1 : Math.max(currentIndex - 1, 0);
    }

    if (nextIndex === currentIndex) return;
    onSelectEvent(selectableEvents[nextIndex]);

    const rows = listRef.current?.querySelectorAll<HTMLElement>('[role="option"]');
    rows?.[nextIndex]?.focus({ preventScroll: true });
  }

  // In live mode, keep the latest event visible as new ones arrive.
  React.useEffect(() => {
    if (!scrollToEnd) return;
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [scrollToEnd, events.length]);

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
      onKeyDown={handleListKeyDown}
    >
      {groups.map((group, i) => {
        if (group.kind === "standalone") {
          return (
            <TimelineRow
              key={`${group.event.run_id}-${group.event.seq}`}
              event={group.event}
              startMs={startMs}
              isSelected={selectedEvent?.seq === group.event.seq}
              onSelect={onSelectEvent}
            />
          );
        }

        // Turn group
        const groupKey = `turn-${group.agent_id ?? ""}-${group.turn_index}-${i}`;
        return (
          <TurnGroupCard
            key={groupKey}
            group={group}
            startMs={startMs}
            selectedEvent={selectedEvent}
            onSelectEvent={onSelectEvent}
            toolResultMap={toolResultMap}
          />
        );
      })}
      {scrollToEnd && <div ref={bottomRef} aria-hidden="true" />}
    </div>
  );
}
