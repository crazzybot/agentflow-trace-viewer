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
    <div className="flex flex-col items-center gap-6 w-full max-w-lg mx-auto">

      {/* ── Drop zone ────────────────────────────────────────────────────── */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop trace file here or click to browse"
        className={[
          "relative w-full rounded-2xl border-2 border-dashed transition-all duration-200",
          "flex flex-col items-center justify-center gap-4 px-8 py-12 cursor-pointer",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
          isDragging
            ? "border-blue-500 bg-blue-50 scale-[1.01]"
            : "border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/40",
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
            "flex items-center justify-center w-16 h-16 rounded-2xl transition-colors",
            isDragging ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400",
          ].join(" ")}
          aria-hidden="true"
        >
          {busy ? (
            <Loader2 className="w-8 h-8 animate-spin" />
          ) : isDragging ? (
            <FileJson className="w-8 h-8" />
          ) : (
            <UploadCloud className="w-8 h-8" />
          )}
        </div>

        {/* Labels */}
        <div className="text-center">
          <p className="text-base font-semibold text-gray-700">
            {busy ? "Loading…" : isDragging ? "Drop to load" : "Drop a trace file here"}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            or{" "}
            <span className="text-blue-600 underline underline-offset-2">browse your files</span>
          </p>
          <p className="mt-2 text-xs text-gray-400">JSON array or JSONL format</p>
        </div>
      </div>

      {/* ── Error message ─────────────────────────────────────────────────── */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 w-full rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Divider ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 w-full" aria-hidden="true">
        <hr className="flex-1 border-gray-200" />
        <span className="text-xs text-gray-400 uppercase tracking-wider">or</span>
        <hr className="flex-1 border-gray-200" />
      </div>

      {/* ── Sample trace button ───────────────────────────────────────────── */}
      <button
        type="button"
        onClick={loadSample}
        disabled={busy}
        className="
          inline-flex items-center gap-2.5 px-5 py-2.5
          rounded-xl border border-blue-200 bg-blue-50
          text-sm font-medium text-blue-700
          hover:bg-blue-100 hover:border-blue-300
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          disabled:opacity-50 disabled:cursor-not-allowed
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
