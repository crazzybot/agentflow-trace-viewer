import React from "react";
import { Loader2, SendHorizonal, OctagonX, Check, AlertTriangle } from "lucide-react";
import { sendRunMessage, cancelRun } from "../api/agentflow";

interface StreamingControlBarProps {
  runId: string;
}

export function StreamingControlBar({ runId }: StreamingControlBarProps) {
  const [message, setMessage] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [isCancelling, setIsCancelling] = React.useState(false);
  const [cancelError, setCancelError] = React.useState<string | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || isSending) return;
    setIsSending(true);
    setSendError(null);
    setSent(false);
    try {
      await sendRunMessage(runId, trimmed);
      setMessage("");
      setSent(true);
      setTimeout(() => setSent(false), 2000);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSending(false);
    }
  }

  async function handleCancel() {
    if (isCancelling) return;
    setIsCancelling(true);
    setCancelError(null);
    try {
      await cancelRun(runId);
      // Stay in isCancelling=true — the run:cancelled terminal SSE event will finalize state
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : String(err));
      setIsCancelling(false);
    }
  }

  return (
    <div className="stream-ctrl-bar">
      <div className="stream-ctrl-left">
        <Loader2 className="w-4 h-4 animate-spin text-indigo-500" aria-hidden="true" />
        <span className="stream-status-text">Streaming live events…</span>
      </div>

      <form onSubmit={handleSend} className="stream-msg-form" aria-label="Send message to agent">
        <div className="stream-msg-input-wrap">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Send a message to the agent…"
            disabled={isSending}
            className="stream-msg-input"
            aria-label="Message to agent"
          />
          <button
            type="submit"
            disabled={!message.trim() || isSending}
            className="stream-msg-send-btn"
            aria-label="Send message"
          >
            {isSending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : sent ? (
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <SendHorizonal className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
        {sendError && (
          <p className="stream-ctrl-error" role="alert">
            <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
            {sendError}
          </p>
        )}
      </form>

      <div className="stream-ctrl-right">
        <button
          type="button"
          onClick={handleCancel}
          disabled={isCancelling}
          className="stream-cancel-btn"
          aria-label="Cancel run"
        >
          {isCancelling ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <OctagonX className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          {isCancelling ? "Cancelling…" : "Cancel run"}
        </button>
        {cancelError && (
          <p className="stream-ctrl-error" role="alert">
            <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
            {cancelError}
          </p>
        )}
      </div>
    </div>
  );
}
