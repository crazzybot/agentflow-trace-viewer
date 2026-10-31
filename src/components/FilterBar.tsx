/**
 * FilterBar — controls for filtering the event timeline.
 *
 * Renders:
 *  - Checkboxes for each event type present in the trace.
 *  - A time-range slider pair (start offset / end offset in ms).
 *  - An "All events" chip showing the current filtered count.
 *  - A "Reset" button that restores defaults.
 *  The type and time controls collapse behind the header; the choice is remembered.
 *
 * Props
 * -----
 * - `availableTypes`    — set of event-type strings in the loaded trace.
 * - `selectedTypes`     — currently enabled types (controls checkboxes).
 * - `onTypesChange`     — called with the new set when a checkbox toggles.
 * - `timeRange`         — full time range from the loaded trace (ms).
 * - `selectedTimeRange` — currently applied [start, end] offsets in ms from timeRange.startMs.
 * - `onTimeRangeChange` — called with the new [start, end] tuple.
 * - `totalCount`        — total events in the trace.
 * - `filteredCount`     — events passing current filters.
 */

import React from "react";
import { SlidersHorizontal, RotateCcw, ChevronRight } from "lucide-react";
import type { EventTypeValue, TimeRange } from "../types/events";
import { EVENT_META } from "./timelineUtils";

const EXPANDED_KEY = "filterbar-expanded";

function readExpanded(): boolean {
  try {
    return localStorage.getItem(EXPANDED_KEY) === "1";
  } catch {
    return false;
  }
}

export interface FilterBarProps {
  availableTypes: Set<EventTypeValue>;
  selectedTypes: Set<EventTypeValue>;
  onTypesChange: (types: Set<EventTypeValue>) => void;
  timeRange: TimeRange;
  selectedTimeRange: [number, number]; // [startOffset, endOffset] relative to timeRange.startMs
  onTimeRangeChange: (range: [number, number]) => void;
  totalCount: number;
  filteredCount: number;
}

export function FilterBar({
  availableTypes,
  selectedTypes,
  onTypesChange,
  timeRange,
  selectedTimeRange,
  onTimeRangeChange,
  totalCount,
  filteredCount,
}: FilterBarProps) {
  const duration = timeRange.durationMs;
  const [expanded, setExpanded] = React.useState(readExpanded);

  function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    try {
      localStorage.setItem(EXPANDED_KEY, next ? "1" : "0");
    } catch {
      // storage blocked: the choice still applies until reload
    }
  }

  // ── Checkbox toggle ──────────────────────────────────────────────────────

  function toggleType(type: EventTypeValue) {
    const next = new Set(selectedTypes);
    if (next.has(type)) {
      next.delete(type);
    } else {
      next.add(type);
    }
    onTypesChange(next);
  }

  // ── Time-range slider ────────────────────────────────────────────────────

  function handleStartChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value);
    const clamped = Math.min(val, selectedTimeRange[1]);
    onTimeRangeChange([clamped, selectedTimeRange[1]]);
  }

  function handleEndChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value);
    const clamped = Math.max(val, selectedTimeRange[0]);
    onTimeRangeChange([selectedTimeRange[0], clamped]);
  }

  // ── Reset ────────────────────────────────────────────────────────────────

  function handleReset() {
    onTypesChange(new Set(availableTypes));
    onTimeRangeChange([0, duration]);
  }

  const isDirty =
    selectedTypes.size !== availableTypes.size ||
    selectedTimeRange[0] !== 0 ||
    selectedTimeRange[1] !== duration;

  // ── Helpers ──────────────────────────────────────────────────────────────

  function fmtOffset(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  const sortedTypes = [...availableTypes].sort();
  const hiddenTypes = availableTypes.size - selectedTypes.size;
  const timeNarrowed = selectedTimeRange[0] !== 0 || selectedTimeRange[1] !== duration;
  const summary = [
    hiddenTypes > 0 && `${hiddenTypes} type${hiddenTypes === 1 ? "" : "s"} hidden`,
    timeNarrowed && `${fmtOffset(selectedTimeRange[0])} – ${fmtOffset(selectedTimeRange[1])}`,
  ].filter(Boolean).join(" · ");

  return (
    <div className={`filterbar-root ${expanded ? "" : "filterbar-root--collapsed"}`}>
      {/* ── Header row (toggles the controls) ───────────────────────────── */}
      <div className="filterbar-header">
        <button
          type="button"
          className="filterbar-title"
          onClick={toggleExpanded}
          aria-expanded={expanded}
          aria-controls={expanded ? "filterbar-controls" : undefined}
        >
          <ChevronRight className="filterbar-chevron" aria-hidden="true" />
          <SlidersHorizontal className="filterbar-title-icon" aria-hidden="true" />
          <span>Filters</span>
          {!expanded && summary && <span className="filterbar-summary">{summary}</span>}
        </button>

        <div className="filterbar-count-row">
          <span className="filterbar-count-chip">
            {filteredCount} / {totalCount} events
          </span>

          {isDirty && (
            <button
              type="button"
              onClick={handleReset}
              className="filterbar-reset-btn"
              aria-label="Reset all filters"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              Reset
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div id="filterbar-controls" className="filterbar-controls">
          {/* ── Event types ─────────────────────────────────────────────────── */}
          <fieldset className="filterbar-fieldset">
            <legend className="filterbar-legend">Event Types</legend>
            <div className="filterbar-chips">
              {sortedTypes.map((type) => {
                const meta = EVENT_META[type];
                if (!meta) return null;
                const checked = selectedTypes.has(type);
                const checkboxId = `filter-type-${type.replace(/:/g, "-")}`;
                return (
                  <label
                    key={type}
                    htmlFor={checkboxId}
                    className={[
                      "filterbar-chip",
                      checked ? "filterbar-chip--active" : "filterbar-chip--inactive",
                    ].join(" ")}
                  >
                    <input
                      id={checkboxId}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleType(type)}
                      className="sr-only"
                    />
                    {/* Colour dot */}
                    <span
                      className={`filterbar-chip-dot ${meta.dot}`}
                      aria-hidden="true"
                    />
                    {meta.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* ── Time range ──────────────────────────────────────────────────── */}
          {duration > 0 && (
            <div className="filterbar-time">
              <p className="filterbar-legend">
                Time Range
                <span className="filterbar-time-display">
                  {fmtOffset(selectedTimeRange[0])} – {fmtOffset(selectedTimeRange[1])}
                </span>
              </p>
              <div className="filterbar-sliders">
                {/* Start slider */}
                <div className="filterbar-slider-row">
                  <label
                    htmlFor="filter-start"
                    className="filterbar-slider-label"
                  >
                    Start
                  </label>
                  <input
                    id="filter-start"
                    type="range"
                    min={0}
                    max={duration}
                    step={Math.max(1, Math.round(duration / 1000))}
                    value={selectedTimeRange[0]}
                    onChange={handleStartChange}
                    className="filterbar-slider"
                    aria-valuemin={0}
                    aria-valuemax={duration}
                    aria-valuenow={selectedTimeRange[0]}
                    aria-valuetext={fmtOffset(selectedTimeRange[0])}
                  />
                  <span className="filterbar-slider-val">{fmtOffset(selectedTimeRange[0])}</span>
                </div>
                {/* End slider */}
                <div className="filterbar-slider-row">
                  <label
                    htmlFor="filter-end"
                    className="filterbar-slider-label"
                  >
                    End
                  </label>
                  <input
                    id="filter-end"
                    type="range"
                    min={0}
                    max={duration}
                    step={Math.max(1, Math.round(duration / 1000))}
                    value={selectedTimeRange[1]}
                    onChange={handleEndChange}
                    className="filterbar-slider"
                    aria-valuemin={0}
                    aria-valuemax={duration}
                    aria-valuenow={selectedTimeRange[1]}
                    aria-valuetext={fmtOffset(selectedTimeRange[1])}
                  />
                  <span className="filterbar-slider-val">{fmtOffset(selectedTimeRange[1])}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
