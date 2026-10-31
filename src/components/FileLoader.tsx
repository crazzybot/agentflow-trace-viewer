/**
 * FileLoader — drag-and-drop + file-picker component for loading a trace file.
 *
 * Accepts:
 *  - A local JSON / JSONL file via the OS file picker or drag-and-drop.
 *  - A "Load sample trace" shortcut that fetches /sample-trace.json.
 *
 * Props
 * -----
 * - `onLoad(text, fileName)` — called with the raw file text once loaded.
 * - `isLoading`              — shows a spinner while the parent is parsing.
 * - `error`                  — error string to display beneath the zone.
 */

import React from "react";
import { UploadCloud, FileJson, Loader2, AlertCircle, FlaskConical } from "lucide-react";

export interface FileLoaderProps {
  onLoad: (text: string, fileName: string) => void;
  isLoading?: boolean;
  error?: string | null;
}

export function FileLoader({ onLoad, isLoading = false, error = null }: FileLoaderProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [isFetchingSample, setIsFetchingSample] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // ── Drag handlers ────────────────────────────────────────────────────────

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    // Only clear when leaving the entire drop zone (not a child element)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  }

  // ── File-picker handler ──────────────────────────────────────────────────

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) readFile(file);
    // Reset so the same file can be re-picked after an error
    e.target.value = "";
  }

  // ── Core reader ──────────────────────────────────────────────────────────

  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === "string") onLoad(text, file.name);
    };
    reader.readAsText(file);
  }

  // ── Sample loader ────────────────────────────────────────────────────────

  async function loadSample() {
    setIsFetchingSample(true);
    try {
      const res = await fetch("/sample-trace.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      onLoad(text, "sample-trace.json");
    } catch (err) {
      // Surface the error through the parent via a fake "load" so the parent
      // can show it; alternatively we could propagate here — keep it simple.
      onLoad("FETCH_ERROR:" + String(err), "sample-trace.json");
    } finally {
      setIsFetchingSample(false);
    }
  }

  const busy = isLoading || isFetchingSample;

  return (
    <div className="flex flex-col items-center gap-4 w-full">

      {/* ── Drop zone ────────────────────────────────────────────────────── */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop trace file here or click to browse"
        className={[
          "relative w-full rounded-lg border-2 border-dashed transition-colors",
          "flex flex-col items-center justify-center gap-3 px-6 py-10 cursor-pointer",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
          isDragging
            ? "border-accent bg-accent-soft/50"
            : "border-border-strong bg-surface hover:border-gray-400 hover:bg-surface-muted",
          busy ? "pointer-events-none opacity-60" : "",
        ].join(" ")}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        {/* Hidden file input */}
        <input
          ref={inputRef}
          type="file"
          accept=".json,.jsonl,application/json,application/x-ndjson"
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
          onChange={handleInputChange}
        />

        {/* Icon */}
        <div
          className={[
            "flex items-center justify-center w-10 h-10 rounded-md transition-colors",
            isDragging ? "bg-accent-soft text-accent" : "bg-gray-100 text-ink-subtle",
          ].join(" ")}
          aria-hidden="true"
        >
          {busy ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : isDragging ? (
            <FileJson className="w-5 h-5" />
          ) : (
            <UploadCloud className="w-5 h-5" />
          )}
        </div>

        {/* Labels */}
        <div className="text-center">
          <p className="text-sm font-semibold text-ink">
            {busy ? "Loading…" : isDragging ? "Drop to load" : "Drop a trace file here"}
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">
            or{" "}
            <span className="text-accent underline underline-offset-2">browse your files</span>
          </p>
          <p className="mt-1.5 text-xs text-ink-subtle">JSON array or JSONL format</p>
        </div>
      </div>

      {/* ── Error message ─────────────────────────────────────────────────── */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 w-full rounded-md bg-red-50 border border-red-300 p-3 text-sm text-red-800"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-loss" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Divider ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 w-full" aria-hidden="true">
        <hr className="flex-1 border-border" />
        <span className="text-xs text-ink-subtle">or</span>
        <hr className="flex-1 border-border" />
      </div>

      {/* ── Sample trace button ───────────────────────────────────────────── */}
      <button
        type="button"
        onClick={loadSample}
        disabled={busy}
        className="
          inline-flex items-center justify-center gap-1.5 h-8 px-3
          rounded-md border border-border-strong bg-surface
          text-sm font-medium text-ink
          hover:bg-surface-muted disabled:text-gray-400
          focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1
          transition-colors
        "
      >
        {isFetchingSample ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : (
          <FlaskConical className="w-4 h-4" aria-hidden="true" />
        )}
        Load sample trace
      </button>
    </div>
  );
}
