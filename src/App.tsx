import React from "react";
import {
  Activity,
  FileJson2,
  Server,
  AlertCircle,
  X as XIcon,
  Loader2,
} from "lucide-react";
import type { EventTypeValue, RunTrace, TraceEvent } from "./types/events";
import type { RunInfo } from "./types/runs";
import { loadTrace, parseTraceEvent, parseTraceJson, extractEventTypes, extractTimeRange } from "./utils/loadTrace";
import { createRun, openRunStream, fetchRunEventsText, fetchRunResultsText, fetchRunReport } from "./api/agentflow";
import { ArtifactsViewer } from "./components/ArtifactsViewer";
import { FileLoader } from "./components/FileLoader";
import { RunSelector } from "./components/RunSelector";
import { NewRunForm } from "./components/NewRunForm";
import { FilterBar } from "./components/FilterBar";
import { TimelineView } from "./components/TimelineView";
import { EventDetail } from "./components/EventDetail";
import { ReportViewer } from "./components/ReportViewer";
import "./App.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TraceSource =
  | { type: "file"; fileName: string }
  | { type: "api"; runId: string; name?: string | null; task?: string | null; has_report?: boolean; has_artifacts?: boolean };

type AppState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "new-run"; submitError: string | null; isSubmitting: boolean }
  | { status: "streaming"; runId: string; events: TraceEvent[]; task?: string | null }
  | { status: "loaded"; trace: RunTrace; source: TraceSource; view: "events" | "report" | "artifacts"; report: string | null; reportLoading: boolean }
  | { status: "error"; message: string };

const TERMINAL_EVENT_TYPES = new Set(["run:complete", "run:error", "run:budget_exceeded"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applyFilters(
  trace: RunTrace,
  selectedTypes: Set<EventTypeValue>,
  timeRange: [number, number],
): TraceEvent[] {
  const [startOffset, endOffset] = timeRange;
  const absStart = trace.timeRange.startMs + startOffset;
  const absEnd = trace.timeRange.startMs + endOffset;
  return trace.events.filter(
    (e) => selectedTypes.has(e.type) && e.ts >= absStart && e.ts <= absEnd,
  );
}

function buildTrace(runId: string, events: TraceEvent[]): RunTrace {
  if (events.length === 0) {
    return {
      run_id: runId,
      events: [],
      eventTypes: new Set(),
      timeRange: { startMs: 0, endMs: 0, durationMs: 0 },
      results: [],
    };
  }
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  return {
    run_id: runId,
    events: sorted,
    eventTypes: extractEventTypes(sorted),
    timeRange: extractTimeRange(sorted),
    results: [],
  };
}

// ---------------------------------------------------------------------------
// App component
// ---------------------------------------------------------------------------

export default function App() {
  const [appState, setAppState] = React.useState<AppState>({ status: "idle" });
  const [selectedTypes, setSelectedTypes] = React.useState<Set<EventTypeValue>>(new Set());
  const [selectedTimeRange, setSelectedTimeRange] = React.useState<[number, number]>([0, 0]);
  const [selectedEvent, setSelectedEvent] = React.useState<TraceEvent | null>(null);

  // Accumulates SSE events outside of React state so we can read the full
  // list synchronously inside the onmessage handler when a terminal event arrives.
  const streamingEventsRef = React.useRef<TraceEvent[]>([]);
  // Tracks seq numbers already in streamingEventsRef to deduplicate SSE events
  // when re-joining a stream that replays events we already fetched.
  const seenSeqsRef = React.useRef<Set<number>>(new Set());

  // ── Enter loaded state (sets filters + trace atomically) ─────────────────

  function enterLoaded(trace: RunTrace, source: TraceSource) {
    setSelectedTypes(new Set(trace.eventTypes));
    setSelectedTimeRange([0, trace.timeRange.durationMs]);
    setAppState({ status: "loaded", trace, source, view: "events", report: null, reportLoading: false });
  }

  // ── File load ─────────────────────────────────────────────────────────────

  const handleLoad = React.useCallback((text: string, fileName: string) => {
    if (text.startsWith("FETCH_ERROR:")) {
      setAppState({ status: "error", message: text.slice("FETCH_ERROR:".length) });
      return;
    }
    setAppState({ status: "loading" });
    setSelectedEvent(null);
    setTimeout(() => {
      try {
        enterLoaded(loadTrace(text), { type: "file", fileName });
      } catch (err) {
        setAppState({ status: "error", message: err instanceof Error ? err.message : String(err) });
      }
    }, 0);
  }, []);

  // ── API run load (historical or re-join live stream) ─────────────────────

  const handleRunLoad = React.useCallback(async (run: RunInfo) => {
    setAppState({ status: "loading" });
    setSelectedEvent(null);

    if (run.is_streaming) {
      // Fetch events recorded so far, then hand off to the SSE effect.
      let existingEvents: TraceEvent[] = [];
      if (run.has_events) {
        try {
          existingEvents = parseTraceJson(await fetchRunEventsText(run.run_id));
        } catch { /* start fresh if historical fetch fails */ }
      }
      streamingEventsRef.current = existingEvents;
      seenSeqsRef.current = new Set(existingEvents.map((e) => e.seq));
      setAppState({ status: "streaming", runId: run.run_id, events: existingEvents, task: run.task });
      return;
    }

    try {
      const eventsText = await fetchRunEventsText(run.run_id);
      let resultsText: string | undefined;
      if (run.has_results) {
        try { resultsText = await fetchRunResultsText(run.run_id); } catch { /* optional */ }
      }
      enterLoaded(loadTrace(eventsText, resultsText), {
        type: "api",
        runId: run.run_id,
        name: run.name,
        task: run.task,
        has_report: run.has_report,
        has_artifacts: run.has_artifacts,
      });
    } catch (err) {
      setAppState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  // ── New run form ──────────────────────────────────────────────────────────

  function handleNewRunOpen() {
    setAppState({ status: "new-run", submitError: null, isSubmitting: false });
  }

  async function handleNewRunSubmit(task: string, budgetUsd: number | undefined) {
    setAppState({ status: "new-run", submitError: null, isSubmitting: true });
    try {
      const { run_id } = await createRun({ task, budget_usd: budgetUsd });
      streamingEventsRef.current = [];
      seenSeqsRef.current = new Set();
      setSelectedEvent(null);
      setAppState({ status: "streaming", runId: run_id, events: [], task });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAppState({ status: "new-run", submitError: msg, isSubmitting: false });
    }
  }

  // ── SSE streaming ─────────────────────────────────────────────────────────

  const activeRunId = appState.status === "streaming" ? appState.runId : null;

  React.useEffect(() => {
    if (!activeRunId) return;

    // streamingEventsRef and seenSeqsRef are pre-populated by callers before
    // entering streaming state (handleRunLoad for resume, handleNewRunSubmit for new).
    const es = openRunStream(activeRunId);
    let terminated = false;

    es.onmessage = (e: MessageEvent) => {
      let event: TraceEvent;
      try {
        event = parseTraceEvent(JSON.parse(e.data as string));
      } catch {
        return;
      }

      // Skip events already fetched from the historical endpoint (resume case).
      if (seenSeqsRef.current.has(event.seq)) return;
      seenSeqsRef.current.add(event.seq);

      // Accumulate in the ref so the full list is readable synchronously.
      streamingEventsRef.current = [...streamingEventsRef.current, event];
      const snapshot = streamingEventsRef.current;
      const isTerminal = TERMINAL_EVENT_TYPES.has(event.type);

      if (isTerminal) {
        // Build the complete trace and transition to "loaded", initialising
        // filter state in the same batch as the app-state update.
        const trace = buildTrace(activeRunId, snapshot);
        setSelectedTypes(new Set(trace.eventTypes));
        setSelectedTimeRange([0, trace.timeRange.durationMs]);
        setAppState((prev2) => {
          const taskHint = prev2.status === "streaming" ? prev2.task : undefined;
          return {
            status: "loaded",
            trace,
            source: { type: "api", runId: activeRunId, task: taskHint },
            view: "events" as const,
            report: null,
            reportLoading: false,
          };
        });
        terminated = true;
        es.close();
      } else {
        setAppState((prev) =>
          prev.status === "streaming" ? { ...prev, events: snapshot } : prev,
        );
      }
    };

    es.onerror = () => {
      if (!terminated) {
        setAppState((prev) =>
          prev.status === "streaming"
            ? { status: "error", message: "SSE stream disconnected unexpectedly." }
            : prev,
        );
      }
      es.close();
    };

    return () => {
      es.close();
    };
  }, [activeRunId]);

  // ── Reset ─────────────────────────────────────────────────────────────────

  function handleReset() {
    setAppState({ status: "idle" });
    setSelectedEvent(null);
    setSelectedTypes(new Set());
    setSelectedTimeRange([0, 0]);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const filteredEvents = React.useMemo<TraceEvent[]>(() => {
    if (appState.status !== "loaded") return [];
    return applyFilters(appState.trace, selectedTypes, selectedTimeRange);
  }, [appState, selectedTypes, selectedTimeRange]);

  // =========================================================================
  // Render: idle / loading / error  →  hero with RunSelector + FileLoader
  // =========================================================================

  if (appState.status === "idle" || appState.status === "error" || appState.status === "loading") {
    const isLoading = appState.status === "loading";
    return (
      <main className="app-hero">
        <div className="app-brand">
          <Activity className="app-brand-icon" aria-hidden="true" />
          <h1 className="app-brand-title">AgentFlow Trace Viewer</h1>
        </div>
        <p className="app-brand-subtitle">
          Browse previous runs from the agentflow service, or load a trace file directly.
        </p>

        {appState.status === "error" && (
          <div
            role="alert"
            className="flex items-start gap-2.5 w-full max-w-2xl rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" aria-hidden="true" />
            <span>{appState.message}</span>
          </div>
        )}

        <div className="hero-panels">
          <div className="hero-panel-section">
            <p className="hero-panel-heading">From agentflow service</p>
            <RunSelector
              onSelectRun={handleRunLoad}
              onNewRun={handleNewRunOpen}
              isLoading={isLoading}
            />
          </div>
          <div className="hero-panel-section">
            <p className="hero-panel-heading">From file</p>
            <FileLoader onLoad={handleLoad} isLoading={isLoading} />
          </div>
        </div>
      </main>
    );
  }

  // =========================================================================
  // Render: new-run  →  hero with form
  // =========================================================================

  if (appState.status === "new-run") {
    return (
      <main className="app-hero">
        <div className="app-brand">
          <Activity className="app-brand-icon" aria-hidden="true" />
          <h1 className="app-brand-title">AgentFlow Trace Viewer</h1>
        </div>
        <NewRunForm
          onSubmit={handleNewRunSubmit}
          onCancel={handleReset}
          isSubmitting={appState.isSubmitting}
          submitError={appState.submitError}
        />
      </main>
    );
  }

  // =========================================================================
  // Render: streaming  →  live shell (no filter bar)
  // =========================================================================

  if (appState.status === "streaming") {
    const { runId, events, task } = appState;
    const startMs = events[0]?.ts ?? 0;

    return (
      <div className="app-shell">
        <header className="app-topbar">
          <div className="app-topbar-brand">
            <Activity className="app-topbar-icon" aria-hidden="true" />
            <span className="app-topbar-title">AgentFlow Trace Viewer</span>
          </div>

          <div className="app-topbar-file">
            <span className="stream-live-badge" aria-label="Live stream active">
              <span className="stream-live-dot" aria-hidden="true" />
              LIVE
            </span>
            {task ? (
              <span className="app-topbar-filename" title={task}>
                {task.length > 60 ? task.slice(0, 60) + "…" : task}
              </span>
            ) : (
              <span className="app-topbar-runid" title={runId}>
                run&nbsp;{runId.slice(0, 8)}…
              </span>
            )}
            <span className="app-topbar-eventcount">
              {events.length} event{events.length !== 1 ? "s" : ""}
            </span>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="app-topbar-reload"
            aria-label="Close stream"
          >
            <XIcon className="w-3.5 h-3.5" aria-hidden="true" />
            Close
          </button>
        </header>

        {/* Status bar replaces the filter bar during live streaming */}
        <div className="app-filterbar-wrapper">
          <div className="stream-status-bar">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-500" aria-hidden="true" />
            <span className="stream-status-text">Streaming live events…</span>
          </div>
        </div>

        <div className="app-content">
          <div className="app-main-split">
            <div className="timeline-container">
              <TimelineView
                events={events}
                startMs={startMs}
                selectedEvent={selectedEvent}
                onSelectEvent={setSelectedEvent}
                emptyMessage="Waiting for first event…"
                scrollToEnd
              />
            </div>
            {selectedEvent && (
              <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // Render: loaded  →  full shell with filter bar / report view
  // =========================================================================

  const { trace, source, view, report, reportLoading } = appState;
  const sourceLabel =
    source.type === "file"
      ? source.fileName
      : (source.name ?? `run_${source.runId.slice(0, 8)}…`);

  const hasReport = source.type === "api" && !!source.has_report;
  const hasArtifacts = source.type === "api" && !!source.has_artifacts;
  const showTabs = hasReport || hasArtifacts;

  async function handleSwitchView(next: "events" | "report" | "artifacts") {
    if (next === view) return;
    if (next === "report" && report === null && source.type === "api") {
      setAppState((prev) =>
        prev.status === "loaded" ? { ...prev, view: "report", reportLoading: true } : prev,
      );
      try {
        const text = await fetchRunReport(source.runId);
        setAppState((prev) =>
          prev.status === "loaded" ? { ...prev, report: text, reportLoading: false } : prev,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setAppState((prev) =>
          prev.status === "loaded"
            ? { ...prev, report: `Error loading report: ${msg}`, reportLoading: false }
            : prev,
        );
      }
    } else {
      setAppState((prev) =>
        prev.status === "loaded" ? { ...prev, view: next } : prev,
      );
    }
  }

  return (
    <div className="app-shell">
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

        {/* View selector — shown when at least one extra tab is available */}
        {showTabs && (
          <div className="app-topbar-view-tabs" role="tablist" aria-label="Select view">
            <button
              role="tab"
              aria-selected={view === "events"}
              type="button"
              className={`app-topbar-tab ${view === "events" ? "app-topbar-tab--active" : ""}`}
              onClick={() => handleSwitchView("events")}
            >
              Events
            </button>
            {hasReport && (
              <button
                role="tab"
                aria-selected={view === "report"}
                type="button"
                className={`app-topbar-tab ${view === "report" ? "app-topbar-tab--active" : ""}`}
                onClick={() => handleSwitchView("report")}
              >
                Report
              </button>
            )}
            {hasArtifacts && (
              <button
                role="tab"
                aria-selected={view === "artifacts"}
                type="button"
                className={`app-topbar-tab ${view === "artifacts" ? "app-topbar-tab--active" : ""}`}
                onClick={() => handleSwitchView("artifacts")}
              >
                Artifacts
              </button>
            )}
          </div>
        )}

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

      {/* Filter bar — events view only */}
      {view === "events" && (
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
      )}

      <div className="app-content">
        {view === "events" && (
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
              <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
            )}
          </div>
        )}
        {view === "report" && (
          <ReportViewer markdown={report} isLoading={reportLoading} />
        )}
        {view === "artifacts" && source.type === "api" && (
          <ArtifactsViewer runId={source.runId} />
        )}
      </div>
    </div>
  );
}
