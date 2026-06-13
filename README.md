# CallSakthi

**AI-powered phone agent for Bharat — in the language people actually speak.**

CallSakthi lets elderly users send a WhatsApp voice note in Tamil or Hindi, then autonomously navigates the provider's IVR to complete the task — booking an LPG cylinder, tracking a courier, checking a balance — and replies with a Tamil voice note confirming the result.

No app to install. No account to create. No English required.

---

## The Problem

India has over 300 million people who struggle with automated phone systems. Booking an LPG cylinder alone requires navigating a 4-step Hindi IVR — a barrier for Tamil or Telugu speakers, the elderly, and the semi-literate. Most either give up or depend on a family member to place the call.

CallSakthi removes that dependency entirely.

---

## How It Works

```
User sends WhatsApp voice note (Tamil / Hindi / English)
        ↓
CallSakthi transcribes and extracts intent (Sarvam STT + Gemini)
        ↓
Sends confirmation: "Shall I book your Indane cylinder? Reply ஆமா."
        ↓
Places the call — navigates the IVR autonomously (SakthiFlow)
        ↓
Replies with Tamil voice note: "உங்கள் cylinder book ஆச்சு! Ref: IND78934"
```

The interface is WhatsApp — already installed, already trusted.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CallSakthi Platform                       │
│                                                                   │
│  WhatsApp ──► Twilio Webhook ──► Intent Extractor (Gemini)       │
│                                         │                         │
│                               ┌─────────▼──────────┐            │
│                               │    SakthiFlow        │            │
│                               │  (IVR State Machine) │            │
│                               │                      │            │
│                               │  START               │            │
│                               │    ↓                 │            │
│                               │  CALLING             │            │
│                               │    ↓                 │            │
│                               │  NAVIGATING ◄─────── │ Gemini AI │
│                               │    ↓         ──────► │ Decisions │
│                               │  PROCESSING          │            │
│                               │    ↓                 │            │
│                               │  COMPLETED           │            │
│                               └─────────┬────────────┘            │
│                                         │                         │
│                               Sarvam TTS → Voice Reply            │
│                                         │                         │
│                               WhatsApp voice note → User          │
└─────────────────────────────────────────────────────────────────┘
```

### Core Components

| Component | Location | Purpose |
|-----------|----------|---------|
| SakthiFlow | `src/core/sakthiflow.js` | Per-call IVR navigation state machine |
| Intent Extractor | `src/core/intent-extractor.js` | Gemini-powered intent parsing |
| Mock IVR Engine | `src/core/mock-ivr-engine.js` | Realistic IVR simulation for testing and demos |
| Task Executor | `src/core/task-executor.js` | End-to-end task orchestration |
| Confirmation | `src/core/confirmation.js` | User confirmation gate before execution |
| Gemini Service | `src/services/gemini.js` | LLM navigation with heuristic fallback |
| Sarvam Service | `src/services/sarvam.js` | Tamil/Hindi STT and TTS |
| DB | `src/services/db.js` | SQLite via better-sqlite3 |

### Routes

| Route | Purpose |
|-------|---------|
| `GET /` | Landing page |
| `GET /demo` | Live split-screen demo with SSE streaming |
| `GET /playground` | Step-by-step AI decision trace inside SakthiFlow |
| `GET /metrics` | Reliability data and incident learnings |
| `POST /whatsapp` | Twilio WhatsApp webhook |
| `POST /voice` | Twilio Voice webhook |
| `GET /health` | Health check |

---

## SakthiFlow

SakthiFlow is the core IVR navigation agent — built from scratch with no LangChain, no agent framework, and no hardcoded decision trees.

### How a call works

1. The IVR speaks. SakthiFlow listens.
2. Gemini reads the full IVR prompt and call history, then returns a single decision:
   - `dtmf` — press a key
   - `speak` — say a number or phrase
   - `wait` — pause for IVR processing
   - `complete` — task confirmed
   - `failed` — unrecoverable error
3. SakthiFlow executes the decision.
4. Repeat until `complete` or `failed`.

### Reliability guarantees

- **Confirmation gate** — no action is taken without explicit user confirmation
- **Heuristic fallback** — if Gemini is unavailable (quota or network), a deterministic rule-based navigator covers the full LPG and courier flow
- **Hard step cap** — maximum 12 decisions per call; beyond that, the task is declared failed rather than looping indefinitely
- **Zero-API-key mode** — fully offline mock mode for local development and demos

### Decision engine

```
Gemini receives:
  - Current IVR prompt text
  - Full call history (previous prompts + decisions)
  - Task goal (e.g., "book LPG cylinder, consumer 1234567890")

Gemini returns:
  { action: "dtmf", value: "1", reasoning: "Main menu — press 1 for LPG booking" }

On quota failure, heuristicNavigate() takes over — ordered regex matching:
  1. Completion signals   → action: complete
  2. Confirmation menus  → action: dtmf "1"
  3. Number entry        → action: speak <consumer_number>
  4. Main menus          → action: dtmf "1"
  5. Generic fallback    → action: dtmf "1"
```

---

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ |
| Web framework | Express 4 |
| AI (intent + navigation) | Gemini 2.5 Flash Lite (`@google/generative-ai`) |
| Speech-to-text / TTS | Sarvam AI |
| WhatsApp | Twilio WhatsApp Sandbox |
| Database | SQLite via `better-sqlite3` |
| Deployment | Railway |
| Local tunnel | ngrok |

---

## Quick Start

```bash
git clone <repo> && cd callsakthi
npm install
npm start
```

Open `http://localhost:3000`. Everything works without API keys — the app starts in mock mode automatically.

### Environment variables

Copy `.env.example` to `.env` and fill in keys for live mode:

```bash
cp .env.example .env
```

| Variable | Source |
|----------|--------|
| `GEMINI_API_KEY` | https://aistudio.google.com |
| `SARVAM_API_KEY` | https://www.sarvam.ai |
| `TWILIO_ACCOUNT_SID` | Twilio Console |
| `TWILIO_AUTH_TOKEN` | Twilio Console |
| `TWILIO_WHATSAPP_FROM` | Twilio WhatsApp Sandbox number |
| `BASE_URL` | Your public URL (Railway or ngrok) |

If no environment variables are set, the app runs entirely in mock mode — safe to demo without any credentials.

---

## Validation Harness

```bash
npm run harness
```

Runs 6 end-to-end simulations fully offline:

| # | Test Case | Expected |
|---|-----------|---------|
| 1 | Tamil LPG booking (Indane) | COMPLETE |
| 2 | Hindi LPG booking (Indane) | COMPLETE |
| 3 | English HP Gas booking | COMPLETE |
| 4 | Bharat Gas booking | COMPLETE |
| 5 | DTDC courier tracking (English) | COMPLETE |
| 6 | Tamil courier tracking | COMPLETE |

```
╔══════════════════════════════════════╗
║            RESULTS                   ║
╠══════════════════════════════════════╣
║  Intent Accuracy:   100%             ║
║  IVR Completion:    100%             ║
║  Avg IVR Steps:     3.2              ║
║  Avg Duration:      1.4s             ║
╚══════════════════════════════════════╝
```

Results populate `/metrics` automatically after the run.

---

## Deployment

### Railway (recommended)

1. Push the repo to GitHub.
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub.
3. Add environment variables under Settings → Variables.
4. Deploy. The app starts in mock mode if secrets are absent.
5. Set the Twilio WhatsApp sandbox webhook to `https://<your-app>.railway.app/whatsapp`.

### Local with tunnel

```bash
npm run tunnel   # starts ngrok on port 3000
npm start        # in a second terminal
```

The startup output prints the tunnel URL and the exact webhook URL to configure in Twilio.

---

## File Structure

```
src/
  config/
    index.js              env detection, mock/live mode per service
  core/
    intent-extractor.js   Gemini-powered intent parsing
    sakthiflow.js         IVR navigation state machine
    mock-ivr-engine.js    IVR simulation (Indane, HP Gas, Bharat Gas, DTDC)
    task-executor.js      end-to-end orchestration
    confirmation.js       WhatsApp confirmation flow
  routes/
    whatsapp.js           Twilio WhatsApp webhook
    voice.js              Twilio Voice webhook
    mock-ivr.js           mock IVR TwiML responses
    demo.js               /demo — SSE-streamed live demo
    playground.js         /playground — step-through AI trace
    metrics.js            /metrics — reliability data
  services/
    gemini.js             Gemini AI + heuristic fallback
    sarvam.js             Sarvam STT/TTS
    twilio.js             WhatsApp message sending
    db.js                 SQLite (users, tasks, call_logs)
  utils/
    audio.js              audio file management
    logger.js             structured logging
    ngrok.js              ngrok tunnel detection
scripts/
  harness.js              end-to-end eval harness (npm run harness)
public/
  audio/                  TTS output files (auto-cleaned)
```

---

## Engineering Notes

### Gemini quota failures

Gemini's free tier can hit quota limits mid-session. Every Gemini call is wrapped in `try/catch`; on any failure, execution falls through to `heuristicNavigate()`. The harness validates both the AI and fallback paths. Run without a `GEMINI_API_KEY` to exercise the fallback directly.

### Consumer number trailing hash

An early version entered the consumer number without a trailing `#` even when the IVR prompt said "followed by hash." The IVR would time out. Fix: `heuristicNavigate()` checks `/hash|pound|#/.test(prompt)` and appends `#` only when explicitly requested.

### Fallback ordering

The heuristic navigator uses ordered regex matching: completion signals first, then confirmation menus, then number-entry prompts, then main menus. Order is significant — a naive implementation can match the wrong rule and loop indefinitely.

---

## Future: Companion App (Android)

The current implementation uses Twilio for telephony. The long-term plan is an Android companion app that places calls using the parent's own SIM card.

**Why this matters:** Providers authenticate by caller ID. Account-linked IVRs (such as LPG booking) reject calls from unknown numbers. Using the user's own SIM resolves this at the root and eliminates per-minute Twilio costs at scale.

### Supported use cases (v1 scope)

- LPG cylinder booking (Indane, HP Gas, Bharat Gas)
- Courier tracking (DTDC, India Post, Delhivery)
- Utility bill inquiry
- Prepaid mobile recharge
- Banking balance check (structured IVR only)

### Android telephony stack

- `TelecomManager.placeCall()` — outbound calls via user's SIM
- `AudioRecord` + Sarvam STT — real-time IVR audio transcription
- `TelecomConnection.sendDtmf()` — key presses
- Accessibility Service — fallback for IVR audio capture

### Backend command protocol

```json
{
  "call": "+18001234567",
  "steps": [
    { "wait": 3000 },
    { "dtmf": "1" },
    { "wait": 2000 },
    { "speak": "1234567890" },
    { "dtmf": "#" },
    { "wait": 2000 },
    { "dtmf": "1" }
  ]
}
```

One-time setup (done by a family member once, ~5 minutes): preferred language, LPG provider and consumer number, courier preferences, Android permissions. After that, the parent never configures anything again.

---

## License

MIT
