'use strict';

const config = require('../config');
const logger = require('./../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Google Gemini 1.5 Flash-Lite — intent extraction + SakthiFlow IVR navigation.
//
// MOCK mode (no GEMINI_API_KEY) uses deterministic rule-based logic that mirrors
// the model's contract, so the offline harness exercises the real SakthiFlow loop
// without any network. Adding GEMINI_API_KEY flips every function to the LLM.
// ─────────────────────────────────────────────────────────────────────────────

const LIVE = config.mode.gemini === 'live';

let model = null;
if (LIVE) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
  model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
  logger.info('GEMINI', 'Live model gemini-2.5-flash-lite initialized');
} else {
  logger.info('GEMINI', 'Running in MOCK mode (deterministic navigator)');
}

// Strip markdown code fences and parse JSON. Throws on failure.
function parseJson(responseText) {
  const clean = String(responseText)
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
  return JSON.parse(clean);
}

async function callModel(systemText, userText) {
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: `${systemText}\n\n${userText}` }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
  });
  return result.response.text();
}

// ── Script / keyword helpers (used by both mock + as fallbacks) ──────────────
function detectLanguage(text) {
  if (/[஀-௿]/.test(text)) return 'ta-IN'; // Tamil
  if (/[ऀ-ॿ]/.test(text)) return 'hi-IN'; // Devanagari
  return 'en-IN';
}

function detectProvider(text) {
  const t = text.toLowerCase();
  if (/indane|இந்தேன்/.test(t)) return 'indane';
  if (/\bhp\b|hp gas|एचपी/.test(t)) return 'hp';
  if (/bharat|भारत/.test(t)) return 'bharat';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// extractIntent(transcript, userPhone)
// ─────────────────────────────────────────────────────────────────────────────
async function extractIntent(transcript, userPhone) {
  const system = `You are an intent extractor for CallSakthi, an Indian WhatsApp voice assistant.
Extract the user's intent from Tamil/Hindi/English text.
Return ONLY valid JSON with no markdown, no explanation, nothing else.`;

  const user = `User transcript: "${transcript}"
User phone: "${userPhone}"

Return this exact JSON structure:
{
  "task": "lpg_booking" | "courier_tracking" | "unknown",
  "language": "ta-IN" | "hi-IN" | "en-IN",
  "provider": "indane" | "hp" | "bharat" | null,
  "consumerNumber": "string or null",
  "trackingId": "string or null",
  "courierCompany": "dtdc" | "bluedart" | "delhivery" | "amazon" | null,
  "confidence": 0.0 to 1.0,
  "rawIntentEnglish": "one sentence English summary of what the user wants",
  "missingInfo": ["list of what you still need, e.g. 'lpg_provider', 'consumer_number'"]
}

Examples:
- "என் LPG cylinder book பண்ணிடு" -> task: lpg_booking, language: ta-IN
- "Indane ka cylinder book karo" -> task: lpg_booking, provider: indane, language: hi-IN
- "mera package kahan hai DTDC 12345" -> task: courier_tracking, courierCompany: dtdc, trackingId: "12345"`;

  if (LIVE) {
    try {
      const text = await callModel(system, user);
      return parseJson(text);
    } catch (err) {
      logger.error('GEMINI', 'extractIntent failed, falling back to heuristic', err);
      // fall through to heuristic below
    }
  }
  return heuristicIntent(transcript);
}

function heuristicIntent(transcript) {
  const t = String(transcript).toLowerCase();
  const language = detectLanguage(transcript);
  const provider = detectProvider(transcript);

  const isLpg = /(lpg|cylinder|சிலிண்டர்|gas|గ్యాస్|book.*gas|gas.*book|சக்தி.*book|book.*பண்ண)/i.test(transcript) || /cylinder|lpg/.test(t);
  const isCourier = /(track|package|courier|parcel|awb|consignment|delivery|डाक|पार्सल|कूरियर|पैकेज|பார்சல்|கூரியர்|டிராக்|டெலிவரி|தபால்)/i.test(transcript);

  let task = 'unknown';
  let confidence = 0.4;
  if (isLpg) {
    task = 'lpg_booking';
    confidence = 0.85;
  } else if (isCourier) {
    task = 'courier_tracking';
    confidence = 0.8;
  }

  // consumer / tracking number: grab a long digit run.
  const digits = (transcript.match(/\d{4,}/g) || [])[0] || null;

  let courierCompany = null;
  if (/dtdc/i.test(t)) courierCompany = 'dtdc';
  else if (/bluedart|blue dart/i.test(t)) courierCompany = 'bluedart';
  else if (/delhivery/i.test(t)) courierCompany = 'delhivery';
  else if (/amazon/i.test(t)) courierCompany = 'amazon';

  const missingInfo = [];
  if (task === 'lpg_booking') {
    if (!provider) missingInfo.push('lpg_provider');
    if (!digits) missingInfo.push('consumer_number');
  } else if (task === 'courier_tracking') {
    if (!digits) missingInfo.push('tracking_id');
  }

  return {
    task,
    language,
    provider: task === 'lpg_booking' ? provider : null,
    consumerNumber: task === 'lpg_booking' ? digits : null,
    trackingId: task === 'courier_tracking' ? digits : null,
    courierCompany: task === 'courier_tracking' ? courierCompany : null,
    confidence,
    rawIntentEnglish:
      task === 'lpg_booking'
        ? 'User wants to book an LPG gas cylinder.'
        : task === 'courier_tracking'
        ? 'User wants to track a courier package.'
        : 'Intent could not be determined.',
    missingInfo,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// navigateIVR — the SakthiFlow brain.
// ─────────────────────────────────────────────────────────────────────────────
async function navigateIVR(goal, userInfo, callHistory, currentIvrPrompt, stepNumber) {
  const system = `You are SakthiFlow — an AI agent that navigates Indian telephone IVR systems to complete tasks for users.
You hear what the IVR says and decide what to do next to complete the goal.
Return ONLY valid JSON, no markdown, no explanation.
CRITICAL RULES:
1. If IVR offers numbered options, use DTMF (press a digit) — never speak for menu navigation
2. If IVR asks you to speak (name, number, etc.), use the speak action
3. Extract confirmation/reference numbers from IVR prompts — they are your success signal
4. If you've been going for more than 10 steps with no progress, action = "failed"
5. Detect task completion by listening for: "booking confirmed", "reference number", "successfully booked", or equivalent in Hindi/Tamil`;

  const historyStr =
    (callHistory || [])
      .map((h) => `Step ${h.step}: IVR said "${h.ivr_prompt}" -> I did: ${h.action}(${h.value})`)
      .join('\n') || 'Just connected, no steps yet';

  const user = `TASK GOAL: ${goal}

USER DETAILS:
- LPG Provider: ${userInfo.lpg_provider}
- Consumer Number: ${userInfo.lpg_consumer_number}
- Language preference: ${userInfo.language}

CALL HISTORY (what happened so far):
${historyStr}

CURRENT IVR PROMPT (what the IVR just said):
"${currentIvrPrompt}"

STEP NUMBER: ${stepNumber} of maximum 12

Decide what to do. Return this exact JSON:
{
  "action": "dtmf" | "speak" | "wait" | "complete" | "failed",
  "value": "the digit to press (for dtmf) OR the words to speak (for speak) OR null",
  "reasoning": "brief explanation of why you chose this",
  "isTaskComplete": false,
  "extractedResult": null OR { "bookingReference": "...", "status": "confirmed" }
}`;

  if (LIVE) {
    try {
      const text = await callModel(system, user);
      return parseJson(text);
    } catch (err) {
      logger.error('GEMINI', 'navigateIVR failed, falling back to heuristic', err);
    }
  }
  return heuristicNavigate(userInfo, callHistory, currentIvrPrompt, stepNumber);
}

// Deterministic IVR navigator covering the LPG + courier mock flows.
function heuristicNavigate(userInfo, callHistory, prompt, stepNumber) {
  const p = String(prompt || '').toLowerCase();

  // Safety: too many steps with no completion.
  if (stepNumber >= config.MAX_IVR_STEPS - 1) {
    return {
      action: 'failed',
      value: null,
      reasoning: 'Exceeded maximum IVR steps without completing the task.',
      isTaskComplete: false,
      extractedResult: null,
    };
  }

  // Success signal: reference / booked / confirmed.
  if (/successfully booked|booking reference|reference number|booking confirmed|successfully tracked|status is/.test(p)) {
    const ref = extractReference(prompt);
    return {
      action: 'complete',
      value: null,
      reasoning: `Detected task completion. Extracted reference "${ref}".`,
      isTaskComplete: true,
      extractedResult: { bookingReference: ref, status: 'confirmed' },
    };
  }

  // Confirmation menu: "Press 1 to confirm". Checked BEFORE number-entry so that
  // "consumer number is confirmed. Press 1 to confirm" isn't mistaken for an
  // entry prompt.
  if (/press 1 to confirm|confirm.*press 1|press 1.*confirm|confirm karne ke liye 1/.test(p)) {
    return {
      action: 'dtmf',
      value: '1',
      reasoning: 'IVR asked to confirm the booking — pressing 1.',
      isTaskComplete: false,
      extractedResult: null,
    };
  }

  // Asked to ENTER a consumer / tracking number. Requires an explicit "enter"
  // verb (English or Hindi: darj/bolein/batayein) near the noun, so a passive
  // mention of "consumer number" doesn't trigger entry.
  if (/(enter|darj|provide|key in|type|bolein|batayein|bataye).{0,30}(consumer|tracking|awb|number|id)|enter your.*number|(consumer|tracking|awb)[^.]{0,30}(bolein|batayein|darj|enter|key in)/.test(p)) {
    const num = (userInfo.lpg_consumer_number || userInfo.tracking_id || '1234567890');
    const needsHash = /hash|pound|#/.test(p);
    return {
      action: 'dtmf',
      value: needsHash ? `${num}#` : `${num}`,
      reasoning: 'IVR requested the consumer/tracking number — entering it via keypad.',
      isTaskComplete: false,
      extractedResult: null,
    };
  }

  // Main menu: choose cylinder booking / tracking (option 1). Handles English
  // ("press 1 for booking", "welcome to") and Hindi ("... ke liye 1 dabayein").
  if (/press 1 for (cylinder )?booking|booking.*press 1|press 1.*cylinder|press 1 to track|welcome to|booking ke liye 1|cylinder booking ke liye|1 dabaye|1 dabayein|ek dabaye/.test(p)) {
    return {
      action: 'dtmf',
      value: '1',
      reasoning: 'Main menu — selecting cylinder booking (option 1).',
      isTaskComplete: false,
      extractedResult: null,
    };
  }

  // Generic "press 1" fallback.
  if (/press 1/.test(p)) {
    return {
      action: 'dtmf',
      value: '1',
      reasoning: 'Selecting option 1 as the most likely path to the goal.',
      isTaskComplete: false,
      extractedResult: null,
    };
  }

  // Nothing recognized yet — wait for the IVR to continue.
  return {
    action: 'wait',
    value: null,
    reasoning: 'No actionable prompt detected yet; waiting for the IVR to continue.',
    isTaskComplete: false,
    extractedResult: null,
  };
}

// Pull a reference number out of an IVR prompt like "reference number is 7 8 9 3 4".
function extractReference(prompt) {
  const text = String(prompt);
  // Prefer the digits that follow "reference number is ..." / "number is ...".
  const m = text.match(/(?:reference number|booking reference|number is)\D*([\d\s]+)/i);
  let digits = m ? m[1] : text;
  digits = (digits.match(/\d/g) || []).join('');
  return digits || 'UNKNOWN';
}

// ─────────────────────────────────────────────────────────────────────────────
// Natural-language message generators (mock = templated strings).
// ─────────────────────────────────────────────────────────────────────────────
async function generateConfirmationMessage(intentData, userInfo, language) {
  if (LIVE) {
    try {
      const system = `You write short, warm WhatsApp confirmation messages for CallSakthi in the user's language. Plain text only.`;
      const user = `Generate a short message (under 100 words) in ${language} confirming this task and asking the user to reply "ஆமா"/"ஆம்"/"Yes" to proceed.
Task: ${JSON.stringify(intentData)}
User: provider=${userInfo.lpg_provider}, consumer=${userInfo.lpg_consumer_number}`;
      const text = await model
        .generateContent(`${system}\n\n${user}`)
        .then((r) => r.response.text());
      return text.trim();
    } catch (err) {
      logger.error('GEMINI', 'generateConfirmationMessage failed, using template', err);
    }
  }
  return templateConfirmation(intentData, userInfo, language);
}

function templateConfirmation(intentData, userInfo, language) {
  const provider = (userInfo.lpg_provider || intentData.provider || '').toUpperCase();
  const consumer = userInfo.lpg_consumer_number || intentData.consumerNumber || '';
  if (intentData.task === 'lpg_booking') {
    if (language === 'ta-IN') {
      return `நான் ${provider} Gas-க்கு call பண்ணி, consumer number ${consumer}-க்கு cylinder book பண்ணப் போறேன். சரிதானா? "ஆமா" என்று reply பண்ணுங்க, இல்லைனா "வேண்டாம்".`;
    }
    if (language === 'hi-IN') {
      return `मैं ${provider} Gas को call करके consumer number ${consumer} के लिए cylinder book करने जा रहा हूँ। सही है? आगे बढ़ने के लिए "ஆம்" / "Yes" भेजें, या "नहीं".`;
    }
    return `I will call ${provider} Gas and book a cylinder for consumer number ${consumer}. Shall I proceed? Reply "Yes" to go ahead or "No" to cancel.`;
  }
  // courier
  if (language === 'ta-IN') {
    return `உங்கள் package-ஐ track பண்ணப் போறேன். தொடரட்டுமா? "ஆமா" அல்லது "வேண்டாம்" என்று reply பண்ணுங்க.`;
  }
  return `I will track your courier package now. Shall I proceed? Reply "Yes" or "No".`;
}

async function generateResultMessage(task, result, language) {
  if (LIVE) {
    try {
      const text = await model
        .generateContent(
          `Write a short, happy WhatsApp message in ${language} telling the user their task is done. Plain text only.
Task type: ${task.task_type}. Result: ${JSON.stringify(result)}.`,
        )
        .then((r) => r.response.text());
      return text.trim();
    } catch (err) {
      logger.error('GEMINI', 'generateResultMessage failed, using template', err);
    }
  }
  return templateResult(task, result, language);
}

function templateResult(task, result, language) {
  const ref = (result && result.bookingReference) || '';
  if (task.task_type === 'lpg_booking') {
    if (language === 'ta-IN') return `🎉 உங்கள் cylinder book ஆச்சு! Reference number: ${ref}. நன்றி!`;
    if (language === 'hi-IN') return `🎉 आपका cylinder book हो गया! Reference number: ${ref}. धन्यवाद!`;
    return `🎉 Your cylinder has been booked! Reference number: ${ref}. Thank you!`;
  }
  if (language === 'ta-IN') return `📦 உங்கள் package status: ${ref || 'updated'}.`;
  return `📦 Your package status: ${ref || 'updated'}.`;
}

async function generateErrorMessage(taskType, errorReason, language) {
  if (LIVE) {
    try {
      const text = await model
        .generateContent(
          `Write a short, kind WhatsApp message in ${language} apologizing that the task could not be completed, explaining briefly, and suggesting to try again. Plain text only.
Task type: ${taskType}. Reason: ${errorReason}.`,
        )
        .then((r) => r.response.text());
      return text.trim();
    } catch (err) {
      logger.error('GEMINI', 'generateErrorMessage failed, using template', err);
    }
  }
  return templateError(taskType, language);
}

function templateError(taskType, language) {
  if (language === 'ta-IN') {
    return `😔 மன்னிக்கவும், உங்கள் ${taskType === 'lpg_booking' ? 'cylinder booking' : 'task'} இப்போது complete பண்ண முடியல. கொஞ்ச நேரம் கழித்து மீண்டும் voice note அனுப்புங்க.`;
  }
  if (language === 'hi-IN') {
    return `😔 माफ़ कीजिए, अभी आपका काम पूरा नहीं हो सका। थोड़ी देर बाद फिर से voice note भेजें।`;
  }
  return `😔 Sorry, I couldn't complete your task right now. Please send a voice note again in a little while.`;
}

module.exports = {
  isLive: LIVE,
  parseJson,
  extractIntent,
  navigateIVR,
  generateConfirmationMessage,
  generateResultMessage,
  generateErrorMessage,
  // exported for tests
  _heuristicIntent: heuristicIntent,
  _heuristicNavigate: heuristicNavigate,
  _extractReference: extractReference,
};
