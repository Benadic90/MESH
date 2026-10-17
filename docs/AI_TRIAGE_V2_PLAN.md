# RESCUE-MESH AI v2: Implementation Plan

**Status:** Design proposal for a safer, offline-first upgrade  
**Audited:** 2026-10-17  
**Scope:** Preserve RESCUE-MESH's emergency-connectivity idea while improving triage assistance, reliability, privacy, and testability.

## 1. Product direction

RESCUE-MESH should be an **offline-first emergency reporting and dispatch-support system**, not an AI-dependent emergency system.

The model may extract and summarize information for a human dispatcher. It must not be the only mechanism for detecting urgent reports, set the authoritative priority score, or dispatch resources without human approval. If AI, cloud access, the backend, or power fails, the user must still have a clear way to submit an SOS and the node must truthfully report whether the request was saved.

## 2. Findings from the current code

- `backend/src/priority.ts` uses keyword checks and fixed score increments. `generateAiSummary()` is also regex-based; it is not an LLM call.
- `backend/src/ai_engine.py` contains a second classifier with different weights and thresholds. The backend's `package.json` starts the TypeScript server, and the Python classifier is not wired into that path. Keep one authoritative rule engine or test parity explicitly.
- `backend/src/validation.ts` currently accepts client-supplied `priorityScore` and `severityLabel`. Since `store.ts` only runs its initial triage when the saved request has no score, a client-provided score can bypass the intended scoring flow. The public SOS input schema should not accept authoritative priority/severity fields.
- `backend/src/store.ts` describes its data store as an in-memory simulation and keeps resource availability in process memory. Yjs is being used for synchronisation, but it should not be mistaken for durable storage by itself.
- `backend/src/index.ts` starts a Yjs WebSocket server on port 1234, while `store.ts` connects to `ws://localhost:1234`. That topology needs to be explicitly configured and tested for multi-device deployments.
- `firmware/RescueMeshNode/RescueMeshNode.ino` currently prints received SOS fields to Serial and responds with `SUCCESS`; it does not persist the request or forward it to the backend. The browser code displays a success card after the fetch resolves without checking the HTTP response status. Do not claim a request is securely cached until durable local storage and an acknowledgement are implemented.
- `backend/test/backend.test.ts` should be repaired and run as a baseline before major changes; at least one test references an undefined `created` value and expects a singular `resource` field where the store currently returns `resources`.

These are implementation observations, not a claim that this repository is ready for life-critical deployment.

## 3. Target architecture

1. **Edge capture (ESP node / phone):** accept a small SOS payload and assign a stable request ID. Persist it locally before acknowledging that it is saved. Queue outgoing sync attempts and retry safely.
2. **Offline rule engine:** run deterministic, versioned rules immediately. It should flag explicit danger signals and generate a preliminary priority recommendation even with no internet. The score and severity are calculated on the server/node, never trusted from the client.
3. **Optional AI enrichment:** when a configured provider is reachable, send only the minimum necessary, redacted text. Ask the model to return structured fields such as incident category, key evidence quoted from the report, missing information, language/translation, suggested resource types, and uncertainty. Do not ask it to calculate the authoritative priority score.
4. **Validation boundary:** parse the model output with a strict schema (Zod), enforce enum/range limits, reject malformed outputs, record provider/time/model metadata, and fall back to the rule result on timeout, refusal, unavailable credentials, or invalid output.
5. **Human dispatch:** show rule-based flags and optional model suggestions separately. A trained/authorized dispatcher approves resource assignment. Record any human override and reason.
6. **Sync and persistence:** store the request and its processing state durably first; then synchronise when a peer/uplink is reachable. Use request IDs/idempotency so retries do not create duplicate emergency reports. Keep Yjs as a synchronisation layer, not the sole durable database.

## 4. Model roles

Model IDs and pricing are taken from Anthropic's official model overview and pricing documentation as of 2026-10-17:

- **Development/coding agent:** Claude Opus 5.5 (`claude-opus-5-5`) is the recommended default for substantial codebase work, debugging, tests, and architecture changes.
- **Hardest design/reasoning review:** Claude Fable 5.1 (`claude-fable-5-1`) can be evaluated for difficult long-horizon tasks, but is slower and costs more. Do not assume it is automatically better for every task; compare it against Opus on MESH-specific acceptance tests.
- **Optional online SOS extraction:** start by evaluating Claude Haiku 5.5 (`claude-haiku-5-5`) for brief, schema-constrained extraction; compare its error rate and latency with Sonnet/Opus before choosing. AI enrichment must never block local SOS saving or be required during a network outage.

Official references:
- Model lineup and IDs: https://platform.claude.com/docs/en/models/overview
- Pricing: https://platform.claude.com/docs/en/about-claude/pricing
- Messages API: https://platform.claude.com/docs/en/api/messages/create

Base token prices listed by Anthropic at the audit date are $4 input / $20 output per million tokens for Opus 5.5, $10 / $50 for Fable 5.1, $2 / $10 for Sonnet 5.5, and $0.10 / $0.50 for Haiku 5.5 for prompts up to 100k input tokens. Pricing can change; re-check the official pricing page before deployment.

## 5. Strict AI and privacy rules

- Never put an Anthropic/API key in the frontend, firmware, Git history, mobile app bundle, or a public configuration file. Read it only from backend environment configuration.
- Do not send reporter names, phone numbers, exact GPS coordinates, or other unnecessary personal information to a model provider. Redact phone-like strings from free text before any external call.
- Make provider use opt-in/configurable and set a timeout and output-token budget. Disable provider calls by default in tests.
- Never mark a report saved because an API request merely resolved. Check HTTP status and confirm durable local write before showing a saved acknowledgement.
- Never let a model response directly dispatch an ambulance or silently downgrade a deterministic critical flag.
- Explain that this is a prototype and requires field testing, security review, domain-expert triage validation, and operational approval before real emergency use.

## 6. Proposed implementation phases

### Phase 0 — Make the current baseline honest and testable
- Repair the backend tests and add scripts to run build/tests consistently.
- Remove `priorityScore` and `severityLabel` from public SOS input; calculate those server-side only.
- Consolidate duplicate Python/TypeScript scoring rules or explicitly test parity.
- Make CORS and WebSocket origins configurable instead of unrestricted for deployments.
- Fix the firmware response semantics so an SOS is acknowledged only after local persistence.

**Acceptance:** tests pass; clients cannot submit their own priority score; an unplugged/isolated node does not falsely claim durable storage.

### Phase 1 — Reliable offline SOS and sync
- Persist queued SOS records on-device (and/or phone), assign idempotency IDs, and implement retry/acknowledgement states.
- Specify a protocol between the ESP node and backend, including payload validation and duplicate handling.
- Add a persistence layer for backend requests and resources; test restart/recovery and concurrent assignments.
- Add a visible sync state: locally saved, waiting for relay/uplink, received by dispatch, and acknowledged.

**Acceptance:** submit offline, power-cycle/restart, recover the request, reconnect, and verify exactly one report reaches the dispatch service.

### Phase 2 — Add a provider-neutral AI enrichment interface
- Define a TypeScript interface so the app can switch providers/models without rewriting dispatch logic.
- Add a Claude Messages API adapter behind server-side configuration.
- Keep rule priority immediate; add asynchronous AI-only annotation fields.
- Validate structured output with Zod and fall back on every failure path.
- Use redacted/minimal input and avoid logging raw emergency text or credentials.

**Acceptance:** no API key means the system still works; forced timeout/malformed model output leaves the SOS stored and its rule-based triage intact.

### Phase 3 — Build a triage evaluation set
- Create a synthetic, reviewed set of emergency reports covering spelling mistakes, short/ambiguous messages, negation ("no fire"), multiple incidents, multilingual text, duplicate reports, and malicious prompt-injection text.
- Track critical-signal recall, wrong downgrade rate, hallucinated facts, schema validity, latency, and estimated cost.
- Ensure AI cannot remove a rule-based critical flag; route uncertain cases to human review.

**Acceptance:** publish evaluation results with limitations; do not promote a model because of anecdotal demonstrations alone.

### Phase 4 — Dispatcher UX and field simulation
- Clearly separate rule flags from AI suggestions.
- Add human approval and auditable overrides to assignments.
- Run simulated network loss, node reboot, duplicate send, full queue, and multi-node sync tests before a field demonstration.

**Acceptance:** every test scenario works without cloud AI, and the UI never overstates delivery or model certainty.

## 7. Suggested configuration shape

Example backend-only environment variables (never commit real secrets):

```dotenv
MESH_AI_ENABLED=false
MESH_AI_PROVIDER=anthropic
MESH_AI_MODEL=claude-haiku-5-5
ANTHROPIC_API_KEY=
MESH_AI_TIMEOUT_MS=2500
```

Keep `MESH_AI_ENABLED=false` until the backend adapter, privacy redaction, evaluation set, and fallback tests are in place. A timeout is a graceful AI-enrichment failure, not an SOS failure.
