/**
 * Campaigns: long-horizon work built feature by feature across fresh-context
 * sessions (AgentFlow docs/guide/concepts.md#campaign). Each session is an
 * ordinary run, so session links open in the normal trace view.
 */
import React from "react";
import {
  Activity, AlertCircle, ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, CircleDashed,
  CircleSlash, DollarSign, ExternalLink, FolderGit2, Loader2, Pause, Play, PlusCircle,
  RefreshCw, Target, XCircle, X,
} from "lucide-react";
import {
  createCampaign, fetchAgentIds, fetchCampaign, fetchCampaigns, pauseCampaign, resumeCampaign,
} from "../api/agentflow";
import type { CampaignStatus, CampaignView, Feature, FeatureStatus } from "../types/campaigns";
import { workspaceNameError } from "../utils/workspace";

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
  passing: <CheckCircle2 className="w-4 h-4 text-emerald-500" aria-hidden="true" />,
  failing: <XCircle className="w-4 h-4 text-red-500" aria-hidden="true" />,
  blocked: <CircleSlash className="w-4 h-4 text-gray-400" aria-hidden="true" />,
  pending: <CircleDashed className="w-4 h-4 text-gray-400" aria-hidden="true" />,
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

function FeatureRow({ feature, navigate }: { feature: Feature; navigate: (hash: string) => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <li className={`cmp-feature cmp-feature--${feature.status}`}>
      <button type="button" className="cmp-feature-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />}
        {FEATURE_ICON[feature.status]}
        <span className="cmp-feature-id">{feature.id}</span>
        <span className="cmp-feature-title">{feature.title}</span>
        <span className="cmp-feature-meta">
          {feature.status}{feature.attempts ? ` · ${feature.attempts} failed attempt${feature.attempts !== 1 ? "s" : ""}` : ""}
        </span>
      </button>
      {open && (
        <div className="cmp-feature-body">
          <p>{feature.description}</p>
          <p className="cmp-sub">Checks</p>
          <ul className="cmp-checks">
            {feature.checks.map((check) => {
              const ev = feature.evidence.find((e) => e.criterion === check);
              return (
                <li key={check}>
                  {ev ? (ev.met ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" /> : <XCircle className="w-3.5 h-3.5 text-red-500" aria-hidden="true" />)
                      : <CircleDashed className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />}
                  <span>{check}</span>
                  {ev?.evidence && <span className="cmp-evidence">— {ev.evidence}</span>}
                </li>
              );
            })}
          </ul>
          {feature.notes && (<><p className="cmp-sub">Last session's notes</p><pre className="cmp-notes">{feature.notes}</pre></>)}
          {feature.last_run_id && (
            <button type="button" className="cmp-link" onClick={() => navigate(`#/runs/${encodeURIComponent(feature.last_run_id!)}`)}>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /> Open the last session's run
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function CampaignDetail({ campaignId, navigate }: { campaignId: string; navigate: (hash: string) => void }) {
  const [view, setView] = React.useState<CampaignView | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

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

  async function act(action: (id: string) => Promise<CampaignView>) {
    setBusy(true);
    try { setView(await action(campaignId)); setError(null); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }

  if (!view) {
    return <section className="cmp-card">{error ? <ErrorBox message={error} /> : <p className="cmp-muted"><Loader2 className="w-4 h-4 animate-spin inline" /> Loading…</p>}</section>;
  }
  const c = view.campaign;
  const canResume = c.status === "paused" || c.status === "stopped";

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
        <span>Spent <b>{money(c.spent_usd)}</b>{c.budget_usd != null && <> of {money(c.budget_usd)}</>}</span>
        {c.session_budget_usd != null && <span>Per session {money(c.session_budget_usd)}</span>}
        <span>Agent <b>{c.agent_id}</b></span>
        <span className="font-mono">workspace/{c.workspace}</span>
      </div>

      <h3 className="cmp-h3">Feature ledger</h3>
      {c.status === "defining" && view.total === 0 && (
        <p className="cmp-muted"><Loader2 className="w-4 h-4 animate-spin inline" /> A planner is writing the feature list…</p>
      )}
      <ul className="cmp-features">
        {view.features.map((f) => <FeatureRow key={f.id} feature={f} navigate={navigate} />)}
      </ul>

      {c.sessions.length > 0 && (
        <>
          <h3 className="cmp-h3">Sessions</h3>
          <ol className="cmp-sessions">
            {c.sessions.map((runId, i) => {
              const feature = view.features.find((f) => f.last_run_id === runId);
              const pending = runId === c.pending_session;
              return (
                <li key={runId}>
                  <button type="button" className="cmp-link" onClick={() => navigate(`#/runs/${encodeURIComponent(runId)}`)}>
                    <span className="cmp-session-no">#{i + 1}</span>
                    <span className="font-mono">{runId.slice(0, 8)}…</span>
                    <span>{pending ? `${c.pending_feature} · in progress` : feature ? `${feature.id} · ${feature.title}` : ""}</span>
                    {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
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
