# Flowwright

**Show the work. Ship the workflow.**

Flowwright is an AI workflow compiler that learns a browser-based invoice process from a human demonstration and converts it into a structured, tested, executable application.

## Product overview

People repeat browser tasks because the work contains context, decisions, and exceptions that generic recorders do not understand. Flowwright records a demonstration, extracts meaningful actions, identifies variables and safety boundaries, compiles a Workflow Intermediate Representation (WorkflowIR), and generates tests before a human approves high-impact actions.

## How it works

```text
Demonstration → Evidence → WorkflowIR → InvoiceCompilerConfig
  → Generated artifact → Tests against that artifact → Mini-app (same config)
```

Only `workflow_kind=invoice_approval` may proceed to generation, tests, and the invoice mini-application. Unsupported workflows can still be visualized.

## Prototype status

### Working

- Next.js dashboard with `/`, `/record`, `/workflows/demo`, `/tests`, `/code`, and `/generated/invoice-processor`.
- Screen capture plus separate microphone capture, merged into one recording, with screen-audio and microphone status.
- Evidence processing: JPEG key frames, optional transcript (model-aware), browser events, IndexedDB evidence storage, provenance on workflow nodes.
- FastAPI health, sample workflow, OpenAI analysis (when configured), clarifications, compiler config extraction, trusted artifact generation, and invoice mini-app endpoints. Generated tests run in a temporary working directory with a scrubbed environment and timeout. Network isolation is not currently implemented.
- Pydantic WorkflowIR + Zod schema, `Decimal` monetary comparisons, synthetic invoice fixtures.
- Chrome MV3 extension with service-worker session ownership (`chrome.storage.session`), SPA navigation capture, sensitive-field omission, and optional host permissions.
- GitHub Pages static export. Live API calls require `FLOWWRIGHT_API_URL` / `NEXT_PUBLIC_FLOWWRIGHT_API_URL`.
- Demo mode works without an OpenAI key (sample invoice WorkflowIR only).

### Prototype limitations

- Invoice-focused compiler only; other demonstrated workflows are `unsupported` for generation.
- Approvals produce a synthetic, non-persistent receipt. No external action or durable record is created.
- Media is uploaded only after consent on **Process evidence**; temporary processing files exist for the request lifetime. This is not a zero-retention guarantee.
- No authentication, teams, billing, marketplaces, Gmail/Slack/payment integrations, or desktop automation.
- OpenAI-backed end-to-end inference requires a configured key and is environment-dependent.

### Future roadmap

Production browser executor, persistent storage, richer event normalization, and deployment automation.

## Repository structure

```text
apps/web          Next.js App Router frontend
apps/api          FastAPI backend and tests
apps/extension    Chrome Manifest V3 event-capture extension
packages/...      WorkflowIR Zod package and sample workflow
examples/...      Synthetic invoice and purchase-order data
docs              Supporting static product documentation
scripts           Schema export and setup verification
```

## Technology stack

Node.js 24 LTS, pnpm, Next.js, React, TypeScript, Tailwind CSS, custom UI primitives, `@xyflow/react`, Zod, Playwright (Node e2e), Python 3.12+, FastAPI, Pydantic, pydantic-settings, OpenAI Python SDK, OpenCV, FFmpeg-compatible video decoding, pytest, HTTPX.

## Local setup

Prerequisites: Node.js 24 LTS, pnpm 11+, Python 3.12+, uv, and (for video extraction) FFmpeg codecs available to OpenCV.

```bash
pnpm install
cd apps/api && uv sync
```

Frontend:

```bash
pnpm dev:web
pnpm --filter @flowwright/web build
pnpm --filter @flowwright/web start
```

Backend:

```bash
cd apps/api
uv run uvicorn app.main:app --reload --port 8000
uv run pytest
```

Chrome extension:

```bash
pnpm --filter @flowwright/extension build
pnpm --filter @flowwright/extension validate
```

Load `apps/extension/build` as an unpacked extension. Closing the popup does not stop an active capture session.

Complete checks:

```bash
pnpm check
cd apps/api && uv run pytest
pnpm --filter @flowwright/web test:e2e
```

## Environment variables

`FLOWWRIGHT_DEMO_MODE=true` is the default and requires no API key. To use OpenAI analysis, set `OPENAI_API_KEY`, `OPENAI_MODEL`, and `FLOWWRIGHT_DEMO_MODE=false`. Default transcription model is `gpt-4o-mini-transcribe` (`json` response; Whisper uses `verbose_json` + segments). See `.env.example` and `apps/api/.env.example`.

## API (selected)

- `GET /health`
- `GET /api/v1/workflows/demo`
- `POST /api/v1/workflows/analyze` — requires processed evidence; unavailable in demo mode
- `POST /api/v1/workflows/test` — generates trusted artifact and runs its pytest suite in a temp directory
- `POST /api/v1/workflows/resolve` — apply clarification answers to WorkflowIR / compiler config
- `POST /api/v1/workflows/generate` — IR → `InvoiceCompilerConfig` → source
- `POST /api/v1/invoices/process` — mini-app uses the same compiler config interpreter
- `POST /api/v1/media/process-demonstration` — evidence extraction (upload after consent)

## Invoice demo

Allowlisted fixtures: exact match → `approval_required`, amount mismatch → `exception` (or review when configured), missing purchase order → `human_review`, unreadable invoice number → `human_review`, fifth live case (one-cent difference).

## Testing and security

See `SECURITY.md`. Public API usage is rate-limited and size-bounded. Do not claim media always stays local after **Process evidence**. Generated tests run in a temporary working directory with a scrubbed environment and timeout. Network isolation is not currently implemented.

## Deployment

GitHub Pages deploys `apps/web/out` with the `/Flowwright` base path. Set Actions variable `FLOWWRIGHT_API_URL` for live backend actions; otherwise backend-dependent pages disable AI analysis, tests, generation, downloads, and the invoice processor.

## Hackathon demo flow

1. Start the API and frontend.
2. Record screen + microphone, consent, **Process evidence**, optionally analyze with AI.
3. Inspect provenance, resolve clarifications, generate code.
4. Run tests against the generated artifact.
5. Process a synthetic invoice in the mini-app (same compiled rules).

## Contributing and license

See `CONTRIBUTING.md`. Apache License, Version 2.0 in `LICENSE`.
