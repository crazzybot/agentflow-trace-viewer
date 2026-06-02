import React from "react";
import { Activity, FileJson2, Server, AlertCircle, X as XIcon } from "lucide-react";
import type { EventTypeValue, RunTrace, TraceEvent } from "./types/events";
import type { RunInfo } from "./types/runs";
import { loadTrace } from "./utils/loadTrace";
import { fetchRunEventsText, fetchRunResultsText } from "./api/agentflow";
import { FileLoader } from "./components/FileLoader";
import { RunSelector } from "./components/RunSelector";
import { FilterBar } from "./components/FilterBar";
import { TimelineView } from "./components/TimelineView";
import { EventDetail } from "./components/EventDetail";
import "./App.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TraceSource =
  | { type: "file"; fileName: string }
  | { type: "api"; runId: string };

type AppState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; trace: RunTrace; source: TraceSource }
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

  // ── Helpers for entering loaded state ────────────────────────────────────

  function enterLoaded(trace: RunTrace, source: TraceSource) {
    setSelectedTypes(new Set(trace.eventTypes));
    setSelectedTimeRange([0, trace.timeRange.durationMs]);
    setAppState({ status: "loaded", trace, source });
  }

  // ── File load handler ────────────────────────────────────────────────────

  const handleLoad = React.useCallback((text: string, fileName: string) => {
    if (text.startsWith("FETCH_ERROR:")) {
      setAppState({ status: "error", message: text.slice("FETCH_ERROR:".length) });
      return;
    }

    setAppState({ status: "loading" });
    setSelectedEvent(null);

    setTimeout(() => {
      try {
        const trace = loadTrace(text);
        enterLoaded(trace, { type: "file", fileName });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setAppState({ status: "error", message: msg });
      }
    }, 0);
  }, []);

  // ── API run load handler ──────────────────────────────────────────────────

  const handleRunLoad = React.useCallback(async (run: RunInfo) => {
    setAppState({ status: "loading" });
    setSelectedEvent(null);

    try {
      const eventsText = await fetchRunEventsText(run.run_id);

      let resultsText: string | undefined;
      if (run.has_results) {
        try {
          resultsText = await fetchRunResultsText(run.run_id);
        } catch {
          // Results are optional — ignore errors and load without them
        }
      }

      const trace = loadTrace(eventsText, resultsText);
      enterLoaded(trace, { type: "api", runId: run.run_id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAppState({ status: "error", message: msg });
    }
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

  // ── Render: idle / error / loading → two-panel hero ──────────────────────

  if (appState.status === "idle" || appState.status === "error" || appState.status === "loading") {
    const isLoading = appState.status === "loading";

    return (
      <main className="app-hero">
        {/* Brand header */}
        <div className="app-brand">
          <Activity className="app-brand-icon" aria-hidden="true" />
          <h1 className="app-brand-title">AgentFlow Trace Viewer</h1>
        </div>
        <p className="app-brand-subtitle">
          Browse previous runs from the agentflow service, or load a trace file directly.
        </p>

        {/* Error banner */}
        {appState.status === "error" && (
          <div
            role="alert"
            className="flex items-start gap-2.5 w-full max-w-2xl rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" aria-hidden="true" />
            <span>{appState.message}</span>
          </div>
        )}

        {/* Two-panel layout: runs list + file loader */}
        <div className="hero-panels">
          <div className="hero-panel-section">
            <p className="hero-panel-heading">From agentflow service</p>
            <RunSelector onSelectRun={handleRunLoad} isLoading={isLoading} />
          </div>

          <div className="hero-panel-section">
            <p className="hero-panel-heading">From file</p>
            <FileLoader onLoad={handleLoad} isLoading={isLoading} />
          </div>
        </div>
      </main>
    );
  }

  // ── Render: loaded ────────────────────────────────────────────────────────

  const { trace, source } = appState;
  const sourceLabel = source.type === "file" ? source.fileName : `run_${source.runId.slice(0, 8)}…`;

  return (
    <div className="app-shell">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="app-topbar">
        <div className="app-topbar-brand">
          <Activity className="app-topbar-icon" aria-hidden="true" />
          <span className="app-topbar-title">AgentFlow Trace Viewer</span>
        </div>

        <div className="app-topbar-file">
          {source.type === "file" ? (
            <FileJson2 className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
          ) : (
            <Server className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
          )}
          <span
            className="app-topbar-filename"
            title={source.type === "file" ? source.fileName : source.runId}
          >
            {sourceLabel}
          </span>
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
          aria-label="Close trace and load another"
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
        <div className="app-main-split">
          <div className="timeline-container">
            <TimelineView
              events={filteredEvents}
              startMs={trace.timeRange.startMs}
              selectedEvent={selectedEvent}
              onSelectEvent={setSelectedEvent}
            />
          </div>

          {selectedEvent && (
            <EventDetail
              event={selectedEvent}
              onClose={() => setSelectedEvent(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
