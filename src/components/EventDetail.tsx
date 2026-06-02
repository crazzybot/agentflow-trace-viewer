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
} from "lucide-react";
import type { TraceEvent } from "../types/events";
import { EventType } from "../types/events";
import { EVENT_META } from "./timelineUtils";

// ─── Colour token helpers ────────────────────────────────────────────────────

const SECTION_LABEL = "text-xs uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-1.5";

// ─── JSON renderer ───────────────────────────────────────────────────────────

function JsonToken({
  type,
  value,
}: {
  type: "key" | "string" | "number" | "boolean" | "null" | "punct";
  value: string;
}) {
  const colourMap: Record<typeof type, string> = {
    key:     "text-blue-400",
    string:  "text-green-400",
    number:  "text-yellow-400",
    boolean: "text-orange-400",
    null:    "text-red-400",
    punct:   "text-gray-400",
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
      <span className="text-gray-400 shrink-0">{icon}</span>
      <span className="text-gray-500 w-24 shrink-0">{label}</span>
      <span className="font-mono text-gray-200 truncate">{value}</span>
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
    <div className="relative rounded-lg overflow-hidden border border-gray-700 bg-gray-950">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800/80 border-b border-gray-700">
        <span className="text-xs font-mono text-gray-400 tracking-wide">{language}</span>
        <button
          type="button"
          aria-label="Copy code"
          onClick={handleCopy}
          className="
            flex items-center gap-1 px-2 py-0.5 rounded text-xs
            text-gray-400 hover:text-white hover:bg-gray-700
            focus:outline-none focus:ring-1 focus:ring-blue-500
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
          text-gray-200 whitespace-pre
        "
        style={{ maxHeight: `${maxRows * 1.25 + 1}rem` }}
      >
        {visible}
      </pre>
      {truncated && (
        <div className="px-4 py-1.5 bg-gray-800/60 border-t border-gray-700 text-xs text-gray-500">
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
        inline-flex items-center gap-1 px-2.5 py-1 rounded-full
        text-xs font-semibold tracking-wide
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
      <span className="text-xs font-mono text-blue-400">{argKey}</span>
      {isMultiline ? (
        <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap break-words bg-gray-950 rounded p-2 border border-gray-800">
          {display}
        </pre>
      ) : (
        <span className="text-xs font-mono text-green-400 break-all">&quot;{display}&quot;</span>
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
    <section className={`px-5 py-4 border-b border-gray-700 ${className}`}>
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
    <section className="px-5 py-4 border-b border-gray-700">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="
          flex items-center gap-2 w-full text-left
          text-xs uppercase tracking-widest text-gray-500
          hover:text-gray-300 focus:outline-none focus:text-gray-300
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
            <p className="text-xs text-gray-500 mb-1.5">Purpose</p>
            <div className="rounded-lg border border-gray-700 bg-gray-950 p-3">
              <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{purpose}</p>
            </div>
          </div>
        )}
        <CodeBlock code={command} language="bash" maxRows={30} />
        {timeout != null && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Clock className="w-3.5 h-3.5" aria-hidden />
            <span>Timeout: <span className="text-gray-300 font-mono">{String(timeout)}s</span></span>
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
            <p className="text-xs text-gray-500 mb-1.5">Purpose</p>
            <div className="rounded-lg border border-gray-700 bg-gray-950 p-3">
              <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{purpose}</p>
            </div>
          </div>
        )}
        <CodeBlock code={code} language="python" maxRows={30} />
        {timeout != null && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Clock className="w-3.5 h-3.5" aria-hidden />
            <span>Timeout: <span className="text-gray-300 font-mono">{String(timeout)}s</span></span>
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
          <p className="text-xs text-gray-500 mb-1.5">Path</p>
          <div className="flex items-center gap-2 bg-gray-950 rounded border border-gray-800 px-3 py-2">
            <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" aria-hidden />
            <span className="font-mono text-sm text-amber-300 break-all">{path}</span>
          </div>
        </div>
        {/* Mode pill */}
        {mode && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>Mode:</span>
            <Pill className="bg-gray-800 text-gray-300 ring-1 ring-gray-700">{mode}</Pill>
          </div>
        )}
        {/* Content */}
        {content != null && (
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Content</p>
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
          <p className="text-xs text-gray-500 mb-1.5">Path</p>
          <div className="flex items-center gap-2 bg-gray-950 rounded border border-gray-800 px-3 py-2">
            <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" aria-hidden />
            <span className="font-mono text-sm text-amber-300 break-all">{path}</span>
          </div>
        </div>
        {/* Line range */}
        {(startLine != null || endLine != null) && (
          <div className="flex items-center gap-4 text-xs text-gray-400">
            {startLine != null && (
              <span>Start line: <span className="text-gray-200 font-mono">{String(startLine)}</span></span>
            )}
            {endLine != null && (
              <span>End line: <span className="text-gray-200 font-mono">{String(endLine)}</span></span>
            )}
          </div>
        )}
        {/* Pattern */}
        {pattern && (
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Pattern</p>
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
          <Pill className="bg-blue-900/60 text-blue-300 ring-1 ring-blue-500/40 shrink-0 mt-0.5">
            {method}
          </Pill>
          <div className="flex items-center gap-2 flex-1 bg-gray-950 rounded border border-gray-800 px-3 py-2 min-w-0">
            <Globe className="w-3.5 h-3.5 text-gray-400 shrink-0" aria-hidden />
            <span className="font-mono text-sm text-sky-300 break-all">{url}</span>
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
            <BookOpen className="w-3.5 h-3.5 text-purple-400" aria-hidden />
            <span className="text-xs text-gray-500">Skill</span>
            <Pill className="bg-purple-900/60 text-purple-300 ring-1 ring-purple-500/40">{skill}</Pill>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Topic</span>
            <Pill className="bg-gray-800 text-gray-300 ring-1 ring-gray-700">{topic}</Pill>
          </div>
        </div>
        {renderExtraArgs(input, ["skill", "topic"])}
      </div>
    );
  }

  // ── generic fallback ──────────────────────────────────────────────────────
  const entries = Object.entries(input);
  if (entries.length === 0) {
    return <p className="text-xs text-gray-500 italic">No input arguments.</p>;
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
    <div className="space-y-2.5 border-t border-gray-800 pt-3 mt-1">
      <p className="text-xs text-gray-600 uppercase tracking-widest">Additional arguments</p>
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
}: {
  event: Extract<TraceEvent, { type: typeof EventType.AgentProgress }>;
}) {
  const data = event.payload.data;

  if (data === null) {
    // Narrative progress — show as a readable prose block
    return (
      <Section>
        <p className={SECTION_LABEL}>
          <Zap className="w-3 h-3" aria-hidden />
          Narrative Progress
        </p>
        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
          {event.payload.message}
        </p>
      </Section>
    );
  }

  const { tool, input } = data;

  // Determine the tool's icon and accent colour
  const BASH_TOOLS   = new Set(["bash_exec", "shell_exec", "run_command", "exec"]);
  const PYTHON_TOOLS = new Set(["python_exec", "run_python", "python"]);
  const FILE_TOOLS   = new Set(["file_read", "read_file", "file_write", "write_file", "file_append", "append_file"]);
  const FETCH_TOOLS  = new Set(["fetch_url", "http_fetch", "web_fetch", "fetch", "get_url", "request_url"]);

  let ToolIcon: React.ElementType = Wrench;
  let iconCls = "text-gray-400";
  let pillCls = "bg-gray-800 text-gray-300 ring-1 ring-gray-700";

  if (BASH_TOOLS.has(tool)) {
    ToolIcon = Terminal;
    iconCls  = "text-amber-400";
    pillCls  = "bg-amber-900/50 text-amber-300 ring-1 ring-amber-500/40";
  } else if (PYTHON_TOOLS.has(tool)) {
    ToolIcon = Terminal;
    iconCls  = "text-blue-400";
    pillCls  = "bg-blue-900/50 text-blue-300 ring-1 ring-blue-500/40";
  } else if (FILE_TOOLS.has(tool)) {
    ToolIcon = FileText;
    iconCls  = "text-emerald-400";
    pillCls  = "bg-emerald-900/50 text-emerald-300 ring-1 ring-emerald-500/40";
  } else if (FETCH_TOOLS.has(tool)) {
    ToolIcon = Globe;
    iconCls  = "text-sky-400";
    pillCls  = "bg-sky-900/50 text-sky-300 ring-1 ring-sky-500/40";
  } else if (tool === "read_skill") {
    ToolIcon = BookOpen;
    iconCls  = "text-purple-400";
    pillCls  = "bg-purple-900/50 text-purple-300 ring-1 ring-purple-500/40";
  }

  const [argsCopied, setArgsCopied] = React.useState(false);
  const handleCopyArgs = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(input, null, 2));
      setArgsCopied(true);
      setTimeout(() => setArgsCopied(false), 1600);
    } catch { /* ignore */ }
  }, [input]);

  return (
    <Section>
      {/* ── Tool header bar ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <ToolIcon className={`w-4 h-4 shrink-0 ${iconCls}`} aria-hidden />
          <p className="text-xs uppercase tracking-widest text-gray-500">Tool Call</p>
          <Pill className={pillCls}>{tool}</Pill>
        </div>
        <button
          type="button"
          aria-label="Copy input arguments as JSON"
          onClick={handleCopyArgs}
          className="
            flex items-center gap-1 px-2 py-1 rounded text-xs shrink-0
            text-gray-400 hover:text-white hover:bg-gray-700
            border border-gray-700 hover:border-gray-600
            focus:outline-none focus:ring-1 focus:ring-blue-500
            transition-colors
          "
        >
          {argsCopied
            ? <><Check className="w-3 h-3" aria-hidden /><span>Copied</span></>
            : <><Copy className="w-3 h-3" aria-hidden /><span>Copy args</span></>}
        </button>
      </div>

      {/* ── Tool-specific argument rendering ─────────────────────────────── */}
      <ToolCallSection tool={tool} input={input} />
    </Section>
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
            className="rounded-lg border border-gray-700 bg-gray-800/40 p-3 space-y-2"
          >
            {/* ID + agent header */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-semibold text-blue-400">{st.id}</span>
              <ArrowRight className="w-3 h-3 text-gray-600 shrink-0" aria-hidden />
              <span className="text-xs font-mono text-emerald-400">{st.agent_id}</span>
              {st.depends_on.length > 0 && (
                <span className="ml-auto text-xs text-gray-500 shrink-0">
                  depends on:{" "}
                  {st.depends_on.map((d) => (
                    <span key={d} className="font-mono text-amber-400">{d} </span>
                  ))}
                </span>
              )}
            </div>
            {/* Instruction */}
            <p className="text-xs text-gray-300 leading-relaxed">{st.instruction}</p>
            {/* Expected output */}
            {st.expected_output && (
              <p className="text-xs text-gray-500 italic border-t border-gray-700/60 pt-2 mt-1">
                Expected: {st.expected_output}
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
      <div className="flex items-center gap-3 bg-gray-800/50 rounded-lg border border-gray-700 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 mb-1">Subtask ID</p>
          <p className="font-mono text-sm text-blue-300 truncate">{subtask_id}</p>
        </div>
        <ArrowRight className="w-4 h-4 text-gray-500 shrink-0" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 mb-1">Task ID</p>
          <p className="font-mono text-sm text-emerald-300 truncate" title={task_id}>
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
        {isError   && <XCircle      className="w-4 h-4 text-red-400 shrink-0"     aria-hidden />}
        {isPartial && <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0"  aria-hidden />}
        {!isError && !isPartial && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden />}
        <p className={SECTION_LABEL + " mb-0"}>
          {isError ? "Task Failed" : isPartial ? "Partial Result" : "Task Output"}
        </p>
        {status && (
          <Pill
            className={
              isError   ? "bg-red-900/60 text-red-300 ring-1 ring-red-500/40 ml-auto"
            : isPartial ? "bg-amber-900/60 text-amber-300 ring-1 ring-amber-500/40 ml-auto"
            : "bg-emerald-900/60 text-emerald-300 ring-1 ring-emerald-500/40 ml-auto"
            }
          >
            {status}
          </Pill>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-3 rounded-lg border border-red-800/60 bg-red-950/30 px-4 py-3">
          <p className="text-xs text-red-400 font-semibold mb-1">Error</p>
          <p className="text-sm text-red-300 leading-relaxed whitespace-pre-wrap font-mono break-words">
            {error}
          </p>
        </div>
      )}

      {/* Output text */}
      {output?.text && (
        <div className="mb-3">
          <p className="text-xs text-gray-500 mb-1.5">Output</p>
          <div className="rounded-lg border border-gray-700 bg-gray-950 p-3 max-h-48 overflow-y-auto">
            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap font-mono break-words text-xs">
              {output.text}
            </p>
          </div>
        </div>
      )}

      {/* Structured output */}
      {output?.structured && Object.keys(output.structured).length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-gray-500 mb-1.5">Structured Output</p>
          <div className="rounded-lg border border-gray-700 bg-gray-950 p-3 font-mono text-xs max-h-40 overflow-y-auto">
            {renderJson(output.structured, 1)}
          </div>
        </div>
      )}

      {/* Stats bar */}
      {(tokens != null || duration != null) && (
        <div className="flex items-center gap-5 mt-3 pt-3 border-t border-gray-800 text-xs text-gray-500">
          {tokens != null && (
            <span>
              Tokens:{" "}
              <span className="text-gray-300 font-mono font-semibold">
                {tokens.toLocaleString()}
              </span>
            </span>
          )}
          {duration != null && (
            <span>
              Duration:{" "}
              <span className="text-gray-300 font-mono font-semibold">
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
        {isError   && <XCircle      className="w-4 h-4 text-red-400"     aria-hidden />}
        {isBudget  && <AlertTriangle className="w-4 h-4 text-pink-400"   aria-hidden />}
        {isSuccess && <CheckCircle2 className="w-4 h-4 text-green-400"   aria-hidden />}
        <p className={SECTION_LABEL + " mb-0"}>
          {isError ? "Run Error" : isBudget ? "Budget Exceeded" : "Run Summary"}
        </p>
      </div>

      {(error || reason) && (
        <div className={`mb-3 rounded-lg border px-4 py-3 ${
          isError  ? "border-red-800/60 bg-red-950/30"
          : isBudget ? "border-pink-800/60 bg-pink-950/30"
          : "border-gray-700 bg-gray-800/40"
        }`}>
          <p className={`text-xs font-semibold mb-1 ${
            isError ? "text-red-400" : isBudget ? "text-pink-400" : "text-gray-400"
          }`}>
            {error ? "Error" : "Reason"}
          </p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words font-mono text-gray-300">
            {error ?? reason}
          </p>
        </div>
      )}

      {(tokens != null || duration != null) && (
        <div className="flex items-center gap-5 text-xs text-gray-500">
          {tokens != null && (
            <span>Total tokens: <span className="text-gray-300 font-mono font-semibold">{tokens.toLocaleString()}</span></span>
          )}
          {duration != null && (
            <span>Duration: <span className="text-gray-300 font-mono font-semibold">
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
}

export function EventDetail({ event, onClose }: EventDetailProps) {
  // Close on Escape
  React.useEffect(() => {
    if (!event) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [event, onClose]);

  // Focus the panel when it opens
  const panelRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (event) panelRef.current?.focus();
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
    event.type === EventType.RunBudgetExceeded;

  return (
    <aside
      ref={panelRef}
      className="event-detail-pane"
      tabIndex={-1}
      aria-label={`Event detail: ${event.type}`}
    >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-700 sticky top-0 bg-gray-900 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide ${meta.badge}`}
            >
              {meta.label}
            </span>
            <span className="text-gray-300 text-sm font-medium truncate">Event #{event.seq}</span>
          </div>
          <button
            type="button"
            aria-label="Close detail panel"
            onClick={onClose}
            className="
              flex items-center justify-center w-8 h-8 rounded-md shrink-0
              text-gray-400 hover:text-white hover:bg-gray-700
              focus:outline-none focus:ring-2 focus:ring-blue-500
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
          <p className="text-xs uppercase tracking-widest text-gray-500 mb-1.5">Message</p>
          <p className="text-sm text-gray-200 leading-relaxed">{event.payload.message}</p>
        </Section>

        {/* ── Event-specific rich sections ─────────────────────────────────── */}

        {event.type === EventType.AgentProgress && (
          <AgentProgressDetail event={event} />
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

        {/* ── Collapsible raw JSON ──────────────────────────────────────── */}
        <Collapsible
          label="Full Event Payload"
          defaultOpen={!hasSpecificSection}
        >
          <div
            className="
              overflow-auto rounded-lg
              bg-gray-950 border border-gray-800
              p-4 font-mono text-xs leading-5
              text-gray-300 max-h-96
            "
          >
            {renderJson(fullPayload, 1)}
          </div>
        </Collapsible>

        {/* ── Footer — copy JSON ────────────────────────────────────────── */}
        <footer className="px-5 py-3 border-t border-gray-700 mt-auto bg-gray-900">
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
        w-full py-2 rounded-md text-sm font-medium
        bg-gray-800 hover:bg-gray-700
        text-gray-300 hover:text-white
        border border-gray-700
        focus:outline-none focus:ring-2 focus:ring-blue-500
        transition-colors
      "
    >
      {copied ? "✓ Copied!" : "Copy JSON"}
    </button>
  );
}
