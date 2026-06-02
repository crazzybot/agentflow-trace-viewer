import { AGENTFLOW_API_URL } from '../config';
import type { RunInfo } from '../types/runs';

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

export async function fetchRunResultsText(runId: string): Promise<string> {
  const res = await fetch(`${AGENTFLOW_API_URL}/api/runs/${encodeURIComponent(runId)}/results`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const results = Array.isArray(data) ? data : (data.results ?? []);
  return JSON.stringify(results);
}
