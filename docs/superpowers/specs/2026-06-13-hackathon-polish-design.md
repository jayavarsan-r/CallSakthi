# CallSakthi — Hackathon Polish Design

**Date:** 2026-06-13
**Status:** Approved (refined 2026-06-13)

## Scope

Evolve the existing CallSakthi implementation into a complete, polished, deployable
hackathon submission. No new architectures. No new frameworks. Three judge
experiences: public demo, playground, metrics. All demo pages work in mock mode with
zero env vars.

---

## What already exists (do not break)

- `/demo` — SSE-streaming page, full SakthiFlow trace, inline metrics widget
- `/demo/metrics` — JSON endpoint reading real SQLite
- `/mock-ivr/*` — TwiML mock IVR provider simulations
- `scripts/harness.js` — 6-case end-to-end eval, prints metrics table
- Mock/live abstraction: Gemini, Sarvam, Twilio (each detects key presence)
- SQLite via `src/services/db.js` (replaced Supabase)
- Railway-ready (`railway.json`, `/tmp` DB path, `Procfile`)
- Startup status block in `src/index.js`

---

## Changes

### 1. `/playground` — "Inside SakthiFlow" Cinematic Step-Through

**Page title:** "Inside SakthiFlow" / subtitle: "See every decision behind the call."
URL stays `/playground`. The word "playground" does not appear on the page.

**New file:** `src/routes/playground.js`, registered in `src/index.js` as
`app.use('/playground', playgroundRouter)`.

**GET /playground** — serves the HTML page.

**POST /playground/start** — accepts `{ scenario, consumerNumber, provider }`. Runs
`mockIVREngine.runMockIVR()` with speaker suppressed (see speaker fix below),
captures all step events via the `onStep` callback into an array, returns the full
array as `application/json`. No SSE needed — one response with all steps buffered.

**Client owns all pacing:**
- On "Start Investigation" click: POST to `/playground/start`, receive full steps
  array, lock the button, show state machine strip
- "Next Step" button reveals one card at a time
- Each card animates in: IVR prompt fades in, then typewriter effect plays the
  `reasoning` text character by character (~30ms/char), then decision badge pulses in
- State machine strip (`START → CALLING → NAVIGATING → PROCESSING → COMPLETED`)
  updates its active badge on each step based on step type
- Final card (terminal success): shows booking reference + Tamil summary text +
  "Why should I trust this?" reliability card, `COMPLETED` badge glows green

**Step card anatomy:**
```
╔─ Step N — [STATE] ───────────────────────────────────╗
│ IVR                                                   │
│  "[ivr_prompt text]"                                  │
├───────────────────────────────────────────────────────┤
│ Gemini thinks...             [typewriter animation]   │
│  "[reasoning text]"                                   │
├───────────────────────────────────────────────────────┤
│  Decision ▶  [ACTION] ( [value] )   [colored badge]  │
╚───────────────────────────────────────────────────────╝
```

Action badge colors: `dtmf` → purple, `speak` → green, `wait` → grey,
`complete` → bright green, `failed` → red.

**Final card (SUCCESS) — two parts:**

Part 1: result
```
╔─ COMPLETED ──────────────────────────────────────────╗
│  ✓ Booking Reference: IND78934                       │
│  உங்கள் சிலிண்டர் பதிவு செய்யப்பட்டது             │
╚───────────────────────────────────────────────────────╝
```

Part 2: reliability card (appended below, same card or adjacent)
```
╔─ What makes this reliable? ──────────────────────────╗
│  • Confirmation before execution                     │
│  • Fallback when Gemini fails                        │
│  • Deterministic IVR execution in mock mode          │
│  • 100% completion across harness tests              │
│  • No hardcoded decision trees                       │
╚───────────────────────────────────────────────────────╝
```

Tamil summary is a hardcoded template per scenario (same as `gemini.templateResult`
in mock mode). No extra Gemini call needed.

**Scenario picker:**
- Radio: LPG Booking / Courier Tracking
- Text input: Consumer number (default `1234567890`)
- Provider select: Indane / HP Gas / Bharat Gas (for LPG)
- "Start Investigation" button

**Visual style:** Matches `/demo` — `#0f0f0f` background, `#1a1a1a` cards, same
font stack, same color palette for action types.

---

### 2. `/metrics` — Dedicated Metrics Page

**New file:** `src/routes/metrics.js`, registered as `app.use('/metrics', metricsRouter)`.

**GET /metrics** — serves the HTML page. Fetches from `/metrics/data` on load.

**GET /metrics/data** — returns JSON with all metrics needed for the page.

**Data needed (all from SQLite, no fabrication):**
- `getAllMetrics()` — already exists: `{ total, completed, failed, avgSteps }`
- New `getRecentTasks(10)` in `db.js` — last 10 tasks with step count and duration
- Harness-derived constants shown as static display: "6 test cases", "LPG + Courier"

**Layout:**

Row 1 — headline cards (4):
- Intent Accuracy (from harness output — displayed as static "100%" with note
  "verified by harness")
- IVR Completion Rate (computed: `completed / total * 100` or `—` if total=0)
- Avg IVR Steps (from `getAllMetrics().avgSteps`)
- Avg Duration (from recent tasks)

Row 2 — volume cards (3):
- Total Tasks
- Completed
- Failed

Row 3 — decision breakdown (2):
- LLM Decisions (count of `action_taken` rows where gemini was live — tracked in
  `call_logs.reasoning` — or static "MOCK" if no key)
- Heuristic Decisions (remainder)

Row 4 — Recent Runs table:
- Last 10 tasks: Time | Type | Status | Steps | Duration
- Empty state: "Run `npm run harness` to populate"

**"Refresh" button** re-fetches `/metrics/data` without page reload.

---

### 3. Homepage (`/`) — Judge Landing Page

Replace the current JSON stub (`res.json({ name: 'CallSakthi', ... })`) with a real
HTML landing page. This is the first thing a judge sees from the Railway URL.

**Hero text:**
```
What if your parents never had to navigate
"Press 1 for English" ever again?

CallSakthi turns voice notes into completed phone tasks.
```

**Three navigation cards (full-width, clickable):**
```
▶ Try the Experience
  Grandma's journey — type a request and watch Sakthi complete it.
  → /demo

▶ Inside SakthiFlow
  See every AI decision behind the call, step by step.
  → /playground

▶ Metrics & Reliability
  Validate the engineering. Real data, real tests.
  → /metrics
```

No authentication. No loading state. Instant. Works in mock mode.

Visual style: same dark theme, cards on `#0f0f0f`, large hero text in white.

---

### 4. `db.js` addition — `getRecentTasks(limit)`

```js
function getRecentTasks(limit = 10) {
  const rows = db.prepare(`
    SELECT t.id, t.task_type, t.status, t.created_at, t.updated_at,
           COUNT(cl.id) as step_count
    FROM tasks t
    LEFT JOIN call_logs cl ON cl.task_id = t.id
    GROUP BY t.id
    ORDER BY t.created_at DESC
    LIMIT ?
  `).all(limit);
  return { data: rows, error: null };
}
```

Exported from `db.js`, used by `/metrics/data`.

---

### 5. Startup block update — `src/index.js`

Add three URL lines to the existing `printStartupChecklist` lines array, after the
existing `✓ Ready to receive WhatsApp messages` line:

```
   Demo:        http://localhost:PORT/demo
   Playground:  http://localhost:PORT/playground
   Metrics:     http://localhost:PORT/metrics
```

Also register the two new routers in `src/index.js`.

---

### 6. Speaker fix — `src/utils/speaker.js`

Change the guard condition from checking `SPEAKER === 'off'` (harness-set env var)
to a positive opt-in: speaker only plays when explicitly enabled AND not in
production:

```js
const speakerEnabled =
  process.env.SPEAKER === 'on' &&
  process.env.NODE_ENV !== 'production';
```

All speak calls return early if `!speakerEnabled`. This means:
- Railway → silent (no audio device, no crash)
- `/playground` server process → silent (no accidental audio during judge visit)
- Local `npm start` → silent by default (was already silent without SPEAKER=off)
- Local demo with SPEAKER=on + NODE_ENV=development → speaks through host speakers

---

### 7. README rewrite

Replace README.md with 8 sections:

1. **Problem Statement** — the elderly grandparent use case, IVR phone tree pain
2. **Product Vision** — WhatsApp as the interface, no app to install, voice in Tamil
3. **SakthiFlow** — the agent loop, from scratch, no LangChain, state machine
4. **Demo Guide** — what to visit, what to try, what to observe
5. **Local Setup** — `npm install && npm start`, mock mode, zero keys
6. **Railway Deployment** — 6 steps, required env vars table
7. **Harness Validation** — `npm run harness`, what the output means
8. **Reliability Learnings** — Gemini quota failures + fallback strategy,
   consumer number regex bug and fix (`needsHash` detection for `#` suffix)

---

## Files changed

| File | Change |
|------|--------|
| `src/routes/playground.js` | NEW — "Inside SakthiFlow" page |
| `src/routes/metrics.js` | NEW — dedicated metrics page |
| `src/services/db.js` | Add `getRecentTasks` |
| `src/utils/speaker.js` | Fix speaker guard (opt-in, not opt-out) |
| `src/index.js` | Register 3 new routes, homepage, startup URLs |
| `README.md` | Full rewrite (8 sections) |

## Files NOT changed

`sakthiflow.js`, `mock-ivr-engine.js`, `gemini.js`, `sarvam.js`, `twilio.js`,
`harness.js`, `confirmation.js`, `task-executor.js`, `config/index.js`,
`routes/whatsapp.js`, `routes/voice.js`, `routes/mock-ivr.js`, `routes/demo.js`

---

## Success criteria

- `npm install && npm start` boots, prints status block with all 3 URLs
- `/` — judge sees hero landing page with 3 navigation cards, no JSON blob
- `/demo` works exactly as before
- `/playground` — page title is "Inside SakthiFlow"; judge can pick LPG Booking,
  click "Start Investigation", step through all IVR decisions cinematically, reach
  COMPLETED with booking reference + reliability card
- `/metrics` — loads from real SQLite, shows `—` before harness, populates after
  `npm run harness`
- `npm run harness` still exits 0 with 100% intent accuracy + 100% IVR completion
- Railway deploy: zero config, mock mode, all pages publicly accessible
- Speaker never plays in production or during `/playground` visits

---

## Constraints

- No LangChain, RAG, vector DB, new frameworks
- No fabricated metrics data
- All demo pages work with empty `.env`
- Live mode (Twilio, Gemini, Sarvam) preserved and functional
