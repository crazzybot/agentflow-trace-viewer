import { AGENTFLOW_API_URL } from '../config';
import type { RunInfo } from '../types/runs';
import type { RunArtifact, RunArtifactContent } from '../types/artifacts';

export interface CreateRunRequest {
  task: string;
  budget_usd?: number;
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
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}${text ? ': ' + text : ''}`);
  }
}

export async function createRun(request: CreateRunRequest): Promise<CreateRunResponse> {
  const res = await fetch(`${AGENTFLOW_API_URL}/api/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}${text ? ': ' + text : ''}`);
  }
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
