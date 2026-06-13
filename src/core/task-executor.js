'use strict';

const logger = require('../utils/logger');
const db = require('../services/db');
const twilio = require('../services/twilio');
const gemini = require('../services/gemini');
const sarvam = require('../services/sarvam');
const speaker = require('../utils/speaker');
const mockIVREngine = require('./mock-ivr-engine');

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrates a confirmed intent: create task -> run the mock IVR (Gemini
// navigates, Sarvam speaks each prompt through the speakers) -> reply on WhatsApp
// with a Tamil/Hindi voice note + text.
//
// No Twilio voice number needed — the IVR is simulated in-process by
// mock-ivr-engine.
// ─────────────────────────────────────────────────────────────────────────────

const PROVIDER_NAMES = { indane: 'Indane', hp: 'HP Gas', bharat: 'Bharat Gas', courier: 'Courier' };

// Pick the IVR script to drive from the intent.
function resolveProvider(user, intentData) {
  if ((intentData.task || 'lpg_booking') === 'courier_tracking') return 'courier';
  return intentData.provider || user.lpg_provider || 'indane';
}

async function startCall(user, intentData, onStep = () => {}) {
  const taskType = intentData.task || 'lpg_booking';
  const provider = resolveProvider(user, intentData);

  // Create task in DB.
  const { data: task } = db.createTask(user.phone, taskType, intentData);
  const taskId = task.id;

  db.updateUser(user.phone, { conversation_state: 'processing' });

  // Tell the user we're calling.
  const providerName = PROVIDER_NAMES[provider] || provider;
  const callingMsg = user.language === 'ta-IN'
    ? `📞 ${providerName} ஐ call பண்றோம்... முடிஞ்சதும் உங்களுக்கு சொல்றோம்!`
    : `📞 Calling ${providerName} now... I'll update you once done!`;
  await twilio.sendWhatsAppText(user.phone, callingMsg);

  logger.info('TASK', `Starting mock IVR for task ${taskId}, provider: ${provider}`);

  try {
    // Run the mock IVR — real Gemini navigation + Sarvam TTS + speaker output.
    const ivrResult = await mockIVREngine.runMockIVR(taskId, provider, user, onStep);

    if (ivrResult.success && ivrResult.result) {
      db.updateTask(taskId, { status: 'completed', result: ivrResult.result });
      db.updateUser(user.phone, { conversation_state: 'idle', pending_task_data: null });

      const resultText = await gemini.generateResultMessage(
        { task_type: taskType },
        ivrResult.result,
        user.language || 'ta-IN',
      );

      // Speak the result through the laptop speakers.
      await speaker.speakText(resultText, user.language || 'ta-IN', 'Final Result');

      // Send a WhatsApp voice note + text fallback.
      try {
        const audioBuffer = await sarvam.synthesizeSpeech(resultText, user.language || 'ta-IN');
        await twilio.sendWhatsAppVoiceNote(user.phone, audioBuffer, `result_${taskId}`);
      } catch (err) {
        logger.error('TASK', 'voice note failed, sending text only', err);
      }
      await twilio.sendWhatsAppText(user.phone, resultText);

      logger.info('TASK', `✅ Task ${taskId} completed — ${JSON.stringify(ivrResult.result)}`);
      return { success: true, taskId, result: ivrResult.result };
    }

    // Task failed.
    db.updateTask(taskId, { status: 'failed', error_message: 'IVR navigation failed' });
    db.updateUser(user.phone, { conversation_state: 'idle', pending_task_data: null });

    const errorText = await gemini.generateErrorMessage(
      taskType, 'IVR navigation failed', user.language || 'ta-IN',
    );
    await speaker.speakText(errorText, user.language || 'ta-IN', 'Error message');
    await twilio.sendWhatsAppText(user.phone, errorText);

    return { success: false, taskId };
  } catch (err) {
    logger.error('TASK', 'Task execution failed', err);
    db.updateTask(taskId, { status: 'failed', error_message: err.message });
    db.updateUser(user.phone, { conversation_state: 'idle', pending_task_data: null });
    await twilio.sendWhatsAppText(
      user.phone,
      user.language === 'ta-IN'
        ? '⚠️ மன்னிக்கவும், ஒரு பிரச்சினை ஆச்சு. மீண்டும் try பண்ணுங்க.'
        : '⚠️ Sorry, something went wrong. Please try again.',
    );
    return { success: false, taskId };
  }
}

module.exports = { startCall, resolveProvider };
