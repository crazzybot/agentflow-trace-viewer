import React from "react";
import { Play, X, Loader2, DollarSign, AlertCircle, FolderGit2 } from "lucide-react";
import { workspaceNameError } from "../utils/workspace";

export interface NewRunFormProps {
  onSubmit: (task: string, budgetUsd: number | undefined, workspace?: string) => void;
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
  const [workspace, setWorkspace] = React.useState("");
  const workspaceError = workspaceNameError(workspace);
  const taskRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    taskRef.current?.focus();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = task.trim();
    if (!trimmed || isSubmitting || workspaceError) return;
    const parsed = parseFloat(budgetStr);
    const budget = budgetStr.trim() && !isNaN(parsed) && parsed > 0 ? parsed : undefined;
    onSubmit(trimmed, budget, workspace.trim() || undefined);
  }

  const canSubmit = task.trim().length > 0 && !isSubmitting && !workspaceError;

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

        {/* Workspace field */}
        <div className="new-run-field">
          <label className="new-run-label" htmlFor="workspace-input">
            Workspace
            <span className="new-run-optional">optional</span>
          </label>
          <div className="new-run-input-wrap">
            <FolderGit2 className="new-run-input-icon" aria-hidden="true" />
            <input
              id="workspace-input"
              type="text"
              className="new-run-input"
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              placeholder="e.g. app-gateway"
              disabled={isSubmitting}
              aria-invalid={!!workspaceError}
            />
          </div>
          <p className={workspaceError ? "new-run-hint new-run-hint--error" : "new-run-hint"}>
            {workspaceError ??
              "A named project workspace that runs keep building on. Blank gives this run a fresh workspace of its own."}
          </p>
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
