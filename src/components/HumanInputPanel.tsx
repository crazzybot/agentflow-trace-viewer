import React from "react";
import { CirclePause, DollarSign, Loader2, AlertTriangle } from "lucide-react";
import { submitHumanInput } from "../api/agentflow";

export interface AwaitingInputData {
  message: string;
  requestType: string;
  context: Record<string, unknown>;
}

export interface HumanInputPanelProps {
  runId: string;
  awaiting: AwaitingInputData;
  onDone: () => void;
}

function fmt(n: unknown): string {
  if (typeof n !== "number") return "—";
  return `$${n.toFixed(4)}`;
}

function defaultBudgetSuggestion(context: Record<string, unknown>): number {
  const b = context["budget_usd"];
  if (typeof b === "number" && b > 0) return Math.round(b * 100) / 100;
  const t = context["task_budget_usd"];
  if (typeof t === "number" && t > 0) return Math.round(t * 10 * 100) / 100;
  return 5.0;
}

export function HumanInputPanel({ runId, awaiting, onDone }: HumanInputPanelProps) {
  const { message, context } = awaiting;
  const [budgetInput, setBudgetInput] = React.useState<string>(
    () => String(defaultBudgetSuggestion(context))
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const costUsd = context["cost_usd"];
  const budgetUsd = context["budget_usd"];

  async function submit(action: "continue" | "cancel") {
    setIsSubmitting(true);
    setError(null);
    try {
      const budgetIncrease =
        action === "continue" ? parseFloat(budgetInput) || 0 : undefined;
      await submitHumanInput(runId, {
        action,
        budget_increase_usd: budgetIncrease,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsSubmitting(false);
    }
  }

  return (
    <div className="hitl-panel" role="region" aria-label="Agent waiting for input">
      <div className="hitl-header">
        <CirclePause className="hitl-header-icon" aria-hidden="true" />
        <span className="hitl-header-title">Agent is waiting for your input</span>
        <div className="hitl-cost-chips">
          {typeof costUsd === "number" && (
            <span className="hitl-chip">
              <span className="hitl-chip-label">Spent</span>
              <span className="hitl-chip-value">{fmt(costUsd)}</span>
            </span>
          )}
          {typeof budgetUsd === "number" && (
            <span className="hitl-chip">
              <span className="hitl-chip-label">Budget</span>
              <span className="hitl-chip-value">{fmt(budgetUsd)}</span>
            </span>
          )}
        </div>
      </div>

      <p className="hitl-message">{message}</p>

      {error && (
        <div className="hitl-error" role="alert">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div className="hitl-footer">
        <div className="hitl-budget-row">
          <label className="hitl-budget-label" htmlFor="hitl-budget-input">
            Additional budget
          </label>
          <div className="hitl-budget-input-wrap">
            <DollarSign className="hitl-budget-icon" aria-hidden="true" />
            <input
              id="hitl-budget-input"
              type="number"
              min="0"
              step="0.5"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              disabled={isSubmitting}
              className="hitl-budget-input"
              aria-label="Additional budget in USD"
            />
          </div>
        </div>

        <div className="hitl-actions">
          <button
            type="button"
            onClick={() => submit("cancel")}
            disabled={isSubmitting}
            className="hitl-btn hitl-btn--cancel"
          >
            Cancel run
          </button>
          <button
            type="button"
            onClick={() => submit("continue")}
            disabled={isSubmitting || parseFloat(budgetInput) <= 0}
            className="hitl-btn hitl-btn--continue"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : null}
            Continue with +{fmt(parseFloat(budgetInput) || 0)}
          </button>
        </div>
      </div>
    </div>
  );
}
