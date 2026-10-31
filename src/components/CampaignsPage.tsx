/**
 * Campaigns: long-horizon work built feature by feature across fresh-context
 * sessions (AgentFlow docs/guide/concepts.md#campaign). Each session is an
 * ordinary run, so session links open in the normal trace view.
 */
import React from "react";
import {
  Activity, AlertCircle, ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, CircleDashed,
  CircleSlash, DollarSign, ExternalLink, FolderGit2, Loader2, Pause, Play, PlusCircle,
  RefreshCw, RotateCcw, SlidersHorizontal, Target, XCircle, X,
} from "lucide-react";
import {
  createCampaign, fetchAgentIds, fetchCampaign, fetchCampaigns, pauseCampaign, resumeCampaign,
  retryCampaignFeature, updateCampaignLimits,
} from "../api/agentflow";
import type { CampaignLimitsUpdate, CampaignStatus, CampaignView, Feature, FeatureStatus } from "../types/campaigns";
import { workspaceNameError } from "../utils/workspace";
import { ThemeSwitch } from "./ThemeSwitch";

type CampaignRoute = { page: "campaigns" } | { page: "new-campaign" } | { page: "campaign"; campaignId: string };

const ACTIVE: ReadonlySet<CampaignStatus> = new Set(["defining", "running"]);
const POLL_MS = 4000;

const CAMPAIGN_BADGE: Record<CampaignStatus, string> = {
  defining: "cmp-badge cmp-badge--blue",
  running: "cmp-badge cmp-badge--indigo",
  paused: "cmp-badge cmp-badge--amber",
  completed: "cmp-badge cmp-badge--green",
  stopped: "cmp-badge cmp-badge--gray",
  failed: "cmp-badge cmp-badge--red",
};

const FEATURE_ICON: Record<FeatureStatus, React.ReactNode> = {
  passing: <CheckCircle2 className="w-4 h-4 text-gain" aria-hidden="true" />,
  failing: <XCircle className="w-4 h-4 text-loss" aria-hidden="true" />,
  blocked: <CircleSlash className="w-4 h-4 text-ink-subtle" aria-hidden="true" />,
  pending: <CircleDashed className="w-4 h-4 text-ink-subtle" aria-hidden="true" />,
};

function money(value: number | null | undefined): string {
  return value == null ? "—" : `$${value.toFixed(value < 1 ? 4 : 2)}`;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function Progress({ view }: { view: CampaignView }) {
  const pct = view.total ? Math.round((view.passing / view.total) * 100) : 0;
  return (
    <div className="cmp-progress" aria-label={`${view.passing} of ${view.total} features passing`}>
      <div className="cmp-progress-bar"><div className="cmp-progress-fill" style={{ width: `${pct}%` }} /></div>
      <span className="cmp-progress-label">{view.passing}/{view.total} passing</span>
    </div>
  );
}

function Shell({ navigate, children }: { navigate: (hash: string) => void; children: React.ReactNode }) {
  return (
    <main className="app-hero cmp-shell">
      <ThemeSwitch className="app-hero-theme" />
      <div className="app-brand">
        <Activity className="app-brand-icon" aria-hidden="true" />
        <h1 className="app-brand-title">AgentFlow Trace Viewer</h1>
      </div>
      <nav className="cmp-nav">
        <button type="button" className="cmp-link" onClick={() => navigate("#/")}>
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Runs
        </button>
        <button type="button" className="cmp-link" onClick={() => navigate("#/campaigns")}>
          <Target className="w-3.5 h-3.5" aria-hidden="true" /> Campaigns
        </button>
      </nav>
      {children}
    </main>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="cmp-error">
      <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function CampaignList({ navigate }: { navigate: (hash: string) => void }) {
  const [views, setViews] = React.useState<CampaignView[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    fetchCampaigns()
      .then((list) => { setViews(list); setError(null); })
      .catch((err) => setError(errorText(err)));
  }, []);
  React.useEffect(load, [load]);

  return (
    <section className="cmp-card">
      <header className="cmp-card-header">
        <h2 className="cmp-title">Campaigns</h2>
        <div className="cmp-actions">
          <button type="button" className="cmp-icon-btn" onClick={load} aria-label="Refresh">
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button type="button" className="cmp-btn cmp-btn--primary" onClick={() => navigate("#/campaigns/new")}>
            <PlusCircle className="w-4 h-4" aria-hidden="true" /> New campaign
          </button>
        </div>
      </header>
      <p className="cmp-help">
        A campaign builds something too big for one run: a fixed feature list is implemented one
        feature per fresh-context session, and a feature only passes when an independent verifier
        confirms it.
      </p>
      {error && <ErrorBox message={error} />}
      {!views && !error && <p className="cmp-muted"><Loader2 className="w-4 h-4 animate-spin inline" /> Loading…</p>}
      {views && views.length === 0 && <p className="cmp-muted">No campaigns yet.</p>}
      {views && views.length > 0 && (
        <ul className="cmp-list">
          {[...views].sort((a, b) => b.campaign.created_at.localeCompare(a.campaign.created_at)).map((v) => (
            <li key={v.campaign.campaign_id}>
              <button type="button" className="cmp-row" onClick={() => navigate(`#/campaigns/${encodeURIComponent(v.campaign.campaign_id)}`)}>
                <span className={CAMPAIGN_BADGE[v.campaign.status]}>{v.campaign.status}</span>
                <span className="cmp-row-task" title={v.campaign.task}>{v.campaign.task}</span>
                <Progress view={v} />
                <span className="cmp-row-meta">
                  {v.campaign.sessions.length}/{v.campaign.max_sessions} sessions · {money(v.campaign.spent_usd)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// New
// ---------------------------------------------------------------------------

function NewCampaign({ navigate }: { navigate: (hash: string) => void }) {
  const [task, setTask] = React.useState("");
  const [agents, setAgents] = React.useState<string[]>([]);
  const [agentId, setAgentId] = React.useState("CodeAgent");
  const [maxSessions, setMaxSessions] = React.useState("10");
  const [budget, setBudget] = React.useState("");
  const [sessionBudget, setSessionBudget] = React.useState("");
  const [workspace, setWorkspace] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const workspaceError = workspaceNameError(workspace);

  React.useEffect(() => {
    fetchAgentIds().then((ids) => {
      setAgents(ids);
      if (ids.length && !ids.includes("CodeAgent")) setAgentId(ids[0]);
    }).catch(() => { /* fall back to free text */ });
  }, []);

  const positive = (s: string) => { const n = parseFloat(s); return s.trim() && n > 0 ? n : undefined; };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!task.trim() || workspaceError || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const view = await createCampaign({
        task: task.trim(),
        agent_id: agentId.trim() || undefined,
        max_sessions: Math.max(1, parseInt(maxSessions, 10) || 10),
        budget_usd: positive(budget),
        session_budget_usd: positive(sessionBudget),
        workspace: workspace.trim() || undefined,
      });
      navigate(`#/campaigns/${encodeURIComponent(view.campaign.campaign_id)}`);
    } catch (err) {
      setError(errorText(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="new-run-card">
      <div className="new-run-header">
        <h2 className="new-run-title">New Campaign</h2>
        <button type="button" onClick={() => navigate("#/campaigns")} className="new-run-close" aria-label="Cancel">
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      <form onSubmit={submit} className="new-run-body">
        <div className="new-run-field">
          <label className="new-run-label" htmlFor="cmp-task">
            Project specification<span className="new-run-required" aria-hidden="true">*</span>
          </label>
          <textarea id="cmp-task" className="new-run-textarea" rows={8} value={task} required
            onChange={(e) => setTask(e.target.value)} disabled={submitting}
            placeholder="Describe the whole project. A planner turns it into a fixed feature list with file-checkable checks." />
        </div>
        <div className="cmp-form-grid">
          <div className="new-run-field">
            <label className="new-run-label" htmlFor="cmp-agent">Agent</label>
            {agents.length > 0 ? (
              <select id="cmp-agent" className="new-run-input cmp-select" value={agentId} onChange={(e) => setAgentId(e.target.value)} disabled={submitting}>
                {agents.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            ) : (
              <input id="cmp-agent" className="new-run-input" value={agentId} onChange={(e) => setAgentId(e.target.value)} disabled={submitting} />
            )}
          </div>
          <div className="new-run-field">
            <label className="new-run-label" htmlFor="cmp-max">Max sessions</label>
            <input id="cmp-max" type="number" min="1" max="500" className="new-run-input" value={maxSessions}
              onChange={(e) => setMaxSessions(e.target.value)} disabled={submitting} />
          </div>
          <div className="new-run-field">
            <label className="new-run-label" htmlFor="cmp-budget">Budget (USD)<span className="new-run-optional">optional</span></label>
            <div className="new-run-input-wrap">
              <DollarSign className="new-run-input-icon" aria-hidden="true" />
              <input id="cmp-budget" type="number" min="0" step="0.01" className="new-run-input" value={budget}
                onChange={(e) => setBudget(e.target.value)} placeholder="whole campaign" disabled={submitting} />
            </div>
          </div>
          <div className="new-run-field">
            <label className="new-run-label" htmlFor="cmp-sbudget">Per session<span className="new-run-optional">optional</span></label>
            <div className="new-run-input-wrap">
              <DollarSign className="new-run-input-icon" aria-hidden="true" />
              <input id="cmp-sbudget" type="number" min="0" step="0.01" className="new-run-input" value={sessionBudget}
                onChange={(e) => setSessionBudget(e.target.value)} placeholder="each session" disabled={submitting} />
            </div>
          </div>
        </div>
        <div className="new-run-field">
          <label className="new-run-label" htmlFor="cmp-ws">Workspace<span className="new-run-optional">optional</span></label>
          <div className="new-run-input-wrap">
            <FolderGit2 className="new-run-input-icon" aria-hidden="true" />
            <input id="cmp-ws" className="new-run-input" value={workspace} onChange={(e) => setWorkspace(e.target.value)}
              placeholder="campaign-<id>" disabled={submitting} aria-invalid={!!workspaceError} />
          </div>
          <p className={workspaceError ? "new-run-hint new-run-hint--error" : "new-run-hint"}>
            {workspaceError ?? "Every session works on this named workspace. Blank creates one for the campaign."}
          </p>
        </div>
        {error && <div role="alert" className="new-run-error"><AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" /><span>{error}</span></div>}
        <div className="new-run-footer">
          <button type="button" className="new-run-btn-cancel" onClick={() => navigate("#/campaigns")} disabled={submitting}>Cancel</button>
          <button type="submit" className="new-run-btn-submit" disabled={!task.trim() || !!workspaceError || submitting}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Play className="w-4 h-4" aria-hidden="true" />}
            {submitting ? "Starting…" : "Start campaign"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

function FeatureRow({
  feature, campaign, onRetry, navigate,
}: {
  feature: Feature;
  campaign: CampaignView["campaign"];
  onRetry: (featureId: string, guidance: string) => Promise<boolean>;
  navigate: (hash: string) => void;
}) {
  const active = campaign.pending_feature === feature.id && !!campaign.pending_session;
  const [open, setOpen] = React.useState(false);
  const [retrying, setRetrying] = React.useState(false);
  const [guidance, setGuidance] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const sessions = feature.sessions ?? (feature.last_run_id ? [feature.last_run_id] : []);
  const canRetry = feature.status === "blocked" || feature.status === "failing";
  const openRun = (runId: string) => navigate(`#/runs/${encodeURIComponent(runId)}`);

  async function submitRetry() {
    setBusy(true);
    const ok = await onRetry(feature.id, guidance);
    setBusy(false);
    if (ok) { setRetrying(false); setGuidance(""); }
  }

  return (
    <li className={`cmp-feature cmp-feature--${feature.status} ${active ? "cmp-feature--active" : ""}`}>
      <div className="cmp-feature-head-row">
        <button type="button" className="cmp-feature-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />}
          {FEATURE_ICON[feature.status]}
          <span className="cmp-feature-id">{feature.id}</span>
          <span className="cmp-feature-title">{feature.title}</span>
          <span className="cmp-feature-meta">
            {feature.status}
            {feature.attempts ? ` · ${feature.attempts} failed attempt${feature.attempts !== 1 ? "s" : ""}` : ""}
            {sessions.length > 0 && ` · ${sessions.length} session${sessions.length !== 1 ? "s" : ""}`}
          </span>
        </button>
        {active && (
          <button type="button" className="cmp-live-badge" onClick={() => openRun(campaign.pending_session!)} title="Open the session in progress">
            <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> in progress · watch
          </button>
        )}
        {canRetry && !active && !retrying && (
          <button type="button" className="cmp-btn cmp-btn--small" onClick={() => { setRetrying(true); setOpen(true); }}
            title="Give this feature fresh attempts, optionally with guidance for the next session">
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Retry
          </button>
        )}
      </div>

      {open && (
        <div className="cmp-feature-body">
          <p>{feature.description}</p>

          {feature.status === "blocked" && !retrying && (
            <p className="cmp-callout">
              Blocked after {attemptsLabel(feature)} — later sessions skip it. Check the failed checks and the
              last session's notes below; open the session to see exactly what it did. Then <b>Retry</b>, ideally
              with guidance on what to do differently.
            </p>
          )}

          <p className="cmp-sub">Checks</p>
          <ul className="cmp-checks">
            {feature.checks.map((check) => {
              const ev = feature.evidence.find((e) => e.criterion === check);
              return (
                <li key={check}>
                  {ev ? (ev.met ? <CheckCircle2 className="w-3.5 h-3.5 text-gain" aria-hidden="true" /> : <XCircle className="w-3.5 h-3.5 text-loss" aria-hidden="true" />)
                      : <CircleDashed className="w-3.5 h-3.5 text-ink-subtle" aria-hidden="true" />}
                  <span>{check}</span>
                  {ev?.evidence && <span className="cmp-evidence">— {ev.evidence}</span>}
                </li>
              );
            })}
          </ul>

          {feature.guidance && !retrying && (
            <>
              <p className="cmp-sub">Operator guidance for the next session</p>
              <pre className="cmp-notes">{feature.guidance}</pre>
            </>
          )}

          {retrying && (
            <div className="cmp-retry">
              <label className="cmp-sub" htmlFor={`guidance-${feature.id}`}>Guidance for the next session (optional)</label>
              <textarea id={`guidance-${feature.id}`} className="new-run-textarea" rows={3} value={guidance}
                onChange={(e) => setGuidance(e.target.value)} disabled={busy}
                placeholder="What should the next attempt do differently? e.g. the tests live in tests/, run them with pytest -q" />
              <p className="cmp-help">
                Resets the failed attempts and puts this feature first. Its checks stay the same, and only the
                independent verifier can mark it passing. If the campaign is stopped, resume it afterwards.
              </p>
              <div className="cmp-actions">
                <button type="button" className="cmp-btn" onClick={() => setRetrying(false)} disabled={busy}>Cancel</button>
                <button type="button" className="cmp-btn cmp-btn--primary" onClick={submitRetry} disabled={busy}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="w-4 h-4" aria-hidden="true" />}
                  Retry feature
                </button>
              </div>
            </div>
          )}

          {feature.notes && (<><p className="cmp-sub">Last session's notes</p><pre className="cmp-notes">{feature.notes}</pre></>)}

          {sessions.length > 0 && (
            <>
              <p className="cmp-sub">Sessions</p>
              <ol className="cmp-sessions">
                {sessions.map((runId, i) => {
                  const number = campaign.sessions.indexOf(runId) + 1;
                  const inProgress = runId === campaign.pending_session;
                  const latest = i === sessions.length - 1;
                  return (
                    <li key={runId}>
                      <button type="button" className="cmp-link" onClick={() => openRun(runId)}>
                        <span className="cmp-session-no">{number > 0 ? `#${number}` : "—"}</span>
                        <span className="font-mono">{runId.slice(0, 8)}…</span>
                        <span className="cmp-muted">
                          {inProgress ? "in progress" : latest ? `latest · ${feature.status}` : "failed verification"}
                        </span>
                        {inProgress ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function attemptsLabel(feature: Feature): string {
  return `${feature.attempts} failed attempt${feature.attempts !== 1 ? "s" : ""}`;
}

function LimitsEditor({
  campaign, onSave, onCancel,
}: {
  campaign: CampaignView["campaign"];
  onSave: (update: CampaignLimitsUpdate) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [maxSessions, setMaxSessions] = React.useState(String(campaign.max_sessions));
  const [budget, setBudget] = React.useState(campaign.budget_usd != null ? String(campaign.budget_usd) : "");
  const [sessionBudget, setSessionBudget] = React.useState(campaign.session_budget_usd != null ? String(campaign.session_budget_usd) : "");
  const [busy, setBusy] = React.useState(false);
  const toLimit = (s: string): number | null => { const n = parseFloat(s); return s.trim() && n > 0 ? n : null; };
  const max = parseInt(maxSessions, 10);
  const valid = Number.isFinite(max) && max >= 1 && max <= 500;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    // Blank budgets are sent as null: "no limit".
    await onSave({ max_sessions: max, budget_usd: toLimit(budget), session_budget_usd: toLimit(sessionBudget) });
    setBusy(false);
  }

  return (
    <form className="cmp-limits" onSubmit={save}>
      <div className="cmp-form-grid cmp-form-grid--3">
        <div className="new-run-field">
          <label className="new-run-label" htmlFor="lim-max">Max sessions</label>
          <input id="lim-max" type="number" min="1" max="500" className="new-run-input" value={maxSessions}
            onChange={(e) => setMaxSessions(e.target.value)} disabled={busy} />
          <p className="new-run-hint">{campaign.sessions.length} used so far</p>
        </div>
        <div className="new-run-field">
          <label className="new-run-label" htmlFor="lim-budget">Budget (USD)</label>
          <div className="new-run-input-wrap">
            <DollarSign className="new-run-input-icon" aria-hidden="true" />
            <input id="lim-budget" type="number" min="0" step="0.01" className="new-run-input" value={budget}
              onChange={(e) => setBudget(e.target.value)} placeholder="no limit" disabled={busy} />
          </div>
          <p className="new-run-hint">{money(campaign.spent_usd)} spent so far</p>
        </div>
        <div className="new-run-field">
          <label className="new-run-label" htmlFor="lim-sbudget">Per session</label>
          <div className="new-run-input-wrap">
            <DollarSign className="new-run-input-icon" aria-hidden="true" />
            <input id="lim-sbudget" type="number" min="0" step="0.01" className="new-run-input" value={sessionBudget}
              onChange={(e) => setSessionBudget(e.target.value)} placeholder="no limit" disabled={busy} />
          </div>
        </div>
      </div>
      <div className="cmp-actions">
        <button type="button" className="cmp-btn" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="cmp-btn cmp-btn--primary" disabled={busy || !valid}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />} Save limits
        </button>
      </div>
    </form>
  );
}

function CampaignDetail({ campaignId, navigate }: { campaignId: string; navigate: (hash: string) => void }) {
  const [view, setView] = React.useState<CampaignView | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [editingLimits, setEditingLimits] = React.useState(false);

  const load = React.useCallback(() => {
    fetchCampaign(campaignId)
      .then((v) => { setView(v); setError(null); })
      .catch((err) => setError(errorText(err)));
  }, [campaignId]);

  React.useEffect(load, [load]);
  const live = !!view && (ACTIVE.has(view.campaign.status) || view.campaign.pause_requested);
  React.useEffect(() => {
    if (!live) return;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [live, load]);

  async function act(action: (id: string) => Promise<CampaignView>): Promise<boolean> {
    setBusy(true);
    try { setView(await action(campaignId)); setError(null); return true; }
    catch (err) { setError(errorText(err)); return false; }
    finally { setBusy(false); }
  }

  if (!view) {
    return <section className="cmp-card">{error ? <ErrorBox message={error} /> : <p className="cmp-muted"><Loader2 className="w-4 h-4 animate-spin inline" /> Loading…</p>}</section>;
  }
  const c = view.campaign;
  const canResume = c.status === "paused" || c.status === "stopped";
  const canEditLimits = c.status !== "completed" && c.status !== "failed";
  const attributed = new Set(view.features.flatMap((f) => f.sessions ?? (f.last_run_id ? [f.last_run_id] : [])));
  const unattributed = c.sessions.filter((r) => !attributed.has(r));

  return (
    <section className="cmp-card cmp-card--wide">
      <header className="cmp-card-header">
        <div>
          <h2 className="cmp-title">Campaign {c.campaign_id}</h2>
          <p className="cmp-muted cmp-task" title={c.task}>{c.task}</p>
        </div>
        <div className="cmp-actions">
          <span className={CAMPAIGN_BADGE[c.status]}>{c.pause_requested ? "pausing…" : c.status}</span>
          {c.status === "running" && !c.pause_requested && (
            <button type="button" className="cmp-btn" disabled={busy} onClick={() => act(pauseCampaign)} title="Pause after the current session">
              <Pause className="w-4 h-4" aria-hidden="true" /> Pause
            </button>
          )}
          {canResume && (
            <button type="button" className="cmp-btn cmp-btn--primary" disabled={busy} onClick={() => act(resumeCampaign)}>
              <Play className="w-4 h-4" aria-hidden="true" /> Resume
            </button>
          )}
          <button type="button" className="cmp-icon-btn" onClick={load} aria-label="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${live ? "animate-spin-slow" : ""}`} aria-hidden="true" />
          </button>
        </div>
      </header>
      {error && <ErrorBox message={error} />}
      {c.stop_reason && <p className="cmp-reason">{c.stop_reason}</p>}

      <div className="cmp-stats">
        <Progress view={view} />
        <span>Sessions <b>{c.sessions.length}</b> / {c.max_sessions}</span>
        <span>Spent <b>{money(c.spent_usd)}</b>{c.budget_usd != null ? <> of {money(c.budget_usd)}</> : " (no budget limit)"}</span>
        {c.session_budget_usd != null && <span>Per session {money(c.session_budget_usd)}</span>}
        <span>Agent <b>{c.agent_id}</b></span>
        <span className="font-mono">workspace/{c.workspace}</span>
        {canEditLimits && !editingLimits && (
          <button type="button" className="cmp-link" onClick={() => setEditingLimits(true)}>
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" /> Edit limits
          </button>
        )}
      </div>
      {editingLimits && (
        <LimitsEditor
          campaign={c}
          onCancel={() => setEditingLimits(false)}
          onSave={async (update) => {
            const ok = await act((id) => updateCampaignLimits(id, update));
            if (ok) setEditingLimits(false);
            return ok;
          }}
        />
      )}

      <h3 className="cmp-h3">Feature ledger</h3>
      {c.status === "defining" && view.total === 0 && (
        <p className="cmp-muted"><Loader2 className="w-4 h-4 animate-spin inline" /> A planner is writing the feature list…</p>
      )}
      <ul className="cmp-features">
        {view.features.map((f) => (
          <FeatureRow
            key={f.id}
            feature={f}
            campaign={c}
            navigate={navigate}
            onRetry={(featureId, guidance) => act((id) => retryCampaignFeature(id, featureId, guidance))}
          />
        ))}
      </ul>

      {unattributed.length > 0 && (
        <>
          <h3 className="cmp-h3">Earlier sessions</h3>
          <p className="cmp-help">Recorded before sessions were tracked per feature.</p>
          <ol className="cmp-sessions">
            {unattributed.map((runId) => (
              <li key={runId}>
                <button type="button" className="cmp-link" onClick={() => navigate(`#/runs/${encodeURIComponent(runId)}`)}>
                  <span className="cmp-session-no">#{c.sessions.indexOf(runId) + 1}</span>
                  <span className="font-mono">{runId.slice(0, 8)}…</span>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

export function CampaignsPage({ route, navigate }: { route: CampaignRoute; navigate: (hash: string) => void }) {
  return (
    <Shell navigate={navigate}>
      {route.page === "campaigns" && <CampaignList navigate={navigate} />}
      {route.page === "new-campaign" && <NewCampaign navigate={navigate} />}
      {route.page === "campaign" && <CampaignDetail key={route.campaignId} campaignId={route.campaignId} navigate={navigate} />}
    </Shell>
  );
}
