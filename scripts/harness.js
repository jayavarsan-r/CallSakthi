'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// CallSakthi evaluation harness.
//
// Exercises the real pipeline end-to-end with no audio output:
//   intent extraction (Gemini)  →  mock IVR navigation (Gemini)  →  result.
// Prints intent accuracy, IVR completion rate, avg steps, and avg duration.
//
//   npm run harness
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
process.env.SPEAKER = 'off'; // no speaker playback during the harness

const intentExtractor = require('../src/core/intent-extractor');
const mockIVREngine = require('../src/core/mock-ivr-engine');
const { v4: uuidv4 } = require('uuid');

const TEST_CASES = [
  { input: 'சக்தி, என் LPG cylinder book பண்ணிடு', expectedTask: 'lpg_booking', provider: 'indane' },
  { input: 'Indane ka cylinder book karo', expectedTask: 'lpg_booking', provider: 'indane' },
  { input: 'Book my HP Gas cylinder, consumer number 9876543210', expectedTask: 'lpg_booking', provider: 'hp' },
  { input: 'Bharat gas booking karna hai', expectedTask: 'lpg_booking', provider: 'bharat' },
  { input: 'My DTDC package status check karo, tracking DTDC99887', expectedTask: 'courier_tracking', provider: 'courier' },
  { input: 'எனது பார்சல் எங்கே இருக்கு', expectedTask: 'courier_tracking', provider: 'courier' },
];

async function runHarness() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   CallSakthi Evaluation Harness      ║');
  console.log('╚══════════════════════════════════════╝\n');

  const results = [];

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    console.log(`\n[${i + 1}/${TEST_CASES.length}] "${tc.input}"`);
    console.log('─'.repeat(55));

    const startTime = Date.now();

    try {
      const { intent } = await intentExtractor.processTextMessage(tc.input, 'harness');
      const intentCorrect = intent.task === tc.expectedTask;

      console.log(`  Intent:     ${intentCorrect ? '✅' : '❌'} ${intent.task} (expected: ${tc.expectedTask})`);
      console.log(`  Provider:   ${intent.provider || 'auto-detected'}`);
      console.log(`  Language:   ${intent.language}`);
      console.log(`  Confidence: ${((intent.confidence || 0) * 100).toFixed(0)}%`);

      const demoUser = {
        phone: 'harness',
        language: intent.language || 'ta-IN',
        lpg_provider: intent.provider || tc.provider,
        lpg_consumer_number: intent.consumerNumber || intent.trackingId || '1234567890',
      };

      const taskId = `harness_${uuidv4()}`;
      const ivrResult = await mockIVREngine.runMockIVR(taskId, tc.provider, demoUser);

      const ivrSuccess = ivrResult.success && !!ivrResult.result;
      const duration = Date.now() - startTime;

      console.log(`  IVR:        ${ivrSuccess ? '✅' : '❌'} ${ivrSuccess ? 'Completed' : 'Failed'} in ${ivrResult.totalSteps} steps`);
      console.log(`  Result:     ${JSON.stringify(ivrResult.result || 'none')}`);
      console.log(`  Duration:   ${(duration / 1000).toFixed(1)}s`);

      results.push({ input: tc.input, intentCorrect, ivrSuccess, steps: ivrResult.totalSteps, duration });
    } catch (err) {
      console.log(`  ❌ Error: ${err.message}`);
      results.push({ input: tc.input, intentCorrect: false, ivrSuccess: false, steps: 0, duration: 0 });
    }
  }

  const intentAcc = results.filter((r) => r.intentCorrect).length / results.length;
  const ivrRate = results.filter((r) => r.ivrSuccess).length / results.length;
  const avgSteps = results.reduce((s, r) => s + r.steps, 0) / results.length;
  const avgTime = results.reduce((s, r) => s + r.duration, 0) / results.length;

  console.log('\n╔══════════════════════════════════════╗');
  console.log('║            RESULTS                   ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║  Intent Accuracy:   ${(intentAcc * 100).toFixed(0).padStart(3)}%              ║`);
  console.log(`║  IVR Completion:    ${(ivrRate * 100).toFixed(0).padStart(3)}%              ║`);
  console.log(`║  Avg IVR Steps:     ${avgSteps.toFixed(1).padStart(3)}               ║`);
  console.log(`║  Avg Duration:      ${(avgTime / 1000).toFixed(1).padStart(3)}s              ║`);
  console.log('╚══════════════════════════════════════╝\n');

  const allPass = intentAcc === 1 && ivrRate === 1;
  process.exit(allPass ? 0 : 1);
}

runHarness().catch((err) => {
  console.error('Harness failed:', err);
  process.exit(2);
});
