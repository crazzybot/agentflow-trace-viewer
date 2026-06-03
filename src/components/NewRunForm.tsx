import React from "react";
import { Play, X, Loader2, DollarSign, AlertCircle } from "lucide-react";

export interface NewRunFormProps {
  onSubmit: (task: string, budgetUsd: number | undefined) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  submitError?: string | null;
}

export function NewRunForm({
  onSubmit,
  onCancel,
  isSubmitting = false,
  submitError = null,
}: NewRunFormProps) {
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

  return (
    <div className="new-run-card">
      {/* Header */}
      <div className="new-run-header">
        <h2 className="new-run-title">New Run</h2>
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
        {/* Task textarea */}
        <div className="new-run-field">
          <label className="new-run-label" htmlFor="task-input">
            Task
            <span className="new-run-required" aria-hidden="true">*</span>
          </label>
          <textarea
            id="task-input"
            ref={taskRef}
            className="new-run-textarea"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Describe the task for the agents to execute…"
            rows={6}
            required
            disabled={isSubmitting}
            aria-required="true"
          />
        </div>

        {/* Budget field */}
        <div className="new-run-field">
          <label className="new-run-label" htmlFor="budget-input">
            Budget (USD)
            <span className="new-run-optional">optional</span>
          </label>
          <div className="new-run-input-wrap">
            <DollarSign className="new-run-input-icon" aria-hidden="true" />
            <input
              id="budget-input"
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

        {/* Error */}
        {submitError && (
          <div role="alert" className="new-run-error">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Footer */}
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
            {isSubmitting ? "Starting…" : "Start Run"}
          </button>
        </div>
      </form>
    </div>
  );
}
