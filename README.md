# Flowwright

**Show the work. Ship the workflow.**

Flowwright is an AI workflow compiler that learns a browser-based process from a human demonstration and converts it into a structured, tested, executable application.

## Product overview

People repeat browser tasks because the work contains context, decisions, and exceptions that generic recorders do not understand. Flowwright records a demonstration, extracts meaningful actions, identifies variables and safety boundaries, compiles a Workflow Intermediate Representation (WorkflowIR), and generates tests before a human approves high-impact actions.

Existing workflow builders require users to understand automation logic. Autonomous agents improvise on every execution. Flowwright learns the process first, keeps uncertainty visible, and makes the compiled graph inspectable.

## How it works

```mermaid
flowchart LR
  D[Demonstrate in browser] --> U[Understand actions and decisions]
  U --> G[Generate WorkflowIR and code]
  G --> T[Test expected and unexpected inputs]
  T --> A{Human approval}
  A --> P[Deploy reusable application]
```

The core innovation is a compiler boundary: human evidence is normalized into a typed intermediate representation before code generation. The initial demo uses a deterministic analyzer; the OpenAI analyzer is isolated behind the same interface.

## Prototype status

Working today:

- Next.js dashboard with `/`, `/record`, `/workflows/demo`, and `/tests`.
- Local screen recording with `getDisplayMedia`, preview, download, elapsed time, and optional event-log import.
- FastAPI health, demo workflow, analysis, deterministic test, and ephemeral key-frame endpoints.
- Pydantic WorkflowIR, matching Zod schema, synthetic invoice fixtures, and generated graph using `@xyflow/react`.
- Chrome Manifest V3 extension scaffold that captures safe clicks, navigation, and non-sensitive input events and exports JSON.
- GitHub Pages deployment of the Next.js frontend as a static export.
- Demo mode works without an OpenAI key.

Roadmap: production browser executor, richer event normalization, OpenAI-backed compilation with real demonstrations, generated application packaging, persistent storage, and deployment automation. These are not claimed as complete.

The prototype supports a controlled browser workflow only. It does not automate arbitrary desktop applications, autonomously execute sensitive actions, use real financial data, or provide authentication, billing, team collaboration, or enterprise controls.

## Repository structure

```text
apps/web          Next.js App Router frontend
apps/api          FastAPI backend and tests
apps/extension    Chrome Manifest V3 event-capture scaffold
packages/...      WorkflowIR Zod package and sample workflow
examples/...      Synthetic invoice and purchase-order data
docs              Supporting static product documentation
scripts           Schema export and setup verification
```

## Technology stack

Node.js 24 LTS, pnpm, Next.js, React, TypeScript, Tailwind CSS, shadcn/ui-compatible components, `@xyflow/react`, Zod, Playwright, Python 3.12+, FastAPI, Pydantic, pydantic-settings, OpenAI Python SDK, OpenCV, FFmpeg-compatible video decoding, Playwright Python, pytest, HTTPX, and SQLite for local development.

## Local setup

Prerequisites: Node.js 24 LTS, pnpm 11+, Python 3.12+, uv, and (for video extraction) FFmpeg codecs available to OpenCV.

```bash
pnpm install
cd apps/api && uv sync
```

Copy `.env.example` to a local `.env` only when needed. Never commit it.

Frontend:

```bash
pnpm dev:web
pnpm --filter @flowwright/web build
pnpm --filter @flowwright/web start
```

The `start` command serves the generated static export locally after `build`.

Backend:

```bash
cd apps/api
uv run uvicorn app.main:app --reload --port 8000
uv run pytest
```

Chrome extension:

```bash
pnpm dev:extension
```

Then load `apps/extension` as an unpacked extension in `chrome://extensions` with Developer mode enabled. The extension requires explicit start/stop actions and does not upload event logs.

Complete checks:

```bash
pnpm check
```

## Environment variables

`FLOWWRIGHT_DEMO_MODE=true` is the default and requires no API key. To use the isolated OpenAI analyzer, set `OPENAI_API_KEY`, `OPENAI_MODEL`, and `FLOWWRIGHT_DEMO_MODE=false` in the backend environment. `CORS_ALLOWED_ORIGINS` must list explicit origins. `MAX_UPLOAD_SIZE_MB` controls ephemeral video uploads. See `.env.example` and `apps/api/.env.example`.

## API

- `GET /health` — service status.
- `GET /api/v1/workflows/demo` — validated synthetic invoice WorkflowIR.
- `POST /api/v1/workflows/analyze` — compile a task description (demo or OpenAI analyzer).
- `POST /api/v1/workflows/test` — run deterministic invoice tests.
- `POST /api/v1/media/keyframes` — validate a video, extract metadata for a small set of key frames, and delete the temporary file.

## WorkflowIR example

```json
{
  "id": "invoice-approval-demo",
  "version": "0.1.0",
  "steps": [
    { "id": "compare_totals", "type": "condition", "requires_approval": false }
  ],
  "confidence": 0.94
}
```

The authoritative full schema is `apps/api/app/models/workflow.py`; its JSON Schema export is `packages/workflow-schema/workflow.schema.json`.

## Invoice demo

The four synthetic cases are exact match → `approved`, amount mismatch → `exception`, missing purchase order → `human_review`, and unreadable invoice number → `human_review`. Approval remains a human gate even for an exact match.

## Testing and security

Run `cd apps/api && uv run pytest` for backend tests, `pnpm --filter @flowwright/web test:e2e` for the Playwright smoke test, and `pnpm check` for frontend/extension checks. Keys never enter frontend code. Recordings are local and not persisted by the prototype. Generated code must be reviewed and must not be used as arbitrary shell execution. See `SECURITY.md` for limitations.

## Deployment guidance

GitHub Pages builds and deploys the Next.js frontend from `apps/web/out` with the `/Flowwright` project-site base path. The FastAPI service targets Railway, Render, or Fly.io. Future PostgreSQL storage can use Neon or Supabase; future media storage can use Cloudflare R2 or Amazon S3. Credentials and deployment actions are intentionally not included.

## Roadmap and hackathon demo flow

1. Start the API in demo mode and the frontend.
2. Record a browser demonstration, stop it, describe the task, and choose **Analyze demonstration**. Key-frame extraction is explicit and temporary.
3. Open the compiled workflow graph and inspect variables, decisions, and approval gates.
4. Open test results for all four synthetic cases.
5. Show the extension scaffold and static product site.

## Contributing and license

See `CONTRIBUTING.md` for setup and pull-request expectations. Flowwright is released under the Apache License, Version 2.0 in `LICENSE`.
