# CallSakthi

> **What if your parents never had to navigate "Press 1 for English" ever again?**

CallSakthi is an AI-powered phone agent for Bharat. An elderly user sends a WhatsApp voice note in Tamil or Hindi — CallSakthi transcribes it, understands the intent, confirms with the user, then navigates the provider's IVR autonomously to complete the task. The result comes back as a Tamil voice note.

No app to install. No account to create. No English required.

---

## The Problem

India has 300M+ people who struggle with automated phone systems. LPG cylinder booking alone requires navigating a 4-step IVR in Hindi — a language many Tamil or Telugu speakers are not comfortable with. The elderly and semi-literate either give up or depend on a family member to make the call.

CallSakthi removes that dependency entirely.

---

## Product Vision

```
User sends voice note (Tamil/Hindi/English)
        ↓
CallSakthi transcribes + extracts intent
        ↓
Confirms: "Shall I book your Indane cylinder? Reply ஆமா."
        ↓
Places the call — navigates the IVR autonomously
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
| Mock IVR Engine | `src/core/mock-ivr-engine.js` | Realistic IVR simulation for demo/testing |
| Task Executor | `src/core/task-executor.js` | End-to-end task orchestration |
| Confirmation | `src/core/confirmation.js` | User confirmation before execution |
| Gemini Service | `src/services/gemini.js` | LLM navigation + heuristic fallback |
| Sarvam Service | `src/services/sarvam.js` | Tamil/Hindi STT and TTS |
| DB | `src/services/db.js` | SQLite via better-sqlite3 |

### Routes

| Route | Purpose |
|-------|---------|
| `GET /` | Cinematic landing page with video hero |
| `GET /demo` | Live split-screen demo with SSE streaming |
| `GET /playground` | Inside SakthiFlow — step-by-step AI decision trace |
| `GET /metrics` | Reliability data + incident learnings |
| `POST /whatsapp` | Twilio WhatsApp webhook |
| `POST /voice` | Twilio Voice webhook |
| `GET /health` | Health check |

---

## SakthiFlow — The Core Innovation

SakthiFlow is a from-scratch IVR navigation agent. No LangChain. No agent framework. No hardcoded decision trees.

### How a call works

1. The IVR speaks. SakthiFlow listens.
2. Gemini reads the full IVR prompt + call history and returns one decision:
   - `dtmf` — press a key
   - `speak` — say a number or phrase
   - `wait` — pause for IVR processing
   - `complete` — task confirmed
   - `failed` — unrecoverable error
3. SakthiFlow executes the decision.
4. Repeat until `complete` or `failed`.

### Reliability guarantees

- **Confirmation gate** — no action taken without user confirmation
- **Heuristic fallback** — if Gemini is unavailable (quota, network), a deterministic rule-based navigator takes over and covers the full LPG + courier flow
- **Hard step cap** — max 12 decisions per call; beyond that, task is declared failed rather than looping indefinitely
- **Zero-API-key mode** — fully offline mock mode for local development and demos

### Decision engine

```
Gemini receives:
  - Current IVR prompt text
  - Full call history (previous prompts + decisions)
  - Task goal (e.g., "book LPG cylinder, consumer 1234567890")

Gemini returns:
  { action: "dtmf", value: "1", reasoning: "Main menu — press 1 for LPG booking" }

On quota failure:
  heuristicNavigate() takes over — ordered regex matching:
  1. Completion signals   → action: complete
  2. Confirmation menus  → action: dtmf "1"
  3. Number entry        → action: speak <consumer_number>
  4. Main menus          → action: dtmf "1"
  5. Generic fallback    → action: dtmf "1"
```

---

## Companion App — Future Vision

While the hackathon version uses WhatsApp and Twilio, the long-term vision is an Android companion app that places calls using the parent's own SIM card.

### Why this matters

Current telephony (Twilio) requires a third-party number. Service providers see an unknown caller, which can cause rejections for account-linked IVRs (e.g., LPG booking requires the registered mobile number).

The companion app solves this at the root.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              CallSakthi Companion App (Android)              │
│                                                               │
│  ┌──────────────────┐     ┌──────────────────────────────┐  │
│  │   WhatsApp Layer  │     │     Android Call Manager     │  │
│  │                   │     │                              │  │
│  │  Voice note in   ─┼─►  │  Places call via user's SIM  │  │
│  │  (Tamil/Hindi)    │     │  Sends DTMF tones            │  │
│  │                   │     │  Reads IVR audio (ASR)       │  │
│  └──────────────────┘     └──────────────────────────────┘  │
│             │                           │                     │
│             ▼                           ▼                     │
│  ┌──────────────────────────────────────────────────────┐    │
│  │              CallSakthi Backend (Cloud)               │    │
│  │                                                        │    │
│  │  Intent Extraction (Gemini)                           │    │
│  │  SakthiFlow Decision Engine                           │    │
│  │  DTMF Command Generator                               │    │
│  │  Result Summarizer (Tamil TTS via Sarvam)             │    │
│  └──────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### One-time setup (5 minutes, done by family member)

- Preferred language
- LPG provider + consumer number
- Courier preferences
- Emergency contacts
- Android permissions (CALL_PHONE, READ_CALL_LOG, accessibility)

After setup, the parent never configures anything again.

### Supported use cases (v1)

- LPG cylinder booking (Indane, HP Gas, Bharat Gas)
- Courier tracking (DTDC, India Post, Delhivery)
- Utility bill inquiry
- Prepaid mobile recharge
- Banking balance check (structured IVR only)

### Technical approach

**Android telephony stack:**
- `TelecomManager.placeCall()` for outbound calls via user's SIM
- `AudioRecord` + Sarvam STT to transcribe IVR audio in real time
- `TelecomConnection.sendDtmf()` for key presses
- Accessibility Service as fallback for IVR audio capture

**Backend command protocol:**
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

**Why the user's own SIM matters:**
- Providers authenticate by caller ID — accounts reject unknown numbers
- No regulatory complexity around VoIP calling
- No per-minute Twilio costs at scale
- User's existing call history, trust, and account linkage preserved

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
| Deployment | Railway (zero-config) |
| Local tunnel | ngrok |

**Not used:** LangChain, LangGraph, vector databases, Next.js, React, any agent framework. SakthiFlow is built from scratch.

---

## Quick Start

```bash
git clone <repo> && cd callsakthi
npm install
npm start          # boots in mock mode — zero config needed
```

Open `http://localhost:3000`. Everything works without any API keys.

### Live mode

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

| Key | Source |
|-----|--------|
| `GEMINI_API_KEY` | https://aistudio.google.com (free tier) |
| `SARVAM_API_KEY` | https://www.sarvam.ai (₹1000 free credits) |
| `TWILIO_ACCOUNT_SID` | Twilio Console |
| `TWILIO_AUTH_TOKEN` | Twilio Console |
| `TWILIO_WHATSAPP_FROM` | Twilio WhatsApp Sandbox number |
| `BASE_URL` | Your public URL (Railway / ngrok) |

---

## Validation Harness

```bash
npm run harness
```

Runs 6 end-to-end simulations fully offline — no API keys required:

| # | Test Case | Expected |
|---|-----------|---------|
| 1 | Tamil LPG booking (Indane) | COMPLETE |
| 2 | Hindi LPG booking (Indane) | COMPLETE |
| 3 | English HP Gas booking | COMPLETE |
| 4 | Bharat Gas booking | COMPLETE |
| 5 | DTDC courier tracking (English) | COMPLETE |
| 6 | Tamil courier tracking | COMPLETE |

Output:
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

1. Push to GitHub
2. [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Settings → Variables:

| Variable | Required for |
|----------|-------------|
| `GEMINI_API_KEY` | Real LLM navigation |
| `SARVAM_API_KEY` | Real STT/TTS |
| `TWILIO_ACCOUNT_SID` | Live WhatsApp |
| `TWILIO_AUTH_TOKEN` | Live WhatsApp |
| `TWILIO_WHATSAPP_FROM` | Live WhatsApp |
| `BASE_URL` | Your Railway app URL |

4. Deploy. App starts in mock mode if no secrets are set — safe to demo without keys.
5. Set Twilio WhatsApp sandbox webhook to `https://<your-app>.railway.app/whatsapp`.

### Local with tunnel

```bash
npm run tunnel     # starts ngrok on port 3000
npm start          # in a second terminal
```

The startup block will print the tunnel URL and the exact webhook URL to paste into Twilio.

---

## Demo Guide (for judges — 2 minutes)

| Page | What you see |
|------|-------------|
| `/` | Cinematic landing with AI-generated video background |
| `/demo` | Split-screen — WhatsApp left, AI execution timeline right |
| `/playground` | Three-column detective view — state machine, IVR prompt, Gemini reasoning |
| `/metrics` | Trust page — reliability data + engineering incident learnings |

**Suggested path:**
1. `/` — watch the video, read the hero copy
2. `/demo` — click "Tamil LPG", hit Run, watch both sides animate
3. `/playground` — Start Investigation → click through every decision
4. `/metrics` — expand the incident cards

---

## Reliability Learnings

### Gemini quota failures

During development, Gemini's free tier hit quota limits mid-demo. Every Gemini call wraps in `try/catch`; on any failure, execution falls through to `heuristicNavigate()`. The harness validates both paths. Run without a `GEMINI_API_KEY` to verify the fallback.

### Consumer number hash bug

An early version entered the consumer number without a trailing `#` even when the IVR said "followed by hash." The IVR would time out. Fix: `heuristicNavigate()` checks `/hash|pound|#/.test(prompt)` and appends `#` only when explicitly requested. Without this, "consumer number confirmed, press 1" would misfire on the number-entry rule.

### Fallback ordering strategy

The heuristic navigator uses ordered regex matching: completion signals first, then confirmation menus, then number-entry prompts, then main menus. Ordering matters — a naive implementation matches the wrong rule and loops indefinitely.

---

## File Structure

```
src/
  config/
    index.js              env detection, mock/live mode per service
  core/
    intent-extractor.js   Gemini-powered intent parsing
    sakthiflow.js         IVR navigation state machine
    mock-ivr-engine.js    realistic IVR simulation (Indane, HP, Bharat, DTDC)
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
    speaker.js            optional local playback (opt-in, never in prod)
    logger.js             structured logging
    ngrok.js              ngrok tunnel detection
scripts/
  harness.js              end-to-end eval harness (npm run harness)
public/
  video/
    hero.mp4              stitched AI-generated video (7 scenes × 10s)
  audio/                  TTS output files (auto-cleaned)
```
