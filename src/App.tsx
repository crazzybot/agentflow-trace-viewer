/**
 * App — root component for AgentFlow Trace Viewer.
 *
 * State machine (linear):
 *   idle → loading → loaded (+ optional selected event)
 *
 * Layout (once loaded):
 *   ┌──────────────────────────────────────────────────────┐
 *   │  Header (title + file info + reload button)          │
 *   ├──────────────────────────────────────────────────────┤
 *   │  FilterBar                                           │
 *   ├──────────────────────────────────────────────────────┤
 *   │  TimelineView            │  EventDetail (slide-in)   │
 *   └──────────────────────────────────────────────────────┘
 *
 * When no trace is loaded: centred FileLoader hero section.
 */

import React from "react";
import { Activity, FileJson2, X as XIcon } from "lucide-react";
import type { EventTypeValue, RunTrace, TraceEvent } from "./types/events";
import { loadTrace } from "./utils/loadTrace";
import { FileLoader } from "./components/FileLoader";
import { FilterBar } from "./components/FilterBar";
import { TimelineView } from "./components/TimelineView";
import { EventDetail } from "./components/EventDetail";
import "./App.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AppState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; trace: RunTrace; fileName: string }
  | { status: "error"; message: string };

// ---------------------------------------------------------------------------
// Filtering helpers
// ---------------------------------------------------------------------------

function applyFilters(
  trace: RunTrace,
  selectedTypes: Set<EventTypeValue>,
  timeRange: [number, number],
): TraceEvent[] {
  const [startOffset, endOffset] = timeRange;
  const absStart = trace.timeRange.startMs + startOffset;
  const absEnd = trace.timeRange.startMs + endOffset;

  return trace.events.filter((e) => {
    if (!selectedTypes.has(e.type)) return false;
    if (e.ts < absStart || e.ts > absEnd) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// App component
// ---------------------------------------------------------------------------

export default function App() {
  // ── Core state ────────────────────────────────────────────────────────────
  const [appState, setAppState] = React.useState<AppState>({ status: "idle" });

  // ── Filter state (only meaningful when loaded) ─────────────────────────
  const [selectedTypes, setSelectedTypes] = React.useState<Set<EventTypeValue>>(new Set());
  const [selectedTimeRange, setSelectedTimeRange] = React.useState<[number, number]>([0, 0]);

  // ── Selection state ───────────────────────────────────────────────────────
  const [selectedEvent, setSelectedEvent] = React.useState<TraceEvent | null>(null);

  // ── File load handler ────────────────────────────────────────────────────

  const handleLoad = React.useCallback((text: string, fileName: string) => {
    // Intercept the FETCH_ERROR sentinel from FileLoader
    if (text.startsWith("FETCH_ERROR:")) {
      setAppState({ status: "error", message: text.slice("FETCH_ERROR:".length) });
      return;
    }

    setAppState({ status: "loading" });
    setSelectedEvent(null);

    // Run parsing asynchronously to avoid blocking the UI thread
    setTimeout(() => {
      try {
        const trace = loadTrace(text);
        setSelectedTypes(new Set(trace.eventTypes));
        setSelectedTimeRange([0, trace.timeRange.durationMs]);
        setAppState({ status: "loaded", trace, fileName });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setAppState({ status: "error", message: msg });
      }
    }, 0);
  }, []);

  // ── Reset back to the file picker ────────────────────────────────────────

  function handleReset() {
    setAppState({ status: "idle" });
    setSelectedEvent(null);
    setSelectedTypes(new Set());
    setSelectedTimeRange([0, 0]);
  }

  // ── Derived data ─────────────────────────────────────────────────────────

  const filteredEvents = React.useMemo<TraceEvent[]>(() => {
    if (appState.status !== "loaded") return [];
    return applyFilters(appState.trace, selectedTypes, selectedTimeRange);
  }, [appState, selectedTypes, selectedTimeRange]);

  // ── Render: idle / error → FileLoader hero ────────────────────────────────

  if (appState.status === "idle" || appState.status === "error" || appState.status === "loading") {
    return (
      <main className="app-hero">
        {/* Brand header */}
        <div className="app-brand">
          <Activity className="app-brand-icon" aria-hidden="true" />
          <h1 className="app-brand-title">AgentFlow Trace Viewer</h1>
        </div>
        <p className="app-brand-subtitle">
          Load a JSON or JSONL trace file to inspect agent execution step-by-step.
        </p>

        <FileLoader
          onLoad={handleLoad}
          isLoading={appState.status === "loading"}
          error={appState.status === "error" ? appState.message : null}
        />
      </main>
    );
  }

  // ── Render: loaded ────────────────────────────────────────────────────────

  const { trace, fileName } = appState;

  return (
    <div className="app-shell">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="app-topbar">
        <div className="app-topbar-brand">
          <Activity className="app-topbar-icon" aria-hidden="true" />
          <span className="app-topbar-title">AgentFlow Trace Viewer</span>
        </div>

        <div className="app-topbar-file">
          <FileJson2 className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
          <span className="app-topbar-filename" title={fileName}>{fileName}</span>
          <span className="app-topbar-runid" title={trace.run_id}>
            run&nbsp;{trace.run_id.slice(0, 8)}…
          </span>
          <span className="app-topbar-eventcount">
            {trace.events.length} event{trace.events.length !== 1 ? "s" : ""}
          </span>
        </div>

        <button
          type="button"
          onClick={handleReset}
          className="app-topbar-reload"
          aria-label="Close trace and load another file"
        >
          <XIcon className="w-3.5 h-3.5" aria-hidden="true" />
          Close
        </button>
      </header>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="app-filterbar-wrapper">
        <FilterBar
          availableTypes={trace.eventTypes}
          selectedTypes={selectedTypes}
          onTypesChange={setSelectedTypes}
          timeRange={trace.timeRange}
          selectedTimeRange={selectedTimeRange}
          onTimeRangeChange={setSelectedTimeRange}
          totalCount={trace.events.length}
          filteredCount={filteredEvents.length}
        />
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="app-content">
        <TimelineView
          events={filteredEvents}
          startMs={trace.timeRange.startMs}
          selectedEvent={selectedEvent}
          onSelectEvent={setSelectedEvent}
        />
      </div>

      {/* ── Event detail panel ───────────────────────────────────────────── */}
      <EventDetail
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  );
}
