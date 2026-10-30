# AgentFlow Trace Viewer

A browser UI for [AgentFlow](../../README.md) runs. You can start runs and watch them
live, browse past runs on a timeline of agent turns, tool calls and thinking, read
reports and artifacts, step through workspace checkpoints, and drive long-horizon
**campaigns**.

## Run it

```bash
npm install
npm run dev                                              # http://localhost:5173
VITE_AGENTFLOW_API_URL=http://localhost:8000 npm run dev # point at another server
```

`VITE_AGENTFLOW_API_URL` defaults to `http://localhost:8001`. The AgentFlow server allows
CORS from `localhost:3000` and `:5173`–`:5175`.

## What it shows

**Runs** (`#/runs/:id`)
- **Live view:** the SSE stream, with message-the-agent, cancel, and budget/iteration
  approvals. A cancel that another server replica owns shows "Cancel sent to owning
  replica…".
- **Past runs** load from the captured SSE events when the server ran with
  `CAPTURE_EVENTS`. **Otherwise they are rebuilt from the run's session log**, which every
  run has. The rebuilt view shows the full plan, every agent turn (thinking, tool calls and
  results), retries, verification, checkpoints and the exact cost. A "from session log"
  badge marks these traces.
- **Verification:** acceptance criteria in the plan, `task:verified` verdicts with
  per-criterion evidence, and repair rounds.
- **Checkpoints tab:** the workspace's git snapshots per subtask, their changed files, and
  a copyable restore command.
- **Resume:** a run interrupted by a server restart gets a **Resume** button and continues
  in place.
- **Workspaces:** new runs and follow-ups can name a project workspace. Follow-ups
  continue in the prior run's workspace by default.

**Campaigns** (`#/campaigns`)
- **List and create:** each campaign shows its progress. Creating one takes the spec,
  agent, session limit, budgets and workspace.
- **Detail:** the feature ledger (status, failed attempts, the verifier's evidence per
  check, the last session's notes), the sessions (each opens as a run), and pause/resume.
  The page refreshes while the campaign is active.

**From file:** load an `events.jsonl` (or a JSON array) exported from a run.

## How it fits the AgentFlow API

| Viewer need | Endpoint |
| --- | --- |
| Run list, start, follow-up, cancel, message, human input | `/api/runs…` |
| Live events | `GET /api/runs/{id}/stream` (SSE) |
| Past events | `GET /api/runs/{id}/events`, falling back to `GET /api/runs/{id}/session` |
| Resume, checkpoints | `POST /api/runs/{id}/resume`, `GET /api/runs/{id}/checkpoints` |
| Campaigns | `/api/campaigns…` |
| Agent list | `GET /health` |

**Forward compatibility.** An event type the viewer doesn't know is shown as **Other**
instead of breaking the trace. Events are de-duplicated by identity rather than by `seq`
alone, because worker processes and resumed runs number their own events.

## Code map

| Path | What |
| --- | --- |
| `src/App.tsx` | Hash router and run state machine (idle, streaming, loaded) |
| `src/api/agentflow.ts` | API client |
| `src/utils/loadTrace.ts` | SSE event parsing, ordering, de-duplication |
| `src/utils/sessionTrace.ts` | Session log → timeline conversion, and resume detection |
| `src/components/TimelineView.tsx`, `EventDetail.tsx` | Timeline and detail panel |
| `src/components/CheckpointsViewer.tsx` | Checkpoints tab |
| `src/components/CampaignsPage.tsx` | Campaign list, form and ledger |
