/**
 * EventDetail — side panel that displays the full payload of a selected
 * TraceEvent, with rich event-specific sections above the raw JSON viewer.
 *
 * Sections rendered per event type
 * ----------------------------------
 * agent:progress (tool call)
 *   • Tool Call header: tool-name pill + "copy args" button
 *   • bash_exec / shell_exec  → bash code block
 *   • python_exec             → python code block
 *   • file_write / file_read  → path badge + content block
 *   • fetch_url family        → URL badge
 *   • read_skill              → skill + topic pills
 *   • generic tool            → argument key/value grid
 *
 * agent:progress (narrative)
 *   • Narrative prose block
 *
 * plan:created
 *   • Subtask table with IDs, agents, dependencies, instructions
 *
 * task:dispatched
 *   • Subtask→Task ID mapping card
 *
 * task:complete / task:partial / task:failed
 *   • Output text block + stats bar (tokens, duration, status)
 *
 * run:started / run:complete / run:error / run:budget_exceeded
 *   • Compact run-level info card
 *
 * All event types also show:
 *   • Common metadata (timestamp, seq, agent, run-id)
 *   • Message summary
 *   • Collapsible full JSON viewer
 */

import React from "react";
import {
  X, Clock, Hash, User, Tag,
  Terminal, FileText, Globe, BookOpen, Wrench,
  CheckCircle2, AlertTriangle, XCircle, Zap,
  ChevronDown, ChevronRight, Copy, Check,
  ArrowRight, Layers,
  ShieldCheck, ShieldAlert, ShieldQuestion, GitCommitHorizontal, Undo2, Split, CircleHelp,
} from "lucide-react";
import type { TraceEvent, Verification } from "../types/events";
import { EventType } from "../types/events";
import { EVENT_META } from "./timelineUtils";

// ─── Colour token helpers ────────────────────────────────────────────────────

const SECTION_LABEL = "text-xs font-semibold uppercase tracking-wide text-ink-subtle mb-3 flex items-center gap-1.5";

// ─── JSON renderer ───────────────────────────────────────────────────────────

function JsonToken({
  type,
  value,
}: {
  type: "key" | "string" | "number" | "boolean" | "null" | "punct";
  value: string;
}) {
  const colourMap: Record<typeof type, string> = {
    key:     "text-blue-700",
    string:  "text-gain",
    number:  "text-yellow-700",
    boolean: "text-orange-700",
    null:    "text-loss",
    punct:   "text-ink-muted",
  };
  return <span className={colourMap[type]}>{value}</span>;
}

function renderJson(value: unknown, indent: number): React.ReactNode {
  const pad      = "  ".repeat(indent);
  const padOuter = "  ".repeat(Math.max(0, indent - 1));

  if (value === null)            return <JsonToken type="null"    value="null" />;
  if (typeof value === "boolean") return <JsonToken type="boolean" value={String(value)} />;
  if (typeof value === "number")  return <JsonToken type="number"  value={String(value)} />;
  if (typeof value === "string")  return <JsonToken type="string"  value={JSON.stringify(value)} />;

  if (Array.isArray(value)) {
    if (value.length === 0)
      return (
        <>
          <JsonToken type="punct" value="[" />
          <JsonToken type="punct" value="]" />
        </>
      );
    return (
      <>
        <JsonToken type="punct" value="[" />
        {value.map((item, idx) => (
          <div key={idx} className="ml-4">
            {pad}{renderJson(item, indent + 1)}
            {idx < value.length - 1 && <JsonToken type="punct" value="," />}
          </div>
        ))}
        <div>
          {padOuter}
          <JsonToken type="punct" value="]" />
        </div>
      </>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0)
      return (
        <>
          <JsonToken type="punct" value="{" />
          <JsonToken type="punct" value="}" />
        </>
      );
    return (
      <>
        <JsonToken type="punct" value="{" />
        {entries.map(([k, v], idx) => (
          <div key={k} className="ml-4">
            {pad}
            <JsonToken type="key"   value={JSON.stringify(k)} />
            <JsonToken type="punct" value=": " />
            {renderJson(v, indent + 1)}
            {idx < entries.length - 1 && <JsonToken type="punct" value="," />}
          </div>
        ))}
        <div>
          {padOuter}
          <JsonToken type="punct" value="}" />
        </div>
      </>
    );
  }

  return <JsonToken type="string" value={JSON.stringify(String(value))} />;
}

// ─── Primitive UI helpers ────────────────────────────────────────────────────

function MetaRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-ink-muted shrink-0">{icon}</span>
      <span className="text-ink-subtle w-24 shrink-0">{label}</span>
      <span className="font-mono text-ink truncate">{value}</span>
    </div>
  );
}

/** Monospace code block with a syntax-language label and optional copy button. */
function CodeBlock({
  code,
  language = "bash",
  maxRows = 20,
}: {
  code: string;
  language?: string;
  maxRows?: number;
}) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }, [code]);

  const lines = code.split("\n");
  const truncated = lines.length > maxRows;
  const visible   = truncated ? lines.slice(0, maxRows).join("\n") + "\n…" : code;

  return (
    <div className="relative rounded-lg overflow-hidden border border-border bg-surface-muted">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-muted border-b border-border">
        <span className="text-xs font-mono text-ink-muted tracking-wide">{language}</span>
        <button
          type="button"
          aria-label="Copy code"
          onClick={handleCopy}
          className="
            flex items-center gap-1 px-2 py-0.5 rounded text-xs
            text-ink-muted hover:text-ink hover:bg-gray-100
            focus:outline-none focus-visible:ring-1 focus-visible:ring-accent
            transition-colors
          "
        >
          {copied
            ? <><Check className="w-3 h-3" aria-hidden /><span>Copied</span></>
            : <><Copy className="w-3 h-3" aria-hidden /><span>Copy</span></>}
        </button>
      </div>
      {/* Code body */}
      <pre
        className="
          overflow-x-auto p-4 text-xs leading-5 font-mono
          text-ink whitespace-pre
        "
        style={{ maxHeight: `${maxRows * 1.25 + 1}rem` }}
      >
        {visible}
      </pre>
      {truncated && (
        <div className="px-4 py-1.5 bg-surface-muted border-t border-border text-xs text-ink-subtle">
          {lines.length - maxRows} more line{lines.length - maxRows !== 1 ? "s" : ""} hidden
        </div>
      )}
    </div>
  );
}

/** Small coloured pill / badge. */
function Pill({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`
        inline-flex items-center gap-1 px-2 py-0.5 rounded-full
        text-xs font-medium
        ${className}
      `}
    >
      {children}
    </span>
  );
}

/** Key-value row used in the argument grid for generic tools. */
function ArgRow({ argKey, value }: { argKey: string; value: unknown }) {
  const display =
    typeof value === "string"
      ? value
      : JSON.stringify(value, null, 2);

  const isMultiline = display.includes("\n") || display.length > 80;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-mono text-blue-700">{argKey}</span>
      {isMultiline ? (
        <pre className="text-xs font-mono text-ink whitespace-pre-wrap break-words bg-surface-muted rounded p-2 border border-border">
          {display}
        </pre>
      ) : (
        <span className="text-xs font-mono text-gain break-all">&quot;{display}&quot;</span>
      )}
    </div>
  );
}

/** Section wrapper with consistent spacing. */
function Section({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`px-5 py-4 border-b border-border ${className}`}>
      {children}
    </section>
  );
}

/** Collapsible container used for the raw JSON section. */
function Collapsible({
  label,
  defaultOpen = false,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section className="px-5 py-4 border-b border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="
          flex items-center gap-2 w-full text-left
          text-xs font-semibold uppercase tracking-wide text-ink-subtle
          hover:text-ink focus:outline-none focus:text-ink
          transition-colors mb-1
        "
        aria-expanded={open}
      >
        {open
          ? <ChevronDown className="w-3.5 h-3.5 shrink-0" aria-hidden />
          : <ChevronRight className="w-3.5 h-3.5 shrink-0" aria-hidden />}
        {label}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}

// ─── Event-specific section renderers ────────────────────────────────────────

/**
 * Renders a tool-call input block. Dispatches to specialised renderers for
 * known tools; falls back to a generic key/value grid.
 */
function ToolCallSection({
  tool,
  input,
}: {
  tool: string;
  input: Record<string, unknown>;
}) {
  // ── bash / shell ──────────────────────────────────────────────────────────
  const BASH_TOOLS = new Set(["bash_exec", "shell_exec", "run_command", "exec"]);
  if (BASH_TOOLS.has(tool)) {
    const command  = typeof input.command  === "string" ? input.command
                   : typeof input.cmd     === "string" ? input.cmd
                   : typeof input.script  === "string" ? input.script
                   : Object.values(input).find((v) => typeof v === "string") as string | undefined
                     ?? "";
    const timeout  = input.timeout_seconds ?? input.timeout;
    const purpose  = typeof input.purpose === "string" ? input.purpose : null;

    return (
      <div className="space-y-3">
        {purpose && (
          <div>
            <p className="text-xs text-ink-subtle mb-1.5">Purpose</p>
            <div className="rounded-lg border border-border bg-surface-muted p-3">
              <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{purpose}</p>
            </div>
          </div>
        )}
        <CodeBlock code={command} language="bash" maxRows={30} />
        {timeout != null && (
          <div className="flex items-center gap-2 text-xs text-ink-subtle">
            <Clock className="w-3.5 h-3.5" aria-hidden />
            <span>Timeout: <span className="text-ink font-mono">{String(timeout)}s</span></span>
          </div>
        )}
      </div>
    );
  }

  // ── python ────────────────────────────────────────────────────────────────
  const PYTHON_TOOLS = new Set(["python_exec", "run_python", "python"]);
  if (PYTHON_TOOLS.has(tool)) {
    const code = typeof input.code === "string" ? input.code
               : typeof input.script === "string" ? input.script
               : Object.values(input).find((v) => typeof v === "string") as string | undefined
                 ?? "";
    const timeout = input.timeout_seconds ?? input.timeout;
    const purpose = typeof input.purpose === "string" ? input.purpose : null;

    return (
      <div className="space-y-3">
        {purpose && (
          <div>
            <p className="text-xs text-ink-subtle mb-1.5">Purpose</p>
            <div className="rounded-lg border border-border bg-surface-muted p-3">
              <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{purpose}</p>
            </div>
          </div>
        )}
        <CodeBlock code={code} language="python" maxRows={30} />
        {timeout != null && (
          <div className="flex items-center gap-2 text-xs text-ink-subtle">
            <Clock className="w-3.5 h-3.5" aria-hidden />
            <span>Timeout: <span className="text-ink font-mono">{String(timeout)}s</span></span>
          </div>
        )}
      </div>
    );
  }

  // ── file_write ────────────────────────────────────────────────────────────
  const FILE_WRITE_TOOLS = new Set(["file_write", "write_file", "file_append", "append_file"]);
  if (FILE_WRITE_TOOLS.has(tool)) {
    const path    = typeof input.path    === "string" ? input.path    : "—";
    const content = typeof input.content === "string" ? input.content : null;
    const mode    = typeof input.mode    === "string" ? input.mode    : null;

    return (
      <div className="space-y-3">
        {/* Path */}
        <div>
          <p className="text-xs text-ink-subtle mb-1.5">Path</p>
          <div className="flex items-center gap-2 bg-surface-muted rounded border border-border px-3 py-2">
            <FileText className="w-3.5 h-3.5 text-ink-muted shrink-0" aria-hidden />
            <span className="font-mono text-sm text-warn break-all">{path}</span>
          </div>
        </div>
        {/* Mode pill */}
        {mode && (
          <div className="flex items-center gap-2 text-xs text-ink-subtle">
            <span>Mode:</span>
            <Pill className="bg-gray-100 text-ink-muted">{mode}</Pill>
          </div>
        )}
        {/* Content */}
        {content != null && (
          <div>
            <p className="text-xs text-ink-subtle mb-1.5">Content</p>
            <CodeBlock
              code={content}
              language={guessLanguageFromPath(path)}
              maxRows={25}
            />
          </div>
        )}
        {/* Remaining args (e.g. start_line, end_line, pattern) */}
        {renderExtraArgs(input, ["path", "content", "mode"])}
      </div>
    );
  }

  // ── file_read ─────────────────────────────────────────────────────────────
  const FILE_READ_TOOLS = new Set(["file_read", "read_file"]);
  if (FILE_READ_TOOLS.has(tool)) {
    const path      = typeof input.path    === "string" ? input.path    : "—";
    const startLine = input.start_line;
    const endLine   = input.end_line;
    const pattern   = typeof input.pattern === "string" ? input.pattern : null;

    return (
      <div className="space-y-3">
        {/* Path */}
        <div>
          <p className="text-xs text-ink-subtle mb-1.5">Path</p>
          <div className="flex items-center gap-2 bg-surface-muted rounded border border-border px-3 py-2">
            <FileText className="w-3.5 h-3.5 text-ink-muted shrink-0" aria-hidden />
            <span className="font-mono text-sm text-warn break-all">{path}</span>
          </div>
        </div>
        {/* Line range */}
        {(startLine != null || endLine != null) && (
          <div className="flex items-center gap-4 text-xs text-ink-muted">
            {startLine != null && (
              <span>Start line: <span className="text-ink font-mono">{String(startLine)}</span></span>
            )}
            {endLine != null && (
              <span>End line: <span className="text-ink font-mono">{String(endLine)}</span></span>
            )}
          </div>
        )}
        {/* Pattern */}
        {pattern && (
          <div>
            <p className="text-xs text-ink-subtle mb-1.5">Pattern</p>
            <CodeBlock code={pattern} language="regex" maxRows={4} />
          </div>
        )}
        {/* Extra args (include_line_numbers, max_lines, context_lines …) */}
        {renderExtraArgs(input, ["path", "start_line", "end_line", "pattern"])}
      </div>
    );
  }

  // ── URL / HTTP fetch ──────────────────────────────────────────────────────
  const FETCH_TOOLS = new Set(["fetch_url", "http_fetch", "web_fetch", "fetch", "get_url", "request_url"]);
  if (FETCH_TOOLS.has(tool)) {
    const url    = typeof input.url    === "string" ? input.url    : "—";
    const method = typeof input.method === "string" ? input.method.toUpperCase() : "GET";

    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2">
          <Pill className="bg-blue-100 text-blue-800 shrink-0 mt-0.5">
            {method}
          </Pill>
          <div className="flex items-center gap-2 flex-1 bg-surface-muted rounded border border-border px-3 py-2 min-w-0">
            <Globe className="w-3.5 h-3.5 text-ink-muted shrink-0" aria-hidden />
            <span className="font-mono text-sm text-sky-700 break-all">{url}</span>
          </div>
        </div>
        {renderExtraArgs(input, ["url", "method"])}
      </div>
    );
  }

  // ── read_skill ────────────────────────────────────────────────────────────
  if (tool === "read_skill") {
    const skill = typeof input.skill === "string" ? input.skill : "—";
    const topic = typeof input.topic === "string" ? input.topic : "general";

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-purple-700" aria-hidden />
            <span className="text-xs text-ink-subtle">Skill</span>
            <Pill className="bg-purple-100 text-purple-800">{skill}</Pill>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-subtle">Topic</span>
            <Pill className="bg-gray-100 text-ink-muted">{topic}</Pill>
          </div>
        </div>
        {renderExtraArgs(input, ["skill", "topic"])}
      </div>
    );
  }

  // ── generic fallback ──────────────────────────────────────────────────────
  const entries = Object.entries(input);
  if (entries.length === 0) {
    return <p className="text-xs text-ink-subtle italic">No input arguments.</p>;
  }
  return (
    <div className="space-y-3">
      {entries.map(([k, v]) => (
        <ArgRow key={k} argKey={k} value={v} />
      ))}
    </div>
  );
}

/** Renders leftover (non-primary) input keys as ArgRow items. */
function renderExtraArgs(
  input: Record<string, unknown>,
  skip: string[],
): React.ReactNode {
  const skipSet = new Set(skip);
  const extras  = Object.entries(input).filter(([k]) => !skipSet.has(k));
  if (extras.length === 0) return null;

  return (
    <div className="space-y-2.5 border-t border-border pt-3 mt-1">
      <p className="text-xs text-ink-subtle font-semibold uppercase tracking-wide">Additional arguments</p>
      {extras.map(([k, v]) => (
        <ArgRow key={k} argKey={k} value={v} />
      ))}
    </div>
  );
}

/** Very rough guess at a file's language from its extension. */
function guessLanguageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const MAP: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", sh: "bash", bash: "bash", zsh: "bash",
    md: "markdown", json: "json", yaml: "yaml", yml: "yaml",
    css: "css", html: "html", sql: "sql", rs: "rust", go: "go",
  };
  return MAP[ext] ?? "text";
}

// ─── Per-event-type detail sections ──────────────────────────────────────────

/** agent:progress — either a tool call or a narrative message. */
function AgentProgressDetail({
  event,
  allEvents,
}: {
  event: Extract<TraceEvent, { type: typeof EventType.AgentProgress }>;
  allEvents?: TraceEvent[];
}) {
  const data = event.payload.data;
  const input = data?.input || null;

  // Look up the tool result linked by tool_call_id (top-level event field)
  const toolCallId = event.tool_call_id;
  const toolResult = React.useMemo(() => {
    if (!toolCallId || !allEvents) return null;
    return allEvents.find(
      (e) => e.type === EventType.AgentToolResult && e.tool_call_id === toolCallId,
    ) ?? null;
  }, [toolCallId, allEvents]);

  const [argsCopied, setArgsCopied] = React.useState(false);
  const handleCopyArgs = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(input, null, 2));
      setArgsCopied(true);
      setTimeout(() => setArgsCopied(false), 1600);
    } catch { /* ignore */ }
  }, [input]);


  if (data === null) {
    // Narrative progress — show as a readable prose block
    return (
      <Section>
        <p className={SECTION_LABEL}>
          <Zap className="w-3 h-3" aria-hidden />
          Narrative Progress
        </p>
        <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">
          {event.payload.message}
        </p>
      </Section>
    );
  }

  // Determine the tool's icon and accent colour
  const BASH_TOOLS   = new Set(["bash_exec", "shell_exec", "run_command", "exec"]);
  const PYTHON_TOOLS = new Set(["python_exec", "run_python", "python"]);
  const FILE_TOOLS   = new Set(["file_read", "read_file", "file_write", "write_file", "file_append", "append_file"]);
  const FETCH_TOOLS  = new Set(["fetch_url", "http_fetch", "web_fetch", "fetch", "get_url", "request_url"]);

  let ToolIcon: React.ElementType = Wrench;
  let iconCls = "text-ink-muted";
  let pillCls = "bg-gray-100 text-ink-muted";

  const tool = data.tool || "unknown_tool";

  if (BASH_TOOLS.has(tool)) {
    ToolIcon = Terminal;
    iconCls  = "text-warn";
    pillCls  = "bg-amber-100 text-amber-800";
  } else if (PYTHON_TOOLS.has(tool)) {
    ToolIcon = Terminal;
    iconCls  = "text-blue-700";
    pillCls  = "bg-blue-100 text-blue-800";
  } else if (FILE_TOOLS.has(tool)) {
    ToolIcon = FileText;
    iconCls  = "text-gain";
    pillCls  = "bg-emerald-100 text-emerald-800";
  } else if (FETCH_TOOLS.has(tool)) {
    ToolIcon = Globe;
    iconCls  = "text-sky-700";
    pillCls  = "bg-sky-100 text-sky-800";
  } else if (tool === "read_skill") {
    ToolIcon = BookOpen;
    iconCls  = "text-purple-700";
    pillCls  = "bg-purple-100 text-purple-800";
  }

  // Extract tool result data for rendering
  const resultData =
    toolResult?.type === EventType.AgentToolResult ? toolResult.payload.data : null;

  return (
    <>
      <Section>
        {/* ── Tool header bar ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <ToolIcon className={`w-4 h-4 shrink-0 ${iconCls}`} aria-hidden />
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Tool Call</p>
            <Pill className={pillCls}>{tool}</Pill>
          </div>
          <button
            type="button"
            aria-label="Copy input arguments as JSON"
            onClick={handleCopyArgs}
            className="
              flex items-center gap-1 px-2 py-1 rounded text-xs shrink-0
              text-ink-muted hover:text-ink hover:bg-gray-100
              border border-border hover:border-gray-400
              focus:outline-none focus-visible:ring-1 focus-visible:ring-accent
              transition-colors
            "
          >
            {argsCopied
              ? <><Check className="w-3 h-3" aria-hidden /><span>Copied</span></>
              : <><Copy className="w-3 h-3" aria-hidden /><span>Copy args</span></>}
          </button>
        </div>

        {/* ── Tool-specific argument rendering ─────────────────────────────── */}
        <ToolCallSection tool={tool} input={input || {}} />
      </Section>

      {/* ── Tool result section ───────────────────────────────────────────── */}
      {toolCallId && (
        <Section>
          <div className="flex items-center gap-2 mb-3">
            {toolResult == null ? (
              <>
                <span className="inline-block w-2 h-2 rounded-full bg-gray-400 animate-pulse" aria-hidden />
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Tool Result — pending</p>
              </>
            ) : resultData?.is_error ? (
              <>
                <XCircle className="w-3.5 h-3.5 text-loss shrink-0" aria-hidden />
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Tool Result — error</p>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-gain shrink-0" aria-hidden />
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Tool Result</p>
              </>
            )}
          </div>

          {resultData != null && (
            <div className={`rounded-lg border p-3 ${
              resultData.is_error
                ? "border-red-200 bg-loss-soft"
                : "border-border bg-surface-muted"
            }`}>
              {resultData.result ? (
                <pre className="text-xs font-mono text-ink whitespace-pre-wrap break-words leading-5 max-h-48 overflow-y-auto">
                  {resultData.result}
                </pre>
              ) : (
                <p className="text-xs text-ink-subtle italic">(no output)</p>
              )}
            </div>
          )}
        </Section>
      )}
    </>
  );
}

/** plan:created — subtask list */
function PlanCreatedDetail({
  event,
}: {
  event: Extract<TraceEvent, { type: typeof EventType.PlanCreated }>;
}) {
  const { subtasks } = event.payload.data;

  return (
    <Section>
      <p className={SECTION_LABEL}>
        <Layers className="w-3 h-3" aria-hidden />
        Subtasks ({subtasks.length})
      </p>
      <div className="space-y-3">
        {subtasks.map((st) => (
          <div
            key={st.id}
            className="rounded-lg border border-border bg-surface-muted p-3 space-y-2"
          >
            {/* ID + agent header */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-semibold text-blue-700">{st.id}</span>
              <ArrowRight className="w-3 h-3 text-ink-subtle shrink-0" aria-hidden />
              <span className="text-xs font-mono text-gain">{st.agent_id}</span>
              {st.depends_on.length > 0 && (
                <span className="ml-auto text-xs text-ink-subtle shrink-0">
                  depends on:{" "}
                  {st.depends_on.map((d) => (
                    <span key={d} className="font-mono text-warn">{d} </span>
                  ))}
                </span>
              )}
            </div>
            {/* Instruction */}
            <p className="text-xs text-ink leading-relaxed">{st.instruction}</p>
            {/* Expected output */}
            {st.expected_output && (
              <p className="text-xs text-ink-subtle italic border-t border-border pt-2 mt-1">
                Expected: {st.expected_output}
              </p>
            )}
            {/* Acceptance criteria — checked by an independent verifier */}
            {st.acceptance_criteria && st.acceptance_criteria.length > 0 && (
              <div className="border-t border-border pt-2 mt-1">
                <p className="text-xs text-gain flex items-center gap-1 mb-1">
                  <ShieldCheck className="w-3 h-3" aria-hidden /> Acceptance criteria (independently verified)
                </p>
                <ul className="text-xs text-ink-muted list-disc pl-5 space-y-0.5">
                  {st.acceptance_criteria.map((c) => <li key={c}>{c}</li>)}
                </ul>
              </div>
            )}
            {(st.model_tier || st.thinking_effort) && (
              <p className="text-xs text-ink-subtle">
                {st.model_tier && <span className="mr-3">tier: <span className="font-mono text-ink">{st.model_tier}</span></span>}
                {st.thinking_effort && <span>effort: <span className="font-mono text-ink">{st.thinking_effort}</span></span>}
              </p>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

/** task:dispatched — mapping card */
function TaskDispatchedDetail({
  event,
}: {
  event: Extract<TraceEvent, { type: typeof EventType.TaskDispatched }>;
}) {
  const { subtask_id, task_id } = event.payload.data;

  return (
    <Section>
      <p className={SECTION_LABEL}>
        <ArrowRight className="w-3 h-3" aria-hidden />
        Dispatch Mapping
      </p>
      <div className="flex items-center gap-3 bg-surface-muted rounded-lg border border-border px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-ink-subtle mb-1">Subtask ID</p>
          <p className="font-mono text-sm text-blue-700 truncate">{subtask_id}</p>
        </div>
        <ArrowRight className="w-4 h-4 text-ink-subtle shrink-0" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-ink-subtle mb-1">Task ID</p>
          <p className="font-mono text-sm text-gain truncate" title={task_id}>
            {task_id}
          </p>
        </div>
      </div>
    </Section>
  );
}

/** task:complete / task:partial / task:failed — output + stats */
/** task:complete / task:partial / task:failed — output + stats */
function TaskResultDetail({
  event,
}: {
  event: TraceEvent & { type: "task:complete" | "task:partial" | "task:failed" };
}) {
  const data = event.payload.data as Record<string, unknown> | null;
  if (!data) return null;

  const output    = data.output    as { text?: string; structured?: Record<string, unknown> } | undefined;
  const error     = typeof data.error    === "string" ? data.error    : null;
  const tokens    = typeof data.tokens_used  === "number" ? data.tokens_used  : null;
  const duration  = typeof data.duration_ms  === "number" ? data.duration_ms  : null;
  const status    = typeof data.status === "string" ? data.status : null;

  const isError   = event.type === EventType.TaskFailed;
  const isPartial = event.type === EventType.TaskPartial;

  return (
    <Section>
      {/* Status strip */}
      <div className="flex items-center gap-2 mb-4">
        {isError   && <XCircle      className="w-4 h-4 text-loss shrink-0"     aria-hidden />}
        {isPartial && <AlertTriangle className="w-4 h-4 text-warn shrink-0"  aria-hidden />}
        {!isError && !isPartial && <CheckCircle2 className="w-4 h-4 text-gain shrink-0" aria-hidden />}
        <p className={SECTION_LABEL + " mb-0"}>
          {isError ? "Task Failed" : isPartial ? "Partial Result" : "Task Output"}
        </p>
        {status && (
          <Pill
            className={
              isError   ? "bg-red-100 text-red-800 ml-auto"
            : isPartial ? "bg-amber-100 text-amber-800 ml-auto"
            : "bg-emerald-100 text-emerald-800 ml-auto"
            }
          >
            {status}
          </Pill>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-loss-soft px-4 py-3">
          <p className="text-xs text-loss font-semibold mb-1">Error</p>
          <p className="text-sm text-loss leading-relaxed whitespace-pre-wrap font-mono break-words">
            {error}
          </p>
        </div>
      )}

      {/* Output text */}
      {output?.text && (
        <div className="mb-3">
          <p className="text-xs text-ink-subtle mb-1.5">Output</p>
          <div className="rounded-lg border border-border bg-surface-muted p-3 max-h-48 overflow-y-auto">
            <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap font-mono break-words text-xs">
              {output.text}
            </p>
          </div>
        </div>
      )}

      {/* Structured output */}
      {output?.structured && Object.keys(output.structured).length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-ink-subtle mb-1.5">Structured Output</p>
          <div className="rounded-lg border border-border bg-surface-muted p-3 font-mono text-xs max-h-40 overflow-y-auto">
            {renderJson(output.structured, 1)}
          </div>
        </div>
      )}

      {/* Independent verification (session-log traces carry it on the result) */}
      {asVerification(data.verification) && (
        <div className="mb-3">
          <p className="text-xs text-ink-subtle mb-1.5">Verification</p>
          <VerificationBlock verification={asVerification(data.verification)!} />
        </div>
      )}
      {typeof data.checkpoint === "string" && (
        <p className="text-xs text-ink-subtle mb-3">
          Checkpoint <span className="font-mono text-ink">{data.checkpoint.slice(0, 12)}</span>
        </p>
      )}

      {/* Stats bar */}
      {(tokens != null || duration != null) && (
        <div className="flex items-center gap-5 mt-3 pt-3 border-t border-border text-xs text-ink-subtle">
          {tokens != null && (
            <span>
              Tokens:{" "}
              <span className="text-ink font-mono font-semibold">
                {tokens.toLocaleString()}
              </span>
            </span>
          )}
          {duration != null && (
            <span>
              Duration:{" "}
              <span className="text-ink font-mono font-semibold">
                {duration < 1000
                  ? `${duration}ms`
                  : `${(duration / 1000).toFixed(2)}s`}
              </span>
            </span>
          )}
        </div>
      )}
    </Section>
  );
}

/** Verdict table shared by task:verified and task results that carry one. */
function VerificationBlock({ verification }: { verification: Verification }) {
  const { passed, checks, summary, repairs } = verification;
  const Icon = passed === true ? ShieldCheck : passed === false ? ShieldAlert : ShieldQuestion;
  const tone = passed === true ? "text-gain" : passed === false ? "text-loss" : "text-warn";
  const label = passed === true ? "Passed" : passed === false ? "Failed" : "Inconclusive (counted as a pass)";
  return (
    <div className="space-y-2">
      <p className={`text-sm font-semibold flex items-center gap-2 ${tone}`}>
        <Icon className="w-4 h-4" aria-hidden /> {label}
        {repairs > 0 && <span className="text-xs font-normal text-ink-muted">after {repairs} repair round{repairs !== 1 ? "s" : ""}</span>}
      </p>
      {summary && <p className="text-xs text-ink-muted">{summary}</p>}
      {checks.length > 0 && (
        <ul className="space-y-1.5">
          {checks.map((c) => (
            <li key={c.criterion} className="rounded-md border border-border bg-surface-muted px-3 py-2">
              <p className="text-xs flex items-start gap-2">
                {c.met
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-gain shrink-0 mt-0.5" aria-hidden />
                  : <XCircle className="w-3.5 h-3.5 text-loss shrink-0 mt-0.5" aria-hidden />}
                <span className="text-ink">{c.criterion}</span>
              </p>
              {c.evidence && <p className="text-xs text-ink-subtle pl-5 mt-0.5">{c.evidence}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function asVerification(value: unknown): Verification | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Partial<Verification>;
  return {
    passed: v.passed === true ? true : v.passed === false ? false : null,
    checks: Array.isArray(v.checks) ? v.checks : [],
    summary: typeof v.summary === "string" ? v.summary : "",
    repairs: typeof v.repairs === "number" ? v.repairs : 0,
  };
}

/** task:verified — the independent verifier's verdict. */
function TaskVerifiedDetail({ event }: { event: TraceEvent }) {
  const data = event.payload.data as Record<string, unknown> | null;
  const verification = asVerification(data?.["verification"]);
  if (!verification) return null;
  return (
    <Section>
      <p className={SECTION_LABEL}>
        <ShieldCheck className="w-3 h-3" aria-hidden />
        Verification of {String(data?.["subtask_id"] ?? "subtask")}
      </p>
      <VerificationBlock verification={verification} />
    </Section>
  );
}

/** checkpoint:created / workspace:restored / task:decomposed — file and step lists. */
function SessionFactDetail({ event }: { event: TraceEvent }) {
  const data = (event.payload.data ?? {}) as Record<string, unknown>;
  const list = (key: string) => (Array.isArray(data[key]) ? (data[key] as unknown[]) : []);
  if (event.type === EventType.CheckpointCreated) {
    const changed = list("changed").map(String);
    return (
      <Section>
        <p className={SECTION_LABEL}><GitCommitHorizontal className="w-3 h-3" aria-hidden /> Workspace checkpoint</p>
        <p className="text-xs text-ink-muted mb-2">Commit <span className="font-mono text-ink">{String(data["sha"] ?? "")}</span> in the run's shadow repository.</p>
        <p className="text-xs text-ink-subtle mb-1">Changed files ({changed.length})</p>
        <ul className="text-xs font-mono text-ink space-y-0.5 max-h-48 overflow-y-auto">{changed.map((p) => <li key={p}>{p}</li>)}</ul>
      </Section>
    );
  }
  if (event.type === EventType.WorkspaceRestored) {
    const paths = list("paths").map(String);
    return (
      <Section>
        <p className={SECTION_LABEL}><Undo2 className="w-3 h-3" aria-hidden /> Rolled back before the retry</p>
        <p className="text-xs text-ink-muted mb-2">Files the failed attempt wrote, restored to the subtask's starting snapshot (new files removed).</p>
        <ul className="text-xs font-mono text-ink space-y-0.5">{paths.map((p) => <li key={p}>{p}</li>)}</ul>
      </Section>
    );
  }
  if (event.type === EventType.TaskDecomposed) {
    const micro = list("micro") as { id?: string; instruction?: string; depends_on?: string[] }[];
    return (
      <Section>
        <p className={SECTION_LABEL}><Split className="w-3 h-3" aria-hidden /> Micro-steps ({micro.length})</p>
        <ul className="space-y-1.5">
          {micro.map((m) => (
            <li key={m.id} className="text-xs">
              <span className="font-mono text-sky-700">{m.id}</span>
              {m.depends_on && m.depends_on.length > 0 && <span className="text-ink-subtle"> ← {m.depends_on.join(", ")}</span>}
              <p className="text-ink-muted line-clamp-3">{m.instruction}</p>
            </li>
          ))}
        </ul>
      </Section>
    );
  }
  if (event.type === EventType.Other) {
    return (
      <Section>
        <p className={SECTION_LABEL}><CircleHelp className="w-3 h-3" aria-hidden /> Unrecognised event</p>
        <p className="text-xs text-ink-muted">
          Type <span className="font-mono text-ink">{String(data["original_type"] ?? "?")}</span> is newer than this
          viewer. It is shown as-is; see the full payload below.
        </p>
      </Section>
    );
  }
  return null;
}

/** run:complete / run:error / run:budget_exceeded — compact run summary. */
function RunSummaryDetail({ event }: { event: TraceEvent }) {
  const data = event.payload.data as Record<string, unknown> | null;
  if (!data || Object.keys(data).length === 0) return null;

  const isError   = event.type === EventType.RunError;
  const isBudget  = event.type === EventType.RunBudgetExceeded;
  const isSuccess = event.type === EventType.RunComplete;

  const error   = typeof data.error   === "string" ? data.error   : null;
  const reason  = typeof data.reason  === "string" ? data.reason  : null;
  const tokens  = typeof data.tokens_used  === "number" ? data.tokens_used  : null;
  const duration = typeof data.duration_ms  === "number" ? data.duration_ms  : null;

  return (
    <Section>
      <div className="flex items-center gap-2 mb-4">
        {isError   && <XCircle      className="w-4 h-4 text-loss"     aria-hidden />}
        {isBudget  && <AlertTriangle className="w-4 h-4 text-loss"   aria-hidden />}
        {isSuccess && <CheckCircle2 className="w-4 h-4 text-gain"   aria-hidden />}
        <p className={SECTION_LABEL + " mb-0"}>
          {isError ? "Run Error" : isBudget ? "Budget Exceeded" : "Run Summary"}
        </p>
      </div>

      {(error || reason) && (
        <div className={`mb-3 rounded-lg border px-4 py-3 ${
          isError  ? "border-red-200 bg-loss-soft"
          : isBudget ? "border-pink-200 bg-pink-50"
          : "border-border bg-surface-muted"
        }`}>
          <p className={`text-xs font-semibold mb-1 ${
            isError ? "text-loss" : isBudget ? "text-loss" : "text-ink-muted"
          }`}>
            {error ? "Error" : "Reason"}
          </p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words font-mono text-ink">
            {error ?? reason}
          </p>
        </div>
      )}

      {(tokens != null || duration != null) && (
        <div className="flex items-center gap-5 text-xs text-ink-subtle">
          {tokens != null && (
            <span>Total tokens: <span className="text-ink font-mono font-semibold">{tokens.toLocaleString()}</span></span>
          )}
          {duration != null && (
            <span>Duration: <span className="text-ink font-mono font-semibold">
              {duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(2)}s`}
            </span></span>
          )}
        </div>
      )}
    </Section>
  );
}

// ─── Main EventDetail component ───────────────────────────────────────────────

export interface EventDetailProps {
  event: TraceEvent | null;
  onClose: () => void;
  /** Full (unfiltered) event list — used to look up linked tool results. */
  allEvents?: TraceEvent[];
}

export function EventDetail({ event, onClose, allEvents }: EventDetailProps) {
  // Close on Escape
  React.useEffect(() => {
    if (!event) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [event, onClose]);

  // Focus the panel only on initial open (null → event), not on every event change.
  // Re-focusing on every change would steal focus from the timeline row and break
  // keyboard navigation (ArrowUp/Down would scroll the detail pane instead).
  const panelRef = React.useRef<HTMLDivElement>(null);
  const prevEventRef = React.useRef<TraceEvent | null>(null);
  React.useEffect(() => {
    if (event && !prevEventRef.current) {
      panelRef.current?.focus();
    }
    prevEventRef.current = event;
  }, [event]);

  if (!event) return null;

  const meta = EVENT_META[event.type];
  const ts   = new Date(event.ts).toISOString().replace("T", " ").replace("Z", " UTC");
  const agentLabel = event.agent_id ?? "—";

  const fullPayload: Record<string, unknown> = {
    run_id:   event.run_id,
    seq:      event.seq,
    ts:       event.ts,
    type:     event.type,
    agent_id: event.agent_id,
    ...(event.turn_index   != null ? { turn_index:   event.turn_index   } : {}),
    ...(event.tool_call_id != null ? { tool_call_id: event.tool_call_id } : {}),
    payload:  event.payload,
  };

  // Determine whether this event type has a rich specific section
  // (if so we render message only in a small summary; if not we give it more space)
  const hasSpecificSection =
    event.type === EventType.AgentProgress ||
    event.type === EventType.PlanCreated   ||
    event.type === EventType.TaskDispatched ||
    event.type === EventType.TaskComplete  ||
    event.type === EventType.TaskPartial   ||
    event.type === EventType.TaskFailed    ||
    event.type === EventType.RunComplete   ||
    event.type === EventType.RunError      ||
    event.type === EventType.RunBudgetExceeded ||
    event.type === EventType.TaskVerified  ||
    event.type === EventType.CheckpointCreated ||
    event.type === EventType.WorkspaceRestored ||
    event.type === EventType.TaskDecomposed;

  return (
    <aside
      ref={panelRef}
      className="event-detail-pane"
      tabIndex={-1}
      aria-label={`Event detail: ${event.type}`}
    >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border sticky top-0 bg-surface z-10">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${meta.badge}`}
            >
              {meta.label}
            </span>
            <span className="text-ink text-sm font-medium truncate">Event #{event.seq}</span>
          </div>
          <button
            type="button"
            aria-label="Close detail panel"
            onClick={onClose}
            className="
              flex items-center justify-center w-8 h-8 rounded-md shrink-0
              text-ink-muted hover:text-ink hover:bg-gray-100
              focus:outline-none focus-visible:ring-2 focus-visible:ring-accent
              transition-colors
            "
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </header>

        {/* ── Common metadata ────────────────────────────────────────────── */}
        <Section className="space-y-2.5">
          <MetaRow icon={<Clock className="w-3.5 h-3.5" />} label="Timestamp"  value={ts} />
          <MetaRow icon={<Hash  className="w-3.5 h-3.5" />} label="Sequence"   value={String(event.seq)} />
          <MetaRow icon={<User  className="w-3.5 h-3.5" />} label="Agent"      value={agentLabel} />
          <MetaRow icon={<Tag   className="w-3.5 h-3.5" />} label="Run ID"     value={event.run_id} />
        </Section>

        {/* ── Message summary (compact when a richer section follows) ─────── */}
        <Section>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle mb-1.5">Message</p>
          <p className="text-sm text-ink leading-relaxed">{event.payload.message}</p>
        </Section>

        {/* ── Event-specific rich sections ─────────────────────────────────── */}

        {event.type === EventType.AgentProgress && (
          <AgentProgressDetail event={event} allEvents={allEvents} />
        )}

        {event.type === EventType.PlanCreated && (
          <PlanCreatedDetail event={event} />
        )}

        {event.type === EventType.TaskDispatched && (
          <TaskDispatchedDetail event={event} />
        )}

        {(event.type === EventType.TaskComplete ||
          event.type === EventType.TaskPartial  ||
          event.type === EventType.TaskFailed) && (
          /* TaskResultDetail accepts the narrowed union */ 
          <TaskResultDetail
            event={event as Extract<TraceEvent, { type: "task:complete" | "task:partial" | "task:failed" }>}
          />
        )}

        {(event.type === EventType.RunComplete       ||
          event.type === EventType.RunError          ||
          event.type === EventType.RunBudgetExceeded) && (
          <RunSummaryDetail event={event} />
        )}

        {event.type === EventType.TaskVerified && <TaskVerifiedDetail event={event} />}

        {(event.type === EventType.CheckpointCreated ||
          event.type === EventType.WorkspaceRestored ||
          event.type === EventType.TaskDecomposed    ||
          event.type === EventType.Other) && <SessionFactDetail event={event} />}

        {/* ── Collapsible raw JSON ──────────────────────────────────────── */}
        <Collapsible
          label="Full Event Payload"
          defaultOpen={!hasSpecificSection}
        >
          <div
            className="
              overflow-auto rounded-lg
              bg-surface-muted border border-border
              p-4 font-mono text-xs leading-5
              text-ink max-h-96
            "
          >
            {renderJson(fullPayload, 1)}
          </div>
        </Collapsible>

        {/* ── Footer — copy JSON ────────────────────────────────────────── */}
        <footer className="px-5 py-3 border-t border-border mt-auto bg-surface">
          <CopyButton json={fullPayload} />
        </footer>
    </aside>
  );
}

// ─── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ json }: { json: unknown }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(json, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard API unavailable */
    }
  }, [json]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="
        w-full h-8 rounded-md text-sm font-medium
        bg-surface hover:bg-surface-muted
        text-ink hover:text-ink
        border border-border-strong
        focus:outline-none focus-visible:ring-2 focus-visible:ring-accent
        transition-colors
      "
    >
      {copied ? "Copied" : "Copy JSON"}
    </button>
  );
}
