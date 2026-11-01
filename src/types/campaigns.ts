/** AgentFlow campaigns (`/api/campaigns`). See AgentFlow docs/guide/concepts.md#campaign. */

import type { CriterionCheck } from "./events";

export type FeatureStatus = "pending" | "passing" | "failing" | "blocked";
export type CampaignStatus = "defining" | "running" | "paused" | "completed" | "stopped" | "failed";

export interface Feature {
  id: string;
  title: string;
  description: string;
  checks: string[];
  status: FeatureStatus;
  attempts: number;
  last_run_id: string | null;
  last_checked_session: number;
  /** The last session's own summary for this feature. */
  notes: string;
  evidence: CriterionCheck[];
  /** Run ids of every session that worked on this feature, oldest first (incl. in progress). */
  sessions?: string[];
  /** Operator guidance for the next session on this feature (set by a retry). */
  guidance?: string;
  /** Agent this feature runs on: the campaign's pinned agent, else the planner's choice. */
  agent_id?: string | null;
}

export interface Campaign {
  campaign_id: string;
  task: string;
  workspace: string;
  /** Agent every feature runs on; empty/null when the planner picks per feature. */
  agent_id: string | null;
  max_sessions: number;
  budget_usd: number | null;
  session_budget_usd: number | null;
  status: CampaignStatus;
  stop_reason: string;
  pause_requested: boolean;
  spent_usd: number;
  /** Session run ids, in order. */
  sessions: string[];
  pending_session: string | null;
  pending_feature: string | null;
  created_at: string;
}

export interface CampaignView {
  campaign: Campaign;
  features: Feature[];
  passing: number;
  total: number;
}

/** PATCH body: omit a field to keep it; `null` removes a budget limit. */
export interface CampaignLimitsUpdate {
  max_sessions?: number;
  budget_usd?: number | null;
  session_budget_usd?: number | null;
}

export interface CreateCampaignRequest {
  task: string;
  /** Omit to let the planner pick an agent per feature (falls back to CAMPAIGN_DEFAULT_AGENT). */
  agent_id?: string;
  max_sessions?: number;
  budget_usd?: number;
  session_budget_usd?: number;
  workspace?: string;
}
