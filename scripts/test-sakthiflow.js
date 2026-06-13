'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Offline SakthiFlow harness.
//
// Plays the role Twilio plays in production: the wire between the mock provider
// IVR (/mock-ivr/*) and the SakthiFlow engine (/voice/gather). Runs entirely
// in-process with mock providers — no Twilio, no keys, no network.
//
//   mock-ivr returns TwiML  ->  extract <Say> + gather action
//   -> POST /voice/gather (SpeechResult = that text)  ->  SakthiFlow decides
//   -> extract <Play digits> / <Say>  ->  feed back to the IVR
//   -> repeat until <Hangup/>  ->  record outcome
//
// Then prints the evaluation metrics table.
// ─────────────────────────────────────────────────────────────────────────────

process.env.PORT = process.env.PORT || '3999';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const { v4: uuidv4 } = require('uuid');
const app = require('../src/index');
const config = require('../src/config');
const supabase = require('../src/services/db');
const gemini = require('../src/services/gemini');

const BASE = `http://localhost:${config.PORT}`;
const N = parseInt(process.argv[2], 10) || 20;

// Quieten the very chatty per-step service logs for a clean harness report.
const logger = require('../src/utils/logger');
const _origInfo = logger.info;
const _origDebug = logger.debug;
let QUIET = true;
logger.info = (...a) => {
  if (QUIET) return;
  _origInfo(...a);
};
logger.debug = (...a) => {
  if (QUIET) return;
  _origDebug(...a);
};

// ── Tiny TwiML parsers ───────────────────────────────────────────────────────
function getSayText(twiml) {
  const m = twiml.match(/<Say[^>]*>([\s\S]*?)<\/Say>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}
function getPlayDigits(twiml) {
  const m = twiml.match(/<Play\s+digits="([^"]*)"/i);
  return m ? m[1] : '';
}
function getGatherAction(twiml) {
  const m = twiml.match(/<Gather[^>]*action="([^"]*)"/i);
  return m ? m[1] : '';
}
function hasHangup(twiml) {
  return /<Hangup\s*\/>/i.test(twiml);
}

async function post(pathOrUrl, form) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${BASE}${pathOrUrl}`;
  const body = new URLSearchParams(form).toString();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  return res.text();
}
async function get(pathOrUrl) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${BASE}${pathOrUrl}`;
  const res = await fetch(url);
  return res.text();
}

// Resolve an IVR action path that may be absolute (BASE_URL/...) or relative.
function ivrPath(action) {
  if (!action) return '';
  if (action.startsWith('http')) return action;
  return action; // relative like /mock-ivr/indane/step1
}

// ── Drive one full simulated call ────────────────────────────────────────────
async function runOneCall(runIndex, verbose) {
  const phone = `+9190000${String(10000 + runIndex).slice(-5)}`;
  const provider = 'indane';
  const consumer = '1234567890';

  // Seed the user profile (mock supabase, shared in-process).
  await supabase.getOrCreateUser(phone);
  await supabase.updateUser(phone, {
    language: 'ta-IN',
    lpg_provider: provider,
    lpg_consumer_number: consumer,
  });

  const taskId = uuidv4();
  // Pre-create the task row so logCallStep/updateTask have a target.
  const { data: task } = await supabase.createTask(phone, 'lpg_booking', { task: 'lpg_booking', provider, consumerNumber: consumer });
  const callSid = `HARNESS_${uuidv4()}`;

  const t0 = Date.now();

  // 1) Twilio connects the call -> SakthiFlow.start (opening gather). We patch
  //    the task's call_sid so completion handlers update the right row.
  await supabase.updateTask(task.id, { call_sid: callSid });
  await post(`/voice/outbound?taskId=${task.id}&phone=${encodeURIComponent(phone)}`, { CallSid: callSid });

  // 2) Provider IVR greeting.
  let ivrTwiml = await get(`/mock-ivr/${provider}`);
  let ivrSpeech = getSayText(ivrTwiml);
  let ivrNext = getGatherAction(ivrTwiml);
  let ivrEnded = hasHangup(ivrTwiml) && !ivrNext;

  const steps = [];
  let outcome = 'incomplete';

  for (let i = 0; i < config.MAX_IVR_STEPS + 2; i++) {
    // Feed what the IVR just said to SakthiFlow.
    const decisionTwiml = await post('/voice/gather', { CallSid: callSid, SpeechResult: ivrSpeech, Digits: '' });

    const digits = getPlayDigits(decisionTwiml);
    const sayText = getSayText(decisionTwiml);
    const sakthiHangup = hasHangup(decisionTwiml) && !digits && !sayText;

    const action = digits ? `dtmf(${digits})` : sayText ? `speak("${sayText.slice(0, 30)}")` : sakthiHangup ? 'hangup' : 'wait';
    steps.push({ ivr: ivrSpeech, action });

    if (verbose) {
      console.log(`   IVR: "${ivrSpeech.slice(0, 70)}"`);
      console.log(`   SAKTHI -> ${action}`);
    }

    if (sakthiHangup) {
      // SakthiFlow ended the call. Check whether it completed the task.
      const { data: t } = await supabase.getTaskByCallSid(callSid);
      outcome = t && t.status === 'completed' ? 'completed' : 'failed';
      break;
    }

    if (ivrEnded) {
      // IVR already hung up but SakthiFlow didn't complete — anomaly.
      outcome = 'failed';
      break;
    }

    // Send SakthiFlow's action to the provider IVR.
    const toSend = digits ? { Digits: digits } : { SpeechResult: sayText };
    ivrTwiml = await post(ivrPath(ivrNext), toSend);
    ivrSpeech = getSayText(ivrTwiml);
    ivrNext = getGatherAction(ivrTwiml);
    ivrEnded = hasHangup(ivrTwiml) && !ivrNext;
  }

  const durationMs = Date.now() - t0;

  // Count SakthiFlow decision steps from the call log.
  const logSteps = supabase.getCallLogs(task.id).length;
  const { data: finalTask } = await supabase.getTaskByCallSid(callSid);
  const ref = finalTask && finalTask.result && finalTask.result.bookingReference;

  return { outcome, steps: logSteps, durationMs, ref };
}

// ── Intent accuracy on a fixture set ─────────────────────────────────────────
const INTENT_FIXTURES = [
  { text: 'சக்தி, என் LPG cylinder book பண்ணிடு', expect: 'lpg_booking' },
  { text: 'என் gas cylinder book பண்ணுங்க', expect: 'lpg_booking' },
  { text: 'Indane ka cylinder book karo', expect: 'lpg_booking' },
  { text: 'mujhe gas cylinder chahiye book kar do', expect: 'lpg_booking' },
  { text: 'book my LPG cylinder please', expect: 'lpg_booking' },
  { text: 'HP gas cylinder booking', expect: 'lpg_booking' },
  { text: 'Bharat gas book pannunga', expect: 'lpg_booking' },
  { text: 'cylinder venum book pannu', expect: 'lpg_booking' },
  { text: 'mera package kahan hai DTDC 12345', expect: 'courier_tracking' },
  { text: 'track my courier 998877', expect: 'courier_tracking' },
  { text: 'en parcel track pannunga AWB 4455', expect: 'courier_tracking' },
  { text: 'where is my delhivery package 7788', expect: 'courier_tracking' },
  { text: 'bluedart consignment track karo 6543', expect: 'courier_tracking' },
  { text: 'my amazon parcel status 11122', expect: 'courier_tracking' },
];

async function intentAccuracy() {
  let correct = 0;
  for (const f of INTENT_FIXTURES) {
    const intent = await gemini.extractIntent(f.text, '+910000000000');
    if (intent.task === f.expect) correct += 1;
  }
  return { correct, total: INTENT_FIXTURES.length };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const server = app.listen(config.PORT);
  await new Promise((r) => server.once('listening', r));

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  CallSakthi — SakthiFlow offline harness');
  console.log(`  Mode: gemini=${gemini.isLive ? 'LIVE' : 'mock'}  |  runs=${N}`);
  console.log('══════════════════════════════════════════════════════════════\n');

  // Show one verbose call so the navigation loop is visible.
  console.log('▶ Sample call trace (run 1):');
  const sample = await runOneCall(0, true);
  console.log(`   → outcome=${sample.outcome}, steps=${sample.steps}, ref=${sample.ref}\n`);

  // Run the rest quietly and collect metrics.
  const results = [sample];
  for (let i = 1; i < N; i++) {
    results.push(await runOneCall(i, false));
  }

  const completed = results.filter((r) => r.outcome === 'completed');
  const completionRate = ((completed.length / N) * 100).toFixed(1);
  const avgSteps = completed.length
    ? (completed.reduce((s, r) => s + r.steps, 0) / completed.length).toFixed(1)
    : '0';
  const avgDuration = (results.reduce((s, r) => s + r.durationMs, 0) / N).toFixed(0);

  const intent = await intentAccuracy();
  const intentPct = ((intent.correct / intent.total) * 100).toFixed(1);

  console.log('══════════════════════════════════════════════════════════════');
  console.log('  EVALUATION METRICS');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Intent Accuracy      : ${intentPct}%  (${intent.correct}/${intent.total} fixtures)`);
  console.log(`  IVR Completion Rate  : ${completionRate}%  (${completed.length}/${N} calls)`);
  console.log(`  Avg Steps to Complete: ${avgSteps}`);
  console.log(`  Avg Call Duration    : ${avgDuration} ms (simulated, in-process)`);
  console.log('══════════════════════════════════════════════════════════════\n');

  server.close();
  // Restore logger and exit.
  logger.info = _origInfo;
  logger.debug = _origDebug;
  process.exit(completed.length === N && intent.correct === intent.total ? 0 : 1);
}

main().catch((err) => {
  console.error('Harness failed:', err);
  process.exit(2);
});
