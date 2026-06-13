'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// SakthiFlow — the IVR navigation engine. The core innovation.
//
// Tracks per-call state in an in-memory Map keyed by callSid (all webhooks for
// one phone call hit the same server instance). On each IVR step it asks Gemini
// (or the deterministic mock navigator) what to do, logs the decision, and emits
// TwiML to drive the call forward.
// ─────────────────────────────────────────────────────────────────────────────

const config = require('../config');
const logger = require('../utils/logger');
const gemini = require('../services/gemini');
const sarvam = require('../services/sarvam');
const twilio = require('../services/twilio');
const supabase = require('../services/db');

// callSid -> { taskId, goal, userInfo, stepNumber, history: [{step, ivr_prompt, action, value}] }
const callStates = new Map();

const GATHER = `<Gather input="speech dtmf" timeout="${config.IVR_NAVIGATION_TIMEOUT}" speechTimeout="3" action="${config.BASE_URL}/voice/gather" method="POST">`;

function escapeXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Initialize call state and return the opening TwiML.
 * The IVR speaks first; we just gather what it says.
 */
function start(taskId, callSid, goal, userInfo) {
  callStates.set(callSid, { taskId, goal, userInfo, stepNumber: 0, history: [] });
  logger.info('SAKTHIFLOW', `Call ${callSid} started. Goal: ${goal}`);
  return `<Response>
  ${GATHER}
    <Say voice="Polly.Aditi" language="hi-IN">Call connected. Listening.</Say>
  </Gather>
</Response>`;
}

/**
 * Handle one IVR step. Returns TwiML.
 */
async function processIvrStep(callSid, ivrTranscript, dtmfDigits) {
  const state = callStates.get(callSid);
  if (!state) {
    logger.error('SAKTHIFLOW', `No state for call ${callSid} — hanging up`);
    return `<Response><Hangup/></Response>`;
  }

  const ivrPrompt = [ivrTranscript, dtmfDigits ? `[digits:${dtmfDigits}]` : '']
    .filter(Boolean)
    .join(' ')
    .trim() || '(silence)';

  state.stepNumber += 1;
  const step = state.stepNumber;

  let decision;
  try {
    decision = await gemini.navigateIVR(
      state.goal,
      state.userInfo,
      state.history,
      ivrPrompt,
      step,
    );
  } catch (err) {
    logger.error('SAKTHIFLOW', `navigateIVR threw for ${callSid}`, err);
    decision = { action: 'failed', value: null, reasoning: 'navigateIVR error', isTaskComplete: false, extractedResult: null };
  }

  logger.info(
    'SAKTHIFLOW',
    `Call ${callSid} step ${step}: IVR="${ivrPrompt.slice(0, 80)}" -> ${decision.action}(${decision.value || ''}) :: ${decision.reasoning}`,
  );

  // Persist + record in memory history.
  await supabase.logCallStep(
    state.taskId,
    callSid,
    step,
    ivrPrompt,
    decision.action,
    decision.value,
    decision.reasoning,
  );
  state.history.push({ step, ivr_prompt: ivrPrompt, action: decision.action, value: decision.value });

  // Hard cap.
  if (step >= config.MAX_IVR_STEPS && decision.action !== 'complete') {
    await handleCallFailed(callSid, `Reached max ${config.MAX_IVR_STEPS} steps without completion`);
    return `<Response><Hangup/></Response>`;
  }

  switch (decision.action) {
    case 'dtmf':
      return `<Response>
  <Play digits="${escapeXml(decision.value)}"/>
  ${GATHER}</Gather>
</Response>`;

    case 'speak':
      return `<Response>
  <Say voice="Polly.Aditi" language="hi-IN">${escapeXml(decision.value)}</Say>
  ${GATHER}</Gather>
</Response>`;

    case 'wait':
      return `<Response>
  <Pause length="3"/>
  ${GATHER}</Gather>
</Response>`;

    case 'complete':
      await handleCallComplete(callSid, decision.extractedResult);
      return `<Response><Hangup/></Response>`;

    case 'failed':
    default:
      await handleCallFailed(callSid, decision.reasoning || 'IVR navigation failed');
      return `<Response><Hangup/></Response>`;
  }
}

async function handleCallComplete(callSid, extractedResult) {
  const state = callStates.get(callSid);
  if (!state) return;
  logger.info('SAKTHIFLOW', `Call ${callSid} COMPLETE`, extractedResult || {});

  try {
    const { data: task } = await supabase.updateTask(state.taskId, {
      status: 'completed',
      result: extractedResult || {},
    });

    const language = state.userInfo.language || 'ta-IN';
    const taskRow = task || { task_type: state.userInfo.task_type || 'lpg_booking' };
    const message = await gemini.generateResultMessage(taskRow, extractedResult, language);

    const phone = state.userInfo.phone;
    if (phone) {
      try {
        const audio = await sarvam.synthesizeSpeech(message, language);
        await twilio.sendWhatsAppVoiceNote(phone, audio, `result_${state.taskId}`);
      } catch (err) {
        logger.error('SAKTHIFLOW', 'voice note failed, sending text only', err);
      }
      await twilio.sendWhatsAppText(phone, message);
      await supabase.updateUser(phone, { conversation_state: 'idle', pending_task_data: null });
    }
  } catch (err) {
    logger.error('SAKTHIFLOW', `handleCallComplete failed for ${callSid}`, err);
  } finally {
    callStates.delete(callSid);
  }
}

async function handleCallFailed(callSid, reason) {
  const state = callStates.get(callSid);
  if (!state) return;
  logger.error('SAKTHIFLOW', `Call ${callSid} FAILED: ${reason}`);

  try {
    await supabase.updateTask(state.taskId, { status: 'failed', error_message: reason });
    const language = state.userInfo.language || 'ta-IN';
    const taskType = state.userInfo.task_type || 'lpg_booking';
    const message = await gemini.generateErrorMessage(taskType, reason, language);

    const phone = state.userInfo.phone;
    if (phone) {
      try {
        const audio = await sarvam.synthesizeSpeech(message, language);
        await twilio.sendWhatsAppVoiceNote(phone, audio, `error_${state.taskId}`);
      } catch (err) {
        logger.error('SAKTHIFLOW', 'error voice note failed, sending text only', err);
      }
      await twilio.sendWhatsAppText(phone, message);
      await supabase.updateUser(phone, { conversation_state: 'idle', pending_task_data: null });
    }
  } catch (err) {
    logger.error('SAKTHIFLOW', `handleCallFailed cleanup error for ${callSid}`, err);
  } finally {
    callStates.delete(callSid);
  }
}

async function handleCallStatusUpdate(callSid, callStatus) {
  logger.info('SAKTHIFLOW', `Call ${callSid} status -> ${callStatus}`);
  if (['no-answer', 'busy', 'failed'].includes(callStatus)) {
    await handleCallFailed(callSid, `Call ${callStatus}`);
    return;
  }
  if (callStatus === 'completed' && callStates.has(callSid)) {
    // Call ended but SakthiFlow never reached 'complete'.
    await handleCallFailed(callSid, 'Call ended before task completed');
  }
}

module.exports = {
  callStates,
  start,
  processIvrStep,
  handleCallComplete,
  handleCallFailed,
  handleCallStatusUpdate,
};
