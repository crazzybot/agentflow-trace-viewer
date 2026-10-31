/**
 * AgentFlow API base URL. Override at build/dev time with VITE_AGENTFLOW_API_URL
 * (e.g. `VITE_AGENTFLOW_API_URL=http://localhost:8000 npm run dev`).
 */
export const AGENTFLOW_API_URL: string =
  (import.meta.env?.VITE_AGENTFLOW_API_URL as string | undefined)?.replace(/\/$/, "") || "http://localhost:8002";
