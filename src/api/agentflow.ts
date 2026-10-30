import { AGENTFLOW_API_URL } from '../config';
import type { RunInfo } from '../types/runs';
import type { RunArtifact, RunArtifactContent } from '../types/artifacts';
import type { SessionEvent } from '../types/session';
import type { RunCheckpoint } from '../types/checkpoints';
import type { CampaignLimitsUpdate, CampaignView, CreateCampaignRequest } from '../types/campaigns';

export interface CreateRunRequest {
  task: string;
  budget_usd?: number;
  /** Named workspace (a long-lived project); omitted → a fresh per-run workspace. */
  workspace?: string;
}

/** Throw an Error carrying the server's `detail` message when present. */
async function ensureOk(res: Response): Promise<void> {
  if (res.ok) return;
  const text = await res.text().catch(() => '');
  let detail = text;
  try {
    const parsed = JSON.parse(text) as { detail?: unknown };
    if (typeof parsed.detail === 'string') detail = parsed.detail;
    else if (Array.isArray(parsed.detail)) detail = parsed.detail.map((d: { msg?: string }) => d.msg ?? '').join('; ');
  } catch { /* not JSON */ }
  throw new Error(`HTTP ${res.status}${detail ? ': ' + detail : ''}`);
}

export interface CreateRunResponse {
  run_id: string;
  status: string;
}

export interface HumanInputResponse {
  action: "continue" | "cancel";
  budget_increase_usd?: number;
}

export async function submitHumanInput(runId: string, response: HumanInputResponse): Promise<void> {
  const res = await fetch(`${AGENTFLOW_API_URL}/api/runs/${encodeURIComponent(runId)}/input`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(response),
  });
  await ensureOk(res);
}

export async function createRun(request: CreateRunRequest): Promise<CreateRunResponse> {
  const res = await fetch(`${AGENTFLOW_API_URL}/api/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  await ensureOk(res);
  return res.json();
}

export async function fetchRunReport(runId: string): Promise<string> {
  const res = await fetch(`${AGENTFLOW_API_URL}/api/runs/${encodeURIComponent(runId)}/report`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return typeof data.report === 'string' ? data.report : '';
}

export function openRunStream(runId: string): EventSource {
  return new EventSource(`${AGENTFLOW_API_URL}/api/runs/${encodeURIComponent(runId)}/stream`);
}

export async function fetchRuns(): Promise<RunInfo[]> {
  const res = await fetch(`${AGENTFLOW_API_URL}/api/runs`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.runs ?? []);
}

export async function fetchRunEventsText(runId: string): Promise<string> {
  const res = await fetch(`${AGENTFLOW_API_URL}/api/runs/${encodeURIComponent(runId)}/events`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const events = Array.isArray(data) ? data : (data.events ?? []);
  return JSON.stringify(events);
}

export async function fetchRunArtifacts(runId: string): Promise<RunArtifact[]> {
  const res = await fetch(`${AGENTFLOW_API_URL}/api/runs/${encodeURIComponent(runId)}/artifacts`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.artifacts ?? []);
}

export async function fetchRunArtifactContent(runId: string, artifactId: string): Promise<RunArtifactContent> {
  const res = await fetch(`${AGENTFLOW_API_URL}/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactId)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchRunResultsText(runId: string): Promise<string> {
  const res = await fetch(`${AGENTFLOW_API_URL}/api/runs/${encodeURIComponent(runId)}/results`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const results = Array.isArray(data) ? data : (data.results ?? []);
  return JSON.stringify(results);
}

/**
 * Cancel a run. Resolves to "cancelled" when the server ran it, or
 * "cancel_requested" when another replica owns it (it stops within a heartbeat).
 */
export async function cancelRun(runId: string): Promise<string> {
  const res = await fetch(`${AGENTFLOW_API_URL}/api/runs/${encodeURIComponent(runId)}/cancel`, {
    method: 'POST',
  });
  await ensureOk(res);
  const data = await res.json().catch(() => ({})) as { status?: string };
  return data.status ?? 'cancelled';
}

/** The run's durable session log (every run has one since Oct 2026). */
export async function fetchRunSession(runId: string): Promise<SessionEvent[]> {
  const res = await fetch(`${AGENTFLOW_API_URL}/api/runs/${encodeURIComponent(runId)}/session`);
  await ensureOk(res);
  const data = await res.json() as { events?: SessionEvent[] };
  return data.events ?? [];
}

/** Resume an interrupted run from its session log (same run id and stream). */
export async function resumeRun(runId: string): Promise<void> {
  const res = await fetch(`${AGENTFLOW_API_URL}/api/runs/${encodeURIComponent(runId)}/resume`, {
    method: 'POST',
  });
  await ensureOk(res);
}

export async function fetchRunCheckpoints(runId: string): Promise<RunCheckpoint[]> {
  const res = await fetch(`${AGENTFLOW_API_URL}/api/runs/${encodeURIComponent(runId)}/checkpoints`);
  await ensureOk(res);
  const data = await res.json() as { checkpoints?: RunCheckpoint[] };
  return data.checkpoints ?? [];
}

/** Agent ids the server has loaded (from GET /health). */
export async function fetchAgentIds(): Promise<string[]> {
  const res = await fetch(`${AGENTFLOW_API_URL}/health`);
  await ensureOk(res);
  const data = await res.json() as { agents?: unknown };
  return Array.isArray(data.agents) ? data.agents.filter((a): a is string => typeof a === 'string') : [];
}

// ── Campaigns ───────────────────────────────────────────────────────────────

export async function fetchCampaigns(): Promise<CampaignView[]> {
  const res = await fetch(`${AGENTFLOW_API_URL}/api/campaigns`);
  await ensureOk(res);
  const data = await res.json() as { campaigns?: CampaignView[] };
  return data.campaigns ?? [];
}

export async function fetchCampaign(campaignId: string): Promise<CampaignView> {
  const res = await fetch(`${AGENTFLOW_API_URL}/api/campaigns/${encodeURIComponent(campaignId)}`);
  await ensureOk(res);
  return res.json();
}

export async function createCampaign(request: CreateCampaignRequest): Promise<CampaignView> {
  const res = await fetch(`${AGENTFLOW_API_URL}/api/campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  await ensureOk(res);
  return res.json();
}

export async function pauseCampaign(campaignId: string): Promise<CampaignView> {
  const res = await fetch(`${AGENTFLOW_API_URL}/api/campaigns/${encodeURIComponent(campaignId)}/pause`, { method: 'POST' });
  await ensureOk(res);
  return res.json();
}

/** Change a campaign's limits (omitted fields unchanged; null removes a budget). */
export async function updateCampaignLimits(campaignId: string, update: CampaignLimitsUpdate): Promise<CampaignView> {
  const res = await fetch(`${AGENTFLOW_API_URL}/api/campaigns/${encodeURIComponent(campaignId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  await ensureOk(res);
  return res.json();
}

/** Give a blocked or failing feature fresh attempts, with optional guidance for its next session. */
export async function retryCampaignFeature(campaignId: string, featureId: string, guidance: string): Promise<CampaignView> {
  const res = await fetch(
    `${AGENTFLOW_API_URL}/api/campaigns/${encodeURIComponent(campaignId)}/features/${encodeURIComponent(featureId)}/retry`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guidance }) },
  );
  await ensureOk(res);
  return res.json();
}

export async function resumeCampaign(campaignId: string): Promise<CampaignView> {
  const res = await fetch(`${AGENTFLOW_API_URL}/api/campaigns/${encodeURIComponent(campaignId)}/resume`, { method: 'POST' });
  await ensureOk(res);
  return res.json();
}

export async function sendRunMessage(runId: string, content: string): Promise<void> {
  const res = await fetch(`${AGENTFLOW_API_URL}/api/runs/${encodeURIComponent(runId)}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  await ensureOk(res);
}

export async function createFollowupRun(
  priorRunId: string, task: string, budgetUsd?: number, workspace?: string,
): Promise<CreateRunResponse> {
  // Without `workspace` the follow-up continues in the prior run's workspace.
  const body: { task: string; budget_usd?: number; workspace?: string } = { task };
  if (budgetUsd !== undefined) body.budget_usd = budgetUsd;
  if (workspace) body.workspace = workspace;
  const res = await fetch(`${AGENTFLOW_API_URL}/api/runs/${encodeURIComponent(priorRunId)}/followup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await ensureOk(res);
  return res.json();
}
