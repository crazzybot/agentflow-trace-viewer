/**
 * Build a viewable trace from an AgentFlow session log.
 *
 * Every AgentFlow run writes `session.jsonl`; the SSE copy (`events.jsonl`) only
 * exists when the server runs with CAPTURE_EVENTS. This module converts session
 * events into the same SSE-shaped events the rest of the viewer understands, by
 * building raw event objects and passing them through `parseTraceEvent`, so the
 * timeline, detail panel and filters need no special cases.
 *
 * Mapping highlights:
 *  - Each agent invocation's messages become its turns: thinking → agent:thought,
 *    text → agent:progress, tool_use → agent:progress (tool call), tool_result →
 *    agent:tool_result, paired by tool_call_id.
 *  - A resumed invocation (continuation, verification repair, run resume) re-logs
 *    the conversation it inherited. That prefix is skipped: only turns produced by
 *    the invocation itself carry `usage`. The prompt that started it (repair
 *    findings, continue instruction) is shown instead.
 *  - Events carry `invocation_id`, so turns of parallel or repeated invocations of
 *    the same agent are grouped separately.
 *  - Session-only facts get viewer types: run:interrupted, task:decomposed,
 *    checkpoint:created, workspace:restored.
 */

import type { RunTrace, SubtaskResult, SubtaskResultStatus, TraceEvent } from "../types/events";
import type { SessionEvent, SessionMessage } from "../types/session";

/** A message content block, read loosely (Anthropic Messages API shape). */
type Block = Record<string, unknown>;
import { extractEventTypes, extractTimeRange, parseTraceEvent, sortEvents } from "./loadTrace";

interface InvocationState {
  agentId: string | null;
  turn: number;
  resumed: boolean;
  /** True once this invocation produced its own first turn (resumed prefix done). */
  live: boolean;
  sawInstruction: boolean;
  toolNames: Map<string, string>;
  /** Last user text skipped in a resumed prefix (repair / continue prompt). */
  pendingPrompt: string | null;
}

type RawEvent = Record<string, unknown>;

const STATUS_EVENT: Record<string, string> = {
  success: "task:complete",
  partial: "task:partial",
  failed: "task:failed",
};

const FINISH_EVENT: Record<string, string> = {
  complete: "run:complete",
  error: "run:error",
  cancelled: "run:cancelled",
};

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function obj(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (typeof b === "object" && b !== null && "text" in b ? str((b as { text: unknown }).text) : JSON.stringify(b)))
      .join("\n");
  }
  return content == null ? "" : JSON.stringify(content);
}

function short(text: string, max = 240): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? oneLine.slice(0, max) + "…" : oneLine;
}

export function traceFromSession(runId: string, session: SessionEvent[]): RunTrace {
  const raws: RawEvent[] = [];
  const results: SubtaskResult[] = [];
  const invocations = new Map<string, InvocationState>();
  let totalCostUsd = 0;

  for (const e of session) {
    let k = 0;
    // One session event can yield several trace events; keep them unique and ordered.
    const emit = (
      type: string,
      message: string,
      data: unknown = null,
      extra: { agent_id?: string | null; turn_index?: number; tool_call_id?: string; invocation_id?: string } = {},
    ) => {
      raws.push({
        run_id: runId,
        seq: e.seq * 100 + k++,
        ts: e.ts,
        type,
        agent_id: extra.agent_id !== undefined ? extra.agent_id : e.agent_id,
        ...(extra.turn_index !== undefined ? { turn_index: extra.turn_index } : {}),
        ...(extra.tool_call_id ? { tool_call_id: extra.tool_call_id } : {}),
        ...(extra.invocation_id ? { invocation_id: extra.invocation_id } : {}),
        payload: { message, partial: null, data },
      });
    };
    const d = e.data ?? {};

    switch (e.type) {
      case "run_started": {
        const ws = str(d["workspace"]);
        emit("run:started", `Run started${ws ? ` in workspace ${ws}` : ""}`, null, { agent_id: null });
        break;
      }
      case "run_resumed": {
        const finished = Object.keys(obj(d["finished"])).length;
        emit("run:started", `Run resumed — ${finished} subtask(s) already finished`, null, { agent_id: null });
        break;
      }
      case "run_interrupted":
        emit("run:interrupted", `Run interrupted: ${str(d["reason"]) || "service restarted"}`, d, { agent_id: null });
        break;
      case "plan_created": {
        const plan = obj(d["plan"]);
        const subtasks = Array.isArray(plan["subtasks"]) ? plan["subtasks"] : [];
        const how = d["preset"] ? " (preset plan)" : d["direct"] ? " (single-agent mode)" : "";
        emit("plan:created", `Plan: ${subtasks.length} subtask(s)${how}`,
          { run_id: str(plan["run_id"]) || runId, subtasks }, { agent_id: null });
        break;
      }
      case "subtask_dispatched":
        emit("task:dispatched", `Dispatching subtask ${e.subtask_id} to ${e.agent_id}`,
          { subtask_id: e.subtask_id ?? "", task_id: str(d["task_id"]) });
        break;
      case "subtask_decomposed": {
        const micro = Array.isArray(d["micro"]) ? d["micro"] : [];
        emit("task:decomposed", `Subtask ${e.subtask_id} split into ${micro.length} micro-steps`,
          { subtask_id: e.subtask_id, micro });
        break;
      }
      case "agent_started": {
        const id = e.invocation_id ?? `anon-${e.seq}`;
        const resumed = d["resumed"] === true;
        invocations.set(id, {
          agentId: e.agent_id, turn: 0, resumed, live: !resumed, sawInstruction: false,
          toolNames: new Map(), pendingPrompt: null,
        });
        emit("agent:progress", resumed ? "Continuing an earlier conversation" : "Starting", null,
          { turn_index: 0, invocation_id: id });
        break;
      }
      case "message_appended": {
        const id = e.invocation_id ?? "";
        const inv = invocations.get(id);
        if (!inv) break;
        const msg = obj(d["message"]) as unknown as SessionMessage;
        const ids = { invocation_id: id };

        if (!inv.live) {
          // Resumed prefix: skip re-logged history until the invocation's own first turn.
          if (!("usage" in d)) {
            // Only a *trailing* text prompt (repair findings, "continue…") started this invocation.
            inv.pendingPrompt = msg.role === "user" && typeof msg.content === "string" ? msg.content : null;
            // Keep tool names from the inherited history so later results resolve.
            if (msg.role === "assistant" && Array.isArray(msg.content)) {
              for (const b of msg.content as Block[]) if (b["type"] === "tool_use") inv.toolNames.set(str(b["id"]), str(b["name"]));
            }
            break;
          }
          inv.live = true;
          if (inv.pendingPrompt) {
            emit("agent:progress", inv.pendingPrompt, null, { turn_index: 0, ...ids });
          }
        }

        if (msg.role === "user") {
          if (typeof msg.content === "string") {
            if (!inv.sawInstruction && !inv.resumed) {
              inv.sawInstruction = true;
              emit("agent:progress", msg.content, null, { turn_index: 0, ...ids });
            } else if (d["injected"]) {
              emit("run:message_received", msg.content, null, { turn_index: inv.turn, ...ids });
            } else {
              emit("agent:progress", msg.content, null, { turn_index: inv.turn, ...ids });
            }
            break;
          }
          for (const block of msg.content as Block[]) {
            if (block["type"] !== "tool_result") continue;
            const callId = str(block["tool_use_id"]);
            const text = toolResultText(block["content"]);
            const isError = block["is_error"] === true;
            emit("agent:tool_result", short(text, 200),
              { tool: inv.toolNames.get(callId) ?? "", result: text, ...(isError ? { is_error: true } : {}) },
              { turn_index: inv.turn, tool_call_id: callId, ...ids });
          }
          break;
        }

        // assistant turn
        inv.turn += 1;
        inv.sawInstruction = true;
        const blocks: Block[] = Array.isArray(msg.content) ? (msg.content as Block[]) : [{ type: "text", text: String(msg.content) }];
        const thinking = blocks.filter((b) => b["type"] === "thinking").map((b) => str(b["thinking"])).join("\n\n").trim();
        if (thinking) emit("agent:thought", thinking, null, { turn_index: inv.turn, ...ids });
        for (const block of blocks) {
          if (block["type"] === "text" && str(block["text"]).trim()) {
            emit("agent:progress", str(block["text"]), null, { turn_index: inv.turn, ...ids });
          } else if (block["type"] === "tool_use") {
            const name = str(block["name"]);
            const callId = str(block["id"]);
            inv.toolNames.set(callId, name);
            emit("agent:progress", `Calling tool: ${name}`, { tool: name, input: obj(block["input"]) },
              { turn_index: inv.turn, tool_call_id: callId, ...ids });
          }
        }
        break;
      }
      case "message_discarded": {
        const inv = invocations.get(e.invocation_id ?? "");
        emit("agent:progress", "Discarded a response cut off by max_tokens (its tool calls were not run)", null,
          { turn_index: inv?.turn, invocation_id: e.invocation_id ?? undefined });
        break;
      }
      case "context_snipped": {
        const inv = invocations.get(e.invocation_id ?? "");
        emit("agent:progress",
          `Context at ~${num(d["prompt_tokens"]).toLocaleString()} tokens: omitted ${num(d["snipped"])} earlier ` +
          `tool result(s) (${num(d["freed_chars"]).toLocaleString()} chars) from the model's view`,
          null, { turn_index: inv?.turn, invocation_id: e.invocation_id ?? undefined });
        break;
      }
      case "agent_finished": {
        const status = str(d["status"]);
        if (status && status !== "success") {
          const err = str(d["error"]);
          emit("agent:progress", `Agent finished: ${status}${err ? ` — ${err}` : ""}`, null,
            { invocation_id: e.invocation_id ?? undefined });
        }
        break;
      }
      case "result_stored": {
        const r = obj(d["result"]);
        const status = str(r["status"]) || "success";
        const output = obj(r["output"]);
        results.push({
          subtask_id: e.subtask_id ?? "",
          task_id: str(r["task_id"]),
          agent_id: str(r["agent_id"]) || (e.agent_id ?? ""),
          status: status as SubtaskResultStatus,
          output: { text: str(output["text"]), structured: obj(output["structured"]) },
          error: typeof r["error"] === "string" ? r["error"] : null,
          tokens_used: num(r["tokens_used"]),
          duration_ms: num(r["duration_ms"]),
          cost_usd: num(r["cost_usd"]),
          verification: (r["verification"] as SubtaskResult["verification"]) ?? null,
          checkpoint: typeof r["checkpoint"] === "string" ? r["checkpoint"] : null,
        });
        const err = typeof r["error"] === "string" ? `: ${r["error"]}` : "";
        emit(STATUS_EVENT[status] ?? "task:complete", `Subtask ${e.subtask_id} ${status}${err}`,
          { ...r, subtask_id: e.subtask_id });
        break;
      }
      case "cost_added":
        totalCostUsd += num(d["cost_usd"]);
        break;
      case "subtask_verified": {
        const v = obj(d["verification"]);
        const checks = Array.isArray(v["checks"]) ? v["checks"] as { met?: boolean }[] : [];
        const outcome = v["passed"] === true ? "passed" : v["passed"] === false ? "failed" : "inconclusive";
        const met = checks.filter((c) => c.met).length;
        emit("task:verified",
          `Subtask ${e.subtask_id} verification ${outcome}${checks.length ? ` (${met}/${checks.length} criteria met)` : ""}`,
          { subtask_id: e.subtask_id, verification: v });
        break;
      }
      case "human_input_requested": {
        const req = obj(d["request"]);
        const message = str(req["message"]) || str(d["message"]) || "Waiting for human input";
        emit("run:awaiting_input", message, Object.keys(req).length ? req : d);
        break;
      }
      case "human_input_received": {
        const resp = obj(d["response"]);
        const inc = num(resp["budget_increase_usd"]);
        const iters = num(resp["iteration_increase"]);
        emit("run:message_received",
          `Human response: ${str(resp["action"]) || "?"}${inc ? ` (+$${inc})` : ""}${iters ? ` (+${iters} iterations)` : ""}`,
          d);
        break;
      }
      case "checkpoint_created": {
        const changed = Array.isArray(d["changed"]) ? d["changed"] : [];
        emit("checkpoint:created",
          `${str(d["label"])} — ${changed.length} file(s) changed (${str(d["sha"]).slice(0, 7)})`, d);
        break;
      }
      case "workspace_restored": {
        const paths = Array.isArray(d["paths"]) ? d["paths"] : [];
        emit("workspace:restored", `Rolled back ${paths.length} file(s) written by a failed attempt`, d);
        break;
      }
      case "run_finished": {
        const status = str(d["status"]);
        emit(FINISH_EVENT[status] ?? "run:error", `Run ${status || "finished"}`,
          { status, cost: { cost_usd: totalCostUsd } }, { agent_id: null });
        break;
      }
      case "subtask_finished":
        break; // the scheduler's bookkeeping; result_stored already shows the outcome
      default:
        emit(`session:${e.type}`, `Session event ${e.type}`, d);
    }
  }

  const events: TraceEvent[] = sortEvents(raws.map((raw) => parseTraceEvent(raw)));
  return {
    run_id: runId,
    events,
    eventTypes: extractEventTypes(events),
    timeRange: events.length ? extractTimeRange(events) : { startMs: 0, endMs: 0, durationMs: 0 },
    results,
    origin: "session",
    totalCostUsd,
  };
}

/** Whether a run can be resumed, judged from its session log's run-level events. */
export function sessionStatus(session: SessionEvent[]): "running" | "interrupted" | "complete" | "error" | "cancelled" {
  let status: ReturnType<typeof sessionStatus> = "running";
  for (const e of session) {
    if (e.type === "run_started" || e.type === "run_resumed") status = "running";
    else if (e.type === "run_interrupted") status = "interrupted";
    else if (e.type === "run_finished") {
      const s = str(e.data?.["status"]);
      // "interrupted" as a terminal status came from older AgentFlow reconciliation.
      status = s === "interrupted" ? "interrupted" : (s as "complete" | "error" | "cancelled") || "error";
    }
  }
  return status;
}
