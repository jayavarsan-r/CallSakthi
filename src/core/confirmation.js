'use strict';

const logger = require('../utils/logger');
const supabase = require('../services/db');
const twilio = require('../services/twilio');
const gemini = require('../services/gemini');
const taskExecutor = require('./task-executor');

// ─────────────────────────────────────────────────────────────────────────────
// Conversation flow: collect missing info, then confirm before calling.
// ─────────────────────────────────────────────────────────────────────────────

const YES = ['ஆமா', 'ஆம்', 'சரி', 'yes', 'ya', 'yeah', 'ha', 'haan', 'ok', 'okay', '1', 'proceed', 'do it', 'karo'];
const NO = ['வேண்டாம்', 'no', 'nahi', 'nahin', 'cancel', 'stop', '2', 'வேண்டாம'];

const PROVIDER_MAP = {
  1: 'indane', indane: 'indane',
  2: 'hp', hp: 'hp', 'hp gas': 'hp',
  3: 'bharat', bharat: 'bharat', 'bharat gas': 'bharat',
};

function matches(text, list) {
  const t = String(text).trim().toLowerCase();
  return list.some((w) => t === w || t.includes(w));
}

// ── Ask for the next piece of missing info ───────────────────────────────────
async function handleMissingInfo(user, intent) {
  const missing = intent.missingInfo || [];

  if (missing.includes('lpg_provider') && !user.lpg_provider) {
    await supabase.updateUser(user.phone, {
      conversation_state: 'awaiting_lpg_provider',
      pending_task_data: intent,
    });
    await twilio.sendWhatsAppText(
      user.phone,
      'Which LPG company do you use? Reply: 1 for Indane, 2 for HP Gas, 3 for Bharat Gas',
    );
    return;
  }

  if (missing.includes('consumer_number') && !user.lpg_consumer_number) {
    await supabase.updateUser(user.phone, {
      conversation_state: 'awaiting_consumer_number',
      pending_task_data: intent,
    });
    await twilio.sendWhatsAppText(user.phone, 'What is your LPG consumer number?');
    return;
  }

  if (missing.includes('tracking_id')) {
    await supabase.updateUser(user.phone, {
      conversation_state: 'awaiting_consumer_number', // reuse the "awaiting a value" state
      pending_task_data: intent,
    });
    await twilio.sendWhatsAppText(user.phone, 'What is your tracking ID / AWB number?');
    return;
  }

  // Nothing actually missing — go straight to confirmation.
  await promptConfirmation(user, intent);
}

// ── Handle a reply while collecting info ─────────────────────────────────────
async function handleInfoCollection(user, messageText) {
  const state = user.conversation_state;
  const intent = user.pending_task_data || {};

  if (state === 'awaiting_lpg_provider') {
    const key = String(messageText).trim().toLowerCase();
    const provider = PROVIDER_MAP[key];
    if (!provider) {
      await twilio.sendWhatsAppText(user.phone, 'Please reply 1 for Indane, 2 for HP Gas, or 3 for Bharat Gas.');
      return;
    }
    await supabase.updateUser(user.phone, { lpg_provider: provider });
    user.lpg_provider = provider;

    // Still need consumer number?
    if (!user.lpg_consumer_number && !intent.consumerNumber) {
      await supabase.updateUser(user.phone, { conversation_state: 'awaiting_consumer_number' });
      await twilio.sendWhatsAppText(user.phone, 'What is your LPG consumer number?');
      return;
    }
    await promptConfirmation(user, intent);
    return;
  }

  if (state === 'awaiting_consumer_number') {
    const value = String(messageText).replace(/\s+/g, '').trim();
    // For courier this is the tracking id; for LPG the consumer number.
    if ((intent.task || 'lpg_booking') === 'courier_tracking') {
      intent.trackingId = value;
    } else {
      await supabase.updateUser(user.phone, { lpg_consumer_number: value });
      user.lpg_consumer_number = value;
    }
    await supabase.updateUser(user.phone, { pending_task_data: intent });
    await promptConfirmation(user, intent);
    return;
  }
}

// ── Send confirmation message and move to awaiting_confirmation ──────────────
async function promptConfirmation(user, intent) {
  const language = user.language || intent.language || 'ta-IN';
  const message = await gemini.generateConfirmationMessage(intent, user, language);
  await supabase.updateUser(user.phone, {
    conversation_state: 'awaiting_confirmation',
    pending_task_data: intent,
  });
  await twilio.sendWhatsAppText(user.phone, message);
}

// ── Handle yes/no after confirmation prompt ──────────────────────────────────
async function handleConfirmationResponse(user, messageText) {
  if (matches(messageText, NO)) {
    await supabase.updateUser(user.phone, { conversation_state: 'idle', pending_task_data: null });
    await twilio.sendWhatsAppText(
      user.phone,
      'Ok, cancelled. Send me a voice note whenever you need help. 🙏',
    );
    return;
  }
  if (matches(messageText, YES)) {
    logger.info('CONFIRM', `User ${user.phone} confirmed — starting call`);
    try {
      await taskExecutor.startCall(user, user.pending_task_data || {});
    } catch (err) {
      logger.error('CONFIRM', 'startCall failed', err);
      await supabase.updateUser(user.phone, { conversation_state: 'idle', pending_task_data: null });
      const lang = user.language || 'ta-IN';
      const msg = await gemini.generateErrorMessage(
        (user.pending_task_data && user.pending_task_data.task) || 'lpg_booking',
        'Could not place the call',
        lang,
      );
      await twilio.sendWhatsAppText(user.phone, msg);
    }
    return;
  }
  // Unrecognized — re-prompt.
  await twilio.sendWhatsAppText(user.phone, 'Please reply "Yes" / "ஆமா" to proceed, or "No" / "வேண்டாம்" to cancel.');
}

module.exports = {
  handleMissingInfo,
  handleInfoCollection,
  handleConfirmationResponse,
  promptConfirmation,
  _matches: matches,
  YES,
  NO,
};
