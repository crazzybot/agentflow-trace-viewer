import React from "react";
import { Play, X, Loader2, DollarSign, AlertCircle, ArrowUpRight } from "lucide-react";

export interface FollowupFormProps {
  priorRunId: string;
  priorName?: string | null;
  priorTask?: string | null;
  onSubmit: (task: string, budgetUsd: number | undefined) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  submitError?: string | null;
}

export function FollowupForm({
  priorRunId,
  priorName,
  priorTask,
  onSubmit,
  onCancel,
  isSubmitting = false,
  submitError = null,
}: FollowupFormProps) {
  const [task, setTask] = React.useState("");
  const [budgetStr, setBudgetStr] = React.useState("");
  const taskRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    taskRef.current?.focus();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = task.trim();
    if (!trimmed || isSubmitting) return;
    const parsed = parseFloat(budgetStr);
    const budget = budgetStr.trim() && !isNaN(parsed) && parsed > 0 ? parsed : undefined;
    onSubmit(trimmed, budget);
  }

  const canSubmit = task.trim().length > 0 && !isSubmitting;
  const displayName = priorName ?? priorRunId.slice(0, 12) + "…";

  return (
    <div className="new-run-card">
      <div className="new-run-header">
        <h2 className="new-run-title">Follow-up Run</h2>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="new-run-close"
          aria-label="Cancel"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="new-run-body">
        <div className="followup-context-block">
          <div className="followup-context-header">
            <ArrowUpRight className="w-3.5 h-3.5 text-indigo-500 shrink-0" aria-hidden="true" />
            <span className="followup-context-label">Continuing from</span>
            <span className="followup-context-run-chip" title={priorRunId}>{displayName}</span>
          </div>
          {priorTask && (
            <p className="followup-context-prior-task">
              "{priorTask.length > 120 ? priorTask.slice(0, 120) + "…" : priorTask}"
            </p>
          )}
          <p className="followup-context-hint">
            The new run will receive the prior task, report, and subtask results as context.
          </p>
        </div>

        <div className="new-run-field">
          <label className="new-run-label" htmlFor="followup-task-input">
            New Task
            <span className="new-run-required" aria-hidden="true">*</span>
          </label>
          <textarea
            id="followup-task-input"
            ref={taskRef}
            className="new-run-textarea"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Describe the follow-up task…"
            rows={5}
            required
            disabled={isSubmitting}
            aria-required="true"
          />
        </div>

        <div className="new-run-field">
          <label className="new-run-label" htmlFor="followup-budget-input">
            Budget (USD)
            <span className="new-run-optional">optional</span>
          </label>
          <div className="new-run-input-wrap">
            <DollarSign className="new-run-input-icon" aria-hidden="true" />
            <input
              id="followup-budget-input"
              type="number"
              className="new-run-input"
              value={budgetStr}
              onChange={(e) => setBudgetStr(e.target.value)}
              placeholder="e.g. 1.00"
              min="0"
              step="0.01"
              disabled={isSubmitting}
            />
          </div>
          <p className="new-run-hint">Leave blank to use the service default limit.</p>
        </div>

        {submitError && (
          <div role="alert" className="new-run-error">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{submitError}</span>
          </div>
        )}

        <div className="new-run-footer">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="new-run-btn-cancel"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="new-run-btn-submit"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Play className="w-4 h-4" aria-hidden="true" />
            )}
            {isSubmitting ? "Starting…" : "Start Follow-up"}
          </button>
        </div>
      </form>
    </div>
  );
}
