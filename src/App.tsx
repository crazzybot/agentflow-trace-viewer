import React from "react";
import {
  Activity,
  DollarSign,
  FileJson2,
  PlusCircle,
  RotateCcw,
  Server,
  Target,
  AlertCircle,
  X as XIcon,
} from "lucide-react";
import type { EventTypeValue, RunTrace, TraceEvent } from "./types/events";
import type { RunInfo } from "./types/runs";
import { loadTrace, parseTraceEvent, parseTraceJson, extractEventTypes, extractTimeRange, sortEvents, eventKey } from "./utils/loadTrace";
import { traceFromSession, sessionStatus } from "./utils/sessionTrace";
import {
  fetchRunEventsText,
  fetchRunResultsText,
  fetchRunReport,
  fetchRuns,
  openRunStream,
  createRun,
  createFollowupRun,
  fetchRunSession,
  resumeRun,
} from "./api/agentflow";
import { computeResultsCost, computeEventsCost } from "./utils/cost";
import { ArtifactsViewer } from "./components/ArtifactsViewer";
import { FileLoader } from "./components/FileLoader";
import { RunSelector } from "./components/RunSelector";
import { NewRunForm } from "./components/NewRunForm";
import { FollowupForm } from "./components/FollowupForm";
import { FilterBar } from "./components/FilterBar";
import { TimelineView } from "./components/TimelineView";
import { EventDetail } from "./components/EventDetail";
import { ReportViewer } from "./components/ReportViewer";
import { HumanInputPanel } from "./components/HumanInputPanel";
import type { AwaitingInputData } from "./components/HumanInputPanel";
import { StreamingControlBar } from "./components/StreamingControlBar";
import { CheckpointsViewer } from "./components/CheckpointsViewer";
import { CampaignsPage } from "./components/CampaignsPage";
import "./App.css";

// ---------------------------------------------------------------------------
// Hash Router
// ---------------------------------------------------------------------------

/**
 * Parsed representation of the current URL hash route.
 *
 *  Hash string        → Route
 *  ─────────────────────────────────────────────────────
 *  ''  |  '#/'        → { page: 'idle' }
 *  '#/runs/new'       → { page: 'new-run' }
 *  '#/runs/:id'       → { page: 'run', runId: id }
 *  '#/runs/:id/followup' → { page: 'followup', runId: id }
 */
export type Route =
  | { page: "idle" }
  | { page: "new-run" }
  | { page: "run"; runId: string }
  | { page: "followup"; runId: string }
  | { page: "campaigns" }
  | { page: "new-campaign" }
  | { page: "campaign"; campaignId: string };

function parseHash(hash: string): Route {
  // Strip leading '#' if present, then normalise the path.
  const path = hash.startsWith("#") ? hash.slice(1) : hash;

  if (!path || path === "/") return { page: "idle" };

  const runsNewRe = /^\/runs\/new\/?$/;
  if (runsNewRe.test(path)) return { page: "new-run" };

  if (/^\/campaigns\/?$/.test(path)) return { page: "campaigns" };
  if (/^\/campaigns\/new\/?$/.test(path)) return { page: "new-campaign" };
  const campaignMatch = /^\/campaigns\/([^/]+)\/?$/.exec(path);
  if (campaignMatch) {
    const campaignId = decodeURIComponent(campaignMatch[1] ?? "");
    return campaignId ? { page: "campaign", campaignId } : { page: "campaigns" };
  }

  const followupRe = /^\/runs\/([^/]+)\/followup\/?$/;
  const followupMatch = followupRe.exec(path);
  if (followupMatch) {
    const runId = decodeURIComponent(followupMatch[1] ?? "");
    return runId ? { page: "followup", runId } : { page: "idle" };
  }

  const runRe = /^\/runs\/([^/]+)\/?$/;
  const runMatch = runRe.exec(path);
  if (runMatch) {
    const runId = decodeURIComponent(runMatch[1] ?? "");
    return runId ? { page: "run", runId } : { page: "idle" };
  }

  return { page: "idle" };
}

function useHashRouter() {
  const [route, setRoute] = React.useState<Route>(() => parseHash(window.location.hash));

  React.useEffect(() => {
    function onHashChange() {
      setRoute(parseHash(window.location.hash));
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = React.useCallback((hash: string) => {
    window.location.hash = hash;
  }, []);

  return { route, navigate };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TraceSource =
  | { type: "file"; fileName: string }
  | {
      type: "api";
      runId: string;
      name?: string | null;
      task?: string | null;
      has_report?: boolean;
      has_artifacts?: boolean;
      has_session?: boolean;
      workspace?: string | null;
      /** Interrupted by a restart and resumable (from the session log). */
      resumable?: boolean;
    };

type AppState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "new-run"; submitError: string | null; isSubmitting: boolean }
  | { status: "followup"; priorRunId: string; priorName?: string | null; priorTask?: string | null; submitError: string | null; isSubmitting: boolean }
  | { status: "streaming"; runId: string; events: TraceEvent[]; task?: string | null; awaiting: AwaitingInputData | null }
  | { status: "loaded"; trace: RunTrace; source: TraceSource; view: "events" | "report" | "artifacts" | "checkpoints"; report: string | null; reportLoading: boolean; resumeError?: string | null; resuming?: boolean }
  | { status: "error"; message: string };

const TERMINAL_EVENT_TYPES = new Set(["run:complete", "run:error", "run:budget_exceeded", "run:cancelled"]);

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
  const sorted = sortEvents(events);
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
  const { route, navigate } = useHashRouter();

  const [appState, setAppState] = React.useState<AppState>({ status: "idle" });
  const [selectedTypes, setSelectedTypes] = React.useState<Set<EventTypeValue>>(new Set());
  const [selectedTimeRange, setSelectedTimeRange] = React.useState<[number, number]>([0, 0]);
  const [selectedEvent, setSelectedEvent] = React.useState<TraceEvent | null>(null);

  // Accumulates SSE events outside of React state so we can read the full
  // list synchronously inside the onmessage handler when a terminal event arrives.
  const streamingEventsRef = React.useRef<TraceEvent[]>([]);
  // Identities (eventKey) of events already in streamingEventsRef, to drop SSE
  // replays of events we already have. Not seq alone: workers number their own
  // events and a resumed run's new stream restarts at 1.
  const seenKeysRef = React.useRef<Set<string>>(new Set());
  // Incremented after HITL approval to force the SSE effect to reconnect.
  // The backend may close the SSE connection while waiting for human input;
  // bumping this causes the effect to open a fresh EventSource so events
  // that arrive after approval are captured. seenKeysRef deduplicates any replay.
  const [sseVersion, setSseVersion] = React.useState(0);

  // Track whether we triggered a load from the current route so we don't
  // re-trigger it after the resulting state change causes a re-render.
  const lastLoadedRouteRef = React.useRef<string>("");

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
        // File loads don't get a URL — stay on '/' (idle hash) but show the
        // loaded view. The hash is not updated so the browser back button still
        // works naturally (it just stays on '/' and handleReset resets state).
      } catch (err) {
        setAppState({ status: "error", message: err instanceof Error ? err.message : String(err) });
      }
    }, 0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── API run load (historical or re-join live stream) ─────────────────────

  const handleRunLoad = React.useCallback(async (run: RunInfo) => {
    // Mark this runId as handled so the route-sync effect doesn't re-trigger.
    lastLoadedRouteRef.current = `run:${run.run_id}`;

    setAppState({ status: "loading" });
    setSelectedEvent(null);

    if (run.is_streaming) {
      // Fetch events recorded so far, then hand off to the SSE effect.
      let existingEvents: TraceEvent[] = [];
      let existingEventsText: string | undefined;
      if (run.has_events) {
        try {
          existingEventsText = await fetchRunEventsText(run.run_id);
          existingEvents = parseTraceJson(existingEventsText);
        } catch { /* start fresh if historical fetch fails */ }
      }

      // If historical events already contain a terminal event the run has
      // finished, even though the run-list still shows is_streaming=true
      // (race between the emitter cleanup and the list refresh). Skip SSE and
      // go directly to loaded so we don't open a stream that immediately 404s.
      if (existingEvents.some((e) => TERMINAL_EVENT_TYPES.has(e.type))) {
        let resultsText: string | undefined;
        if (run.has_results) {
          try { resultsText = await fetchRunResultsText(run.run_id); } catch { /* optional */ }
        }
        enterLoaded(loadTrace(existingEventsText!, resultsText), {
          type: "api",
          runId: run.run_id,
          name: run.name,
          task: run.task,
          has_report: run.has_report,
          has_artifacts: run.has_artifacts,
        });
        // Already at '#/runs/:id' (either user clicked or URL triggered this)
        navigate(`#/runs/${encodeURIComponent(run.run_id)}`);
        return;
      }

      // Recover awaiting-input state when re-joining a paused run.
      let initialAwaiting: AwaitingInputData | null = null;
      if (run.is_awaiting_input) {
        const ev = [...existingEvents].reverse().find((e) => e.type === "run:awaiting_input");
        if (ev) {
          const d = ev.payload.data as Record<string, unknown> | null ?? {};
          initialAwaiting = {
            message: ev.payload.message,
            requestType: typeof d["request_type"] === "string" ? d["request_type"] : "run_budget_exhausted",
            context: typeof d["context"] === "object" && d["context"] !== null
              ? d["context"] as Record<string, unknown>
              : {},
          };
        }
      }

      streamingEventsRef.current = existingEvents;
      seenKeysRef.current = new Set(existingEvents.map(eventKey));
      setAppState({ status: "streaming", runId: run.run_id, events: existingEvents, task: run.task, awaiting: initialAwaiting });
      navigate(`#/runs/${encodeURIComponent(run.run_id)}`);
      return;
    }

    try {
      // The session log exists for every run; events.jsonl only with CAPTURE_EVENTS.
      // Prefer the captured SSE events when present (exactly what clients saw), and
      // fall back to rebuilding the trace from the session log.
      const session = run.has_session ? await fetchRunSession(run.run_id).catch(() => null) : null;
      let trace: RunTrace;
      if (run.has_events) {
        const eventsText = await fetchRunEventsText(run.run_id);
        let resultsText: string | undefined;
        if (run.has_results) {
          try { resultsText = await fetchRunResultsText(run.run_id); } catch { /* optional */ }
        }
        trace = { ...loadTrace(eventsText, resultsText), origin: "events" };
        if (session) {
          const fromSession = traceFromSession(run.run_id, session);
          trace.totalCostUsd = fromSession.totalCostUsd;
          if (trace.results.length === 0) trace.results = fromSession.results;
        }
      } else if (session) {
        trace = traceFromSession(run.run_id, session);
      } else {
        throw new Error(
          "This run has neither captured events nor a session log. " +
            "It predates session logs and the server did not run with CAPTURE_EVENTS.",
        );
      }
      enterLoaded(trace, {
        type: "api",
        runId: run.run_id,
        name: run.name,
        task: run.task,
        has_report: run.has_report,
        has_artifacts: run.has_artifacts,
        has_session: run.has_session,
        workspace: run.workspace,
        resumable: session ? sessionStatus(session) === "interrupted" : false,
      });
      navigate(`#/runs/${encodeURIComponent(run.run_id)}`);
    } catch (err) {
      setAppState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load run by ID (for direct URL navigation / page refresh) ────────────

  /**
   * Fetches the run list, finds the run by ID, and calls handleRunLoad.
   * Used when the user arrives directly at `#/runs/:id` without having
   * selected the run through the UI (e.g. page refresh, back button, shared link).
   */
  const loadRunById = React.useCallback(async (runId: string) => {
    setAppState({ status: "loading" });
    setSelectedEvent(null);
    try {
      const runs = await fetchRuns();
      const run = runs.find((r) => r.run_id === runId);
      if (!run) {
        setAppState({ status: "error", message: `Run "${runId}" not found.` });
        navigate("#/");
        return;
      }
      await handleRunLoad(run);
    } catch (err) {
      setAppState({ status: "error", message: err instanceof Error ? err.message : String(err) });
      navigate("#/");
    }
  }, [handleRunLoad, navigate]);

  // ── New run form ──────────────────────────────────────────────────────────

  function handleNewRunOpen() {
    navigate("#/runs/new");
    setAppState({ status: "new-run", submitError: null, isSubmitting: false });
  }

  async function handleNewRunSubmit(task: string, budgetUsd: number | undefined, workspace?: string) {
    setAppState({ status: "new-run", submitError: null, isSubmitting: true });
    try {
      const { run_id } = await createRun({ task, budget_usd: budgetUsd, ...(workspace ? { workspace } : {}) });
      streamingEventsRef.current = [];
      seenKeysRef.current = new Set();
      setSelectedEvent(null);
      // Mark handled before state + navigation so the route-sync effect is a no-op.
      lastLoadedRouteRef.current = `run:${run_id}`;
      navigate(`#/runs/${encodeURIComponent(run_id)}`);
      setAppState({ status: "streaming", runId: run_id, events: [], task, awaiting: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAppState({ status: "new-run", submitError: msg, isSubmitting: false });
    }
  }

  // ── Follow-up run ─────────────────────────────────────────────────────────

  function handleFollowupOpen() {
    if (appState.status !== "loaded" || appState.source.type !== "api") return;
    const { source } = appState;
    navigate(`#/runs/${encodeURIComponent(source.runId)}/followup`);
    setAppState({
      status: "followup",
      priorRunId: source.runId,
      priorName: source.name,
      priorTask: source.task,
      submitError: null,
      isSubmitting: false,
    });
  }

  async function handleFollowupSubmit(task: string, budgetUsd: number | undefined, workspace?: string) {
    if (appState.status !== "followup") return;
    const { priorRunId } = appState;
    setAppState((prev) => prev.status === "followup" ? { ...prev, isSubmitting: true, submitError: null } : prev);
    try {
      const { run_id } = await createFollowupRun(priorRunId, task, budgetUsd, workspace);
      streamingEventsRef.current = [];
      seenKeysRef.current = new Set();
      setSelectedEvent(null);
      // Mark handled before navigation so the route-sync effect is a no-op.
      lastLoadedRouteRef.current = `run:${run_id}`;
      navigate(`#/runs/${encodeURIComponent(run_id)}`);
      setAppState({ status: "streaming", runId: run_id, events: [], task, awaiting: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAppState((prev) => prev.status === "followup" ? { ...prev, isSubmitting: false, submitError: msg } : prev);
    }
  }

  // ── SSE streaming ─────────────────────────────────────────────────────────

  const activeRunId = appState.status === "streaming" ? appState.runId : null;

  React.useEffect(() => {
    if (!activeRunId) return;

    // streamingEventsRef and seenKeysRef are pre-populated by callers before
    // entering streaming state (handleRunLoad for resume, handleNewRunSubmit for new).
    // sseVersion is bumped after HITL approval to force reconnection when the
    // backend closes the SSE connection while waiting for human input.
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
      const key = eventKey(event);
      if (seenKeysRef.current.has(key)) return;
      seenKeysRef.current.add(key);

      // Accumulate in the ref so the full list is readable synchronously.
      streamingEventsRef.current = [...streamingEventsRef.current, event];
      const snapshot = streamingEventsRef.current;
      const isTerminal = TERMINAL_EVENT_TYPES.has(event.type);

      if (isTerminal) {
        // Build the complete trace and transition to "loaded", initialising
        // filter state in the same batch as the app-state update.
        const trace: RunTrace = { ...buildTrace(activeRunId, snapshot), origin: "stream" };
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
        // The run URL stays at #/runs/:id — no navigation needed; streaming and
        // loaded both live there.
        terminated = true;
        es.close();
      } else {
        setAppState((prev) => {
          if (prev.status !== "streaming") return prev;
          const next: typeof prev = { ...prev, events: snapshot };
          if (event.type === "run:awaiting_input") {
            const d = event.payload.data as Record<string, unknown> | null ?? {};
            next.awaiting = {
              message: event.payload.message,
              requestType: typeof d["request_type"] === "string" ? d["request_type"] : "run_budget_exhausted",
              context: typeof d["context"] === "object" && d["context"] !== null
                ? d["context"] as Record<string, unknown>
                : {},
            };
          }
          return next;
        });
      }
    };

    es.onerror = () => {
      if (!terminated) {
        const snapshot = streamingEventsRef.current;
        if (snapshot.some((e) => TERMINAL_EVENT_TYPES.has(e.type))) {
          // Terminal event was already received (e.g. historical preload or
          // arrived via SSE before the connection dropped). Recover gracefully.
          const trace: RunTrace = { ...buildTrace(activeRunId, snapshot), origin: "stream" };
          setSelectedTypes(new Set(trace.eventTypes));
          setSelectedTimeRange([0, trace.timeRange.durationMs]);
          setAppState((prev) => {
            const taskHint = prev.status === "streaming" ? prev.task : undefined;
            return {
              status: "loaded",
              trace,
              source: { type: "api", runId: activeRunId, task: taskHint },
              view: "events" as const,
              report: null,
              reportLoading: false,
            };
          });
        } else {
          setAppState((prev) =>
            prev.status === "streaming"
              ? { status: "error", message: "SSE stream disconnected unexpectedly." }
              : prev,
          );
        }
      }
      es.close();
    };

    return () => {
      es.close();
    };
  }, [activeRunId, sseVersion]);

  // ── Reset ─────────────────────────────────────────────────────────────────

  function handleReset() {
    navigate("#/");
    setAppState({ status: "idle" });
    setSelectedEvent(null);
    setSelectedTypes(new Set());
    setSelectedTimeRange([0, 0]);
  }

  // ── Route → state synchronisation (back button / direct URL) ─────────────
  //
  // When the hash changes externally (browser back/forward, or initial page
  // load with a non-idle hash), we reconcile the appState to match the route.
  //
  // The `lastLoadedRouteRef` guard prevents the effect from re-triggering
  // loads that were already initiated by user interactions (which update both
  // the hash AND the state in the same action).

  React.useEffect(() => {
    const { page } = route;

    // ── campaign pages render on their own (see CampaignsPage) ────────────
    if (page === "campaigns" || page === "new-campaign" || page === "campaign") {
      lastLoadedRouteRef.current = "";
      return;
    }

    // ── idle route ────────────────────────────────────────────────────────
    if (page === "idle") {
      // If we currently have an active run/stream, reset to idle.
      if (
        appState.status === "loaded" ||
        appState.status === "streaming" ||
        appState.status === "new-run" ||
        appState.status === "followup"
      ) {
        setAppState({ status: "idle" });
        setSelectedEvent(null);
        setSelectedTypes(new Set());
        setSelectedTimeRange([0, 0]);
        lastLoadedRouteRef.current = "";
      }
      return;
    }

    // ── new-run route ─────────────────────────────────────────────────────
    if (page === "new-run") {
      if (appState.status !== "new-run") {
        setAppState({ status: "new-run", submitError: null, isSubmitting: false });
        lastLoadedRouteRef.current = "";
      }
      return;
    }

    // ── run or followup route ─────────────────────────────────────────────
    const runId = route.runId;
    const routeKey = `run:${runId}`;

    if (page === "followup") {
      // If we're already in followup for this run, or in loaded state for this
      // run (user navigated back to followup hash), sync state.
      if (appState.status === "followup" && appState.priorRunId === runId) return;

      // If loaded for this run: open the followup form state.
      if (appState.status === "loaded" && appState.source.type === "api" && appState.source.runId === runId) {
        const { source } = appState;
        setAppState({
          status: "followup",
          priorRunId: source.runId,
          priorName: source.name,
          priorTask: source.task,
          submitError: null,
          isSubmitting: false,
        });
        lastLoadedRouteRef.current = routeKey;
        return;
      }

      // Cold load: fetch the run so we have its metadata for the followup form,
      // then open the followup form. We load the run first (goes to loaded), then
      // the followup form will be opened after — handled via a second effect trigger
      // when the loaded state arrives and the hash is still on /followup.
      if (lastLoadedRouteRef.current !== routeKey) {
        lastLoadedRouteRef.current = routeKey;
        void loadRunById(runId);
      }
      return;
    }

    // page === "run"
    if (lastLoadedRouteRef.current === routeKey) {
      // Already loading/loaded this run — don't trigger again.
      return;
    }

    // Only load from URL if we're not already displaying this run.
    const alreadyDisplayed =
      (appState.status === "loaded" && appState.source.type === "api" && appState.source.runId === runId) ||
      (appState.status === "streaming" && appState.runId === runId);

    if (!alreadyDisplayed) {
      lastLoadedRouteRef.current = routeKey;
      void loadRunById(runId);
    }

  }, [route]); // eslint-disable-line react-hooks/exhaustive-deps
  // ↑ Intentionally only re-runs when `route` changes (i.e. hash changed).
  //   Reading appState here is safe because it's just for guard checks;
  //   we never want this to re-run just because appState changed.

  // ── After a cold-load triggered by a /followup hash, open the followup form
  //
  // When loadRunById resolves and sets status="loaded" while the hash is still
  // at '#/runs/:id/followup', we need to transition to the followup form.
  React.useEffect(() => {
    if (
      route.page === "followup" &&
      appState.status === "loaded" &&
      appState.source.type === "api" &&
      appState.source.runId === route.runId
    ) {
      const { source } = appState;
      setAppState({
        status: "followup",
        priorRunId: source.runId,
        priorName: source.name,
        priorTask: source.task,
        submitError: null,
        isSubmitting: false,
      });
    }
  }, [appState, route]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const filteredEvents = React.useMemo<TraceEvent[]>(() => {
    if (appState.status !== "loaded") return [];
    return applyFilters(appState.trace, selectedTypes, selectedTimeRange);
  }, [appState, selectedTypes, selectedTimeRange]);

  // ===========================================================================
  // Render: campaigns (independent of the run state machine)
  // ===========================================================================

  if (route.page === "campaigns" || route.page === "new-campaign" || route.page === "campaign") {
    return <CampaignsPage route={route} navigate={navigate} />;
  }

  // ===========================================================================
  // Render: idle / loading / error  →  hero with RunSelector + FileLoader
  // ===========================================================================

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
            <div className="hero-panel-heading-row">
              <p className="hero-panel-heading">From agentflow service</p>
              <button type="button" className="hero-campaigns-link" onClick={() => navigate("#/campaigns")}>
                <Target className="w-3.5 h-3.5" aria-hidden="true" />
                Campaigns
              </button>
            </div>
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

  // ===========================================================================
  // Render: new-run  →  hero with form
  // ===========================================================================

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

  // ===========================================================================
  // Render: followup  →  hero with follow-up form
  // ===========================================================================

  if (appState.status === "followup") {
    return (
      <main className="app-hero">
        <div className="app-brand">
          <Activity className="app-brand-icon" aria-hidden="true" />
          <h1 className="app-brand-title">AgentFlow Trace Viewer</h1>
        </div>
        <FollowupForm
          priorRunId={appState.priorRunId}
          priorName={appState.priorName}
          priorTask={appState.priorTask}
          onSubmit={handleFollowupSubmit}
          onCancel={handleReset}
          isSubmitting={appState.isSubmitting}
          submitError={appState.submitError}
        />
      </main>
    );
  }

  // ===========================================================================
  // Render: streaming  →  live shell (no filter bar)
  // ===========================================================================

  if (appState.status === "streaming") {
    const { runId, events, task, awaiting } = appState;
    const startMs = events[0]?.ts ?? 0;
    const streamCostUsd = computeEventsCost(events);

    return (
      <div className="app-shell">
        <header className="app-topbar">
          <div className="app-topbar-brand">
            <Activity className="app-topbar-icon" aria-hidden="true" />
            <span className="app-topbar-title">AgentFlow Trace Viewer</span>
          </div>

          <div className="app-topbar-file">
            {awaiting ? (
              <span className="stream-awaiting-badge" aria-label="Awaiting user input">
                <span className="stream-awaiting-dot" aria-hidden="true" />
                PAUSED
              </span>
            ) : (
              <span className="stream-live-badge" aria-label="Live stream active">
                <span className="stream-live-dot" aria-hidden="true" />
                LIVE
              </span>
            )}
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
            {streamCostUsd > 0 && (
              <span
                className="app-topbar-cost"
                title="Total USD spent on this run"
                aria-label={`Cost: $${streamCostUsd.toFixed(4)}`}
              >
                <DollarSign className="w-3 h-3" aria-hidden="true" />
                {streamCostUsd.toFixed(4)}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="app-topbar-reload"
            aria-label="Close stream"
          >
            <XIcon className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </header>

        {/* Status bar / human-input panel replaces the filter bar during streaming */}
        <div className="app-filterbar-wrapper">
          {awaiting ? (
            <HumanInputPanel
              runId={runId}
              awaiting={awaiting}
              onDone={() => {
                setAppState((prev) =>
                  prev.status === "streaming" ? { ...prev, awaiting: null } : prev
                );
                setSseVersion((v) => v + 1);
              }}
            />
          ) : (
            <StreamingControlBar runId={runId} />
          )}
        </div>

        <div className="app-content">
          <div className="app-main-split">
            <div className="timeline-container">
              <TimelineView
                events={events}
                allEvents={events}
                startMs={startMs}
                selectedEvent={selectedEvent}
                onSelectEvent={setSelectedEvent}
                emptyMessage="Waiting for first event…"
                scrollToEnd
              />
            </div>
            {selectedEvent && (
              <EventDetail event={selectedEvent} allEvents={events} onClose={() => setSelectedEvent(null)} />
            )}
          </div>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // Render: loaded  →  full shell with filter bar / report view
  // ===========================================================================

  const { trace, source, view, report, reportLoading } = appState;
  const sourceLabel =
    source.type === "file"
      ? source.fileName
      : (source.name ?? `run_${source.runId.slice(0, 8)}…`);

  const hasReport = source.type === "api" && !!source.has_report;
  const hasArtifacts = source.type === "api" && !!source.has_artifacts;
  const hasCheckpoints = source.type === "api" && !!source.has_session;
  const showTabs = hasReport || hasArtifacts || hasCheckpoints;

  // Total cost: the session log's cost_added sum is exact (it includes retries,
  // verification and repairs); otherwise result records, then event payloads.
  const totalCostUsd =
    trace.totalCostUsd !== undefined
      ? trace.totalCostUsd
      : trace.results.length > 0
        ? computeResultsCost(trace.results)
        : computeEventsCost(trace.events);

  async function handleResume() {
    if (source.type !== "api") return;
    const runId = source.runId;
    setAppState((prev) => prev.status === "loaded" ? { ...prev, resuming: true, resumeError: null } : prev);
    try {
      await resumeRun(runId);
      // Keep what is already on screen; the resumed run's stream starts fresh and
      // is merged in (eventKey de-duplicates any replay).
      streamingEventsRef.current = trace.events;
      seenKeysRef.current = new Set(trace.events.map(eventKey));
      setSelectedEvent(null);
      setAppState({ status: "streaming", runId, events: trace.events, task: source.task, awaiting: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAppState((prev) => prev.status === "loaded" ? { ...prev, resuming: false, resumeError: msg } : prev);
    }
  }

  async function handleSwitchView(next: "events" | "report" | "artifacts" | "checkpoints") {
    if (next === "report" && source.type === "api" && !report) {
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
            title={trace.run_id}
          >
            {sourceLabel}
          </span>
          <span className="app-topbar-eventcount">
            {trace.events.length} event{trace.events.length !== 1 ? "s" : ""}
          </span>
          {trace.origin === "session" && (
            <span className="app-topbar-origin" title="Rebuilt from the run's durable session log (the server did not capture SSE events for this run)">
              from session log
            </span>
          )}
          {source.type === "api" && source.workspace && (
            <span className="app-topbar-workspace" title="Workspace this run worked in">
              {source.workspace}
            </span>
          )}
          {totalCostUsd > 0 && (
            <span
              className="app-topbar-cost"
              title="Total USD spent on this run"
              aria-label={`Cost: $${totalCostUsd.toFixed(4)}`}
            >
              <DollarSign className="w-3 h-3" aria-hidden="true" />
              {totalCostUsd.toFixed(4)}
            </span>
          )}
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
            {hasCheckpoints && (
              <button
                role="tab"
                aria-selected={view === "checkpoints"}
                type="button"
                className={`app-topbar-tab ${view === "checkpoints" ? "app-topbar-tab--active" : ""}`}
                onClick={() => handleSwitchView("checkpoints")}
              >
                Checkpoints
              </button>
            )}
          </div>
        )}

        {source.type === "api" && source.resumable && (
          <button
            type="button"
            onClick={handleResume}
            disabled={appState.resuming}
            className="app-topbar-resume-btn"
            title={appState.resumeError ?? "This run was interrupted by a restart. Resume it from where it stopped."}
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            {appState.resuming ? "Resuming…" : appState.resumeError ? "Resume failed" : "Resume"}
          </button>
        )}

        {source.type === "api" && (
          <button
            type="button"
            onClick={handleFollowupOpen}
            className="app-topbar-followup-btn"
            aria-label="Start follow-up run"
          >
            <PlusCircle className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}

        <button
          type="button"
          onClick={handleReset}
          className="app-topbar-reload"
          aria-label="Close trace and load another"
        >
          <XIcon className="w-3.5 h-3.5" aria-hidden="true" />
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
                allEvents={trace.events}
                startMs={trace.timeRange.startMs}
                selectedEvent={selectedEvent}
                onSelectEvent={setSelectedEvent}
              />
            </div>
            {selectedEvent && (
              <EventDetail event={selectedEvent} allEvents={trace.events} onClose={() => setSelectedEvent(null)} />
            )}
          </div>
        )}
        {view === "report" && (
          <ReportViewer markdown={report} isLoading={reportLoading} />
        )}
        {view === "artifacts" && source.type === "api" && (
          <ArtifactsViewer runId={source.runId} />
        )}
        {view === "checkpoints" && source.type === "api" && (
          <CheckpointsViewer runId={source.runId} workspace={source.workspace ?? null} />
        )}
      </div>
    </div>
  );
}
