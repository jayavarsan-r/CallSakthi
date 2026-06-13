'use strict';

const gemini = require('../services/gemini');
const db = require('../services/db');
const speaker = require('../utils/speaker');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Mock IVR engine — a local, in-process simulation of provider phone trees.
//
// No Twilio voice number needed: the IVR runs on the server, Gemini (or the
// deterministic mock navigator) decides what to press/say at each step, Sarvam
// TTS speaks every prompt through the laptop speakers, and a real-looking
// booking reference comes back.
//
// Each step: { prompt, accepts: 'dtmf'|'speech'|'none', next: fn(value)→stepKey,
//              terminal: bool, result: {...}|null }
// ─────────────────────────────────────────────────────────────────────────────

const IVR_SCRIPTS = {
  indane: {
    welcome: {
      prompt: 'Welcome to Indane Gas booking service. Press 1 for cylinder booking. Press 2 for booking status. Press 3 to speak to an agent.',
      accepts: 'dtmf',
      next: (v) => (v === '1' ? 'ask_consumer' : v === '2' ? 'ask_status_number' : 'agent_wait'),
    },
    ask_consumer: {
      prompt: 'Please enter your 10 digit consumer number followed by hash.',
      accepts: 'speech',
      next: () => 'confirm_booking',
    },
    ask_status_number: {
      prompt: 'Please enter your consumer number to check booking status.',
      accepts: 'speech',
      next: () => 'give_status',
    },
    give_status: {
      prompt: 'Your last booking was on the 10th. Your next eligible date is today. Press 1 to book now.',
      accepts: 'dtmf',
      next: (v) => (v === '1' ? 'confirm_booking' : 'goodbye'),
    },
    confirm_booking: {
      prompt: 'We found your account. Press 1 to confirm cylinder booking. Press 2 to cancel.',
      accepts: 'dtmf',
      next: (v) => (v === '1' ? 'booking_success' : 'goodbye'),
    },
    booking_success: {
      prompt: 'Your LPG cylinder has been successfully booked. Your booking reference number is IND 7 8 9 3 4. You will receive an SMS confirmation. Thank you for using Indane Gas.',
      accepts: 'none',
      terminal: true,
      result: { bookingReference: 'IND78934', status: 'confirmed', provider: 'Indane' },
    },
    agent_wait: {
      prompt: 'All agents are busy. Please hold or press 1 to leave a callback request.',
      accepts: 'dtmf',
      next: () => 'goodbye',
    },
    goodbye: {
      prompt: 'Thank you for calling Indane Gas. Goodbye.',
      accepts: 'none',
      terminal: true,
      result: null,
    },
  },

  hp: {
    welcome: {
      prompt: 'Namaste. HP Gas seva mein aapka swagat hai. Cylinder booking ke liye 1 dabayein. Shikayat ke liye 2 dabayein.',
      accepts: 'dtmf',
      next: (v) => (v === '1' ? 'ask_consumer' : 'complaint'),
    },
    ask_consumer: {
      prompt: 'Kripya apna consumer number bolein ya enter karein.',
      accepts: 'speech',
      next: () => 'confirm_booking',
    },
    confirm_booking: {
      prompt: 'Aapki booking confirm karne ke liye 1 dabayein.',
      accepts: 'dtmf',
      next: (v) => (v === '1' ? 'booking_success' : 'goodbye'),
    },
    booking_success: {
      prompt: 'Aapka cylinder book ho gaya hai. Reference number HP 4 5 6 7 8. Dhanyawad.',
      accepts: 'none',
      terminal: true,
      result: { bookingReference: 'HP45678', status: 'confirmed', provider: 'HP Gas' },
    },
    complaint: {
      prompt: 'Aapki shikayat darj ho gayi hai. Ek karyakarta 24 ghante mein sampark karega.',
      accepts: 'none',
      terminal: true,
      result: null,
    },
    goodbye: {
      prompt: 'Dhanyawad. Goodbye.',
      accepts: 'none',
      terminal: true,
      result: null,
    },
  },

  bharat: {
    welcome: {
      prompt: 'Welcome to Bharat Gas. For new booking press 1. For delivery status press 2.',
      accepts: 'dtmf',
      next: (v) => (v === '1' ? 'ask_consumer' : 'ask_tracking'),
    },
    ask_consumer: {
      prompt: 'Please say or enter your Bharat Gas consumer ID.',
      accepts: 'speech',
      next: () => 'confirm_booking',
    },
    ask_tracking: {
      prompt: 'Please enter your booking reference number.',
      accepts: 'speech',
      next: () => 'give_tracking',
    },
    give_tracking: {
      prompt: 'Your cylinder is out for delivery. Expected arrival between 10 AM and 2 PM today.',
      accepts: 'none',
      terminal: true,
      result: { deliveryStatus: 'Out for delivery', eta: '10 AM - 2 PM today' },
    },
    confirm_booking: {
      prompt: 'Press 1 to confirm your booking. Press 2 to cancel.',
      accepts: 'dtmf',
      next: (v) => (v === '1' ? 'booking_success' : 'goodbye'),
    },
    booking_success: {
      prompt: 'Booking confirmed. Your reference number is BG 9 9 1 2 3. Thank you for choosing Bharat Gas.',
      accepts: 'none',
      terminal: true,
      result: { bookingReference: 'BG99123', status: 'confirmed', provider: 'Bharat Gas' },
    },
    goodbye: {
      prompt: 'Thank you. Goodbye.',
      accepts: 'none',
      terminal: true,
      result: null,
    },
  },

  courier: {
    welcome: {
      prompt: 'Welcome to courier tracking service. Press 1 to track your shipment. Press 2 for delivery complaint.',
      accepts: 'dtmf',
      next: (v) => (v === '1' ? 'ask_tracking_id' : 'complaint'),
    },
    ask_tracking_id: {
      prompt: 'Please say or enter your tracking ID or AWB number.',
      accepts: 'speech',
      next: () => 'give_status',
    },
    give_status: {
      prompt: 'Your shipment is in transit. It was last scanned at Chennai hub at 6 AM today. Expected delivery tomorrow by 6 PM.',
      accepts: 'none',
      terminal: true,
      result: { trackingStatus: 'In transit', lastLocation: 'Chennai hub', eta: 'Tomorrow by 6 PM' },
    },
    complaint: {
      prompt: 'Your complaint has been registered. You will receive an update within 48 hours.',
      accepts: 'none',
      terminal: true,
      result: null,
    },
  },
};

/**
 * Run the full mock IVR simulation for a task.
 * Uses real Gemini (or the deterministic mock navigator) to navigate, Sarvam TTS
 * to speak each prompt, and plays audio through the laptop speakers.
 *
 * @param {string} taskId
 * @param {string} provider - 'indane' | 'hp' | 'bharat' | 'courier'
 * @param {object} userInfo - { lpg_provider, lpg_consumer_number, language }
 * @param {function} onStep - callback(stepData) for real-time updates (demo page)
 * @returns {Promise<{success, result, steps, totalSteps}>}
 */
async function runMockIVR(taskId, provider, userInfo, onStep = () => {}) {
  const script = IVR_SCRIPTS[provider] || IVR_SCRIPTS.indane;
  const history = [];
  let currentStep = 'welcome';
  let stepNumber = 0;
  const MAX_STEPS = 12;

  const goal = provider === 'courier'
    ? `Track courier shipment. Tracking ID: ${userInfo.lpg_consumer_number || 'not provided'}`
    : `Book LPG cylinder for ${provider}. Consumer number: ${userInfo.lpg_consumer_number}`;

  logger.info('SAKTHIFLOW', `Starting mock IVR — provider: ${provider}, goal: ${goal}`);
  onStep({ type: 'call_started', provider, goal });

  while (stepNumber < MAX_STEPS) {
    const step = script[currentStep];
    if (!step) {
      logger.error('SAKTHIFLOW', `Unknown IVR step: ${currentStep}`);
      break;
    }

    logger.info('SAKTHIFLOW', `Step ${stepNumber} — IVR: "${step.prompt}"`);
    onStep({ type: 'ivr_speaking', step: stepNumber, prompt: step.prompt });

    // Speak the IVR prompt aloud through the speakers.
    const ivrLang = provider === 'hp' ? 'hi-IN' : 'en-IN';
    await speaker.speakText(step.prompt, ivrLang, `IVR Step ${stepNumber}`);

    // Terminal step — the call is done.
    if (step.terminal) {
      db.logCallStep(taskId, `mock_${taskId}`, stepNumber, step.prompt, 'complete', null,
        step.result ? 'Task completed successfully' : 'Call ended without completion');

      onStep({ type: 'call_complete', step: stepNumber, result: step.result });

      if (step.result) {
        logger.info('SAKTHIFLOW', `✅ Task complete — result: ${JSON.stringify(step.result)}`);
      }

      return {
        success: !!step.result,
        result: step.result,
        steps: history,
        totalSteps: stepNumber,
      };
    }

    // Ask Gemini (or the mock navigator) what to do next.
    const decision = await gemini.navigateIVR(goal, userInfo, history, step.prompt, stepNumber);

    logger.info('SAKTHIFLOW',
      `Gemini decision — action: ${decision.action}, value: "${decision.value}", reason: ${decision.reasoning}`);

    db.logCallStep(taskId, `mock_${taskId}`, stepNumber, step.prompt,
      decision.action, decision.value, decision.reasoning);

    history.push({
      step: stepNumber,
      ivr_prompt: step.prompt,
      action: decision.action,
      value: decision.value,
      reasoning: decision.reasoning,
    });

    onStep({
      type: 'gemini_decision',
      step: stepNumber,
      ivrPrompt: step.prompt,
      action: decision.action,
      value: decision.value,
      reasoning: decision.reasoning,
    });

    if (decision.action === 'complete' || decision.isTaskComplete) {
      return {
        success: true,
        result: decision.extractedResult || step.result,
        steps: history,
        totalSteps: stepNumber,
      };
    }
    if (decision.action === 'failed') {
      return { success: false, result: null, steps: history, totalSteps: stepNumber };
    }

    // 'wait' = the agent has no action yet. Don't advance the state machine with
    // a null value (that would misroute the menu) — stay on this step and retry.
    // The MAX_STEPS cap prevents an infinite wait loop.
    if (decision.action === 'wait') {
      stepNumber++;
      await new Promise((r) => setTimeout(r, 800));
      continue;
    }

    // Speak CallSakthi's spoken reply, or note the DTMF press.
    if (decision.action === 'speak' && decision.value) {
      const replyLang = userInfo.language || 'en-IN';
      await speaker.speakText(decision.value, replyLang, 'CallSakthi speaks');
      onStep({ type: 'sakthi_speaking', step: stepNumber, text: decision.value });
    } else if (decision.action === 'dtmf') {
      logger.info('SAKTHIFLOW', `📱 Pressing: ${decision.value}`);
      onStep({ type: 'dtmf_press', step: stepNumber, digit: decision.value });
    }

    // Advance the IVR state machine.
    const nextStep = step.next ? step.next(decision.value) : null;
    if (!nextStep) {
      logger.error('SAKTHIFLOW', 'No next step defined — ending call');
      break;
    }

    currentStep = nextStep;
    stepNumber++;

    // Small pause between steps — feels natural during a live demo.
    await new Promise((r) => setTimeout(r, 800));
  }

  return { success: false, result: null, steps: history, totalSteps: stepNumber };
}

module.exports = { runMockIVR, IVR_SCRIPTS };
