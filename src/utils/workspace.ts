/** Mirrors AgentFlow's workspace-name rule (core/workspace.py). */
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Error message for an invalid workspace name, or null when valid or empty. */
export function workspaceNameError(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (trimmed === "runs") return '"runs" is reserved for per-run workspaces';
  if (!NAME_RE.test(trimmed)) {
    return "Use 1–64 letters, digits, '.', '_' or '-', starting with a letter or digit";
  }
  return null;
}
