# CallSakthi — Design

**Date:** 2026-06-13
**Status:** Approved

## What it is

A WhatsApp AI phone agent for non-tech-savvy Indians. A user sends a Tamil/Hindi
voice note ("book my LPG cylinder"); CallSakthi transcribes it, extracts intent,
confirms, then places an outbound phone call and navigates the provider's IVR
autonomously (the **SakthiFlow** engine) to complete the task, then replies with a
voice note containing the result (e.g. booking reference).

## Stack

WhatsApp + Voice: Twilio. STT/TTS: Sarvam (Saaras v3 / Bulbul v3). AI brain:
Google Gemini 2.5 Flash-Lite. DB: Supabase. Backend: Node 20 + Express. Deploy:
Railway. The full spec (file tree, schema, per-file behavior) is the canonical
source pasted by the user; this doc captures only design decisions beyond it.

## Key design decision: offline-runnable via graceful mock fallback

Each external service detects its key at init. When a key is absent it falls back
to a built-in mock with the *same interface*, so the whole app runs with an empty
`.env` and no network. Adding real keys flips each service to live mode — no code
changes.

| Service   | Real mode                        | Mock mode (no key)                                   |
|-----------|----------------------------------|------------------------------------------------------|
| gemini    | `gemini-2.5-flash-lite`          | deterministic rule-based navigator + intent extractor |
| sarvam    | Saaras/Bulbul REST               | STT → canned transcript; TTS → placeholder buffer    |
| twilio    | real WhatsApp/calls              | console-logs message/call, returns synthetic SID     |
| supabase  | real Postgres                    | in-memory Map store, same `{data,error}` shape       |

**Deviation from spec:** config validation *warns* about missing keys and lists
degraded features instead of hard-failing. Hard-fail would make the offline
harness impossible. Live deploys still surface missing keys loudly in logs.

## Test harness (`scripts/test-sakthiflow.js`)

Plays the role Twilio plays in production — the wire between the mock IVR and
SakthiFlow:

```
loop:
  mock-ivr returns TwiML → extract <Say> text + gather action
  → POST /voice/gather (SpeechResult = that text) → SakthiFlow (Gemini) decides
  → extract <Play digits> / <Say> from SakthiFlow's TwiML
  → feed back as Digits/SpeechResult to mock-ivr
  → repeat until <Hangup/> → print each step + final result
```

Runs N times (default 20) against the LPG mock and prints the evaluation metrics
table (intent accuracy on a fixture set, IVR completion rate, avg steps, avg
duration) — fully offline.

## Components & boundaries

- `config` — env load + warn-on-missing, provider numbers, constants.
- `utils/logger`, `utils/audio` — structured logs; Twilio media download / audio
  file IO.
- `services/*` — one file per external dependency, each with real+mock paths.
- `core/intent-extractor` — voice note → transcript → intent JSON.
- `core/sakthiflow` — the IVR navigation engine (in-memory `callStates` Map keyed
  by callSid). Built from scratch, no agent framework.
- `core/confirmation` — info-collection + yes/no conversation flow.
- `core/task-executor` — orchestrates intent → outbound call → result.
- `routes/whatsapp|voice|mock-ivr` — webhook surfaces returning TwiML/200.
- `src/index.js` — Express wiring, static `/public`, `/health`, audio cleanup.

## Testing strategy

- Offline harness drives the full SakthiFlow loop with mock providers.
- Unit-level checks for: Gemini JSON fence-stripping, intent extraction on Tamil/
  Hindi/English fixtures, SakthiFlow TwiML generation per action type, mock IVR
  state machine, confirmation yes/no detection.
- `GET /health` and `/mock-ivr/*` exercisable with `npm start` and curl, no keys.

## Out of scope (YAGNI / spec says no)

No LangChain/agent frameworks, no RAG/vector DB, no Next.js dashboard (WhatsApp is
the UI), no hardcoded IVR scripts (Gemini navigates dynamically), no Claude API.
