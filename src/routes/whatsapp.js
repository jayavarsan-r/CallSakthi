'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// POST /whatsapp — incoming WhatsApp messages (Twilio webhook).
// Routes based on the user's conversation_state, then orchestrates intent ->
// info collection -> confirmation -> call.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const config = require('../config');
const logger = require('../utils/logger');
const supabase = require('../services/db');
const twilio = require('../services/twilio');
const sarvam = require('../services/sarvam');
const gemini = require('../services/gemini');
const intentExtractor = require('../core/intent-extractor');
const confirmation = require('../core/confirmation');

router.post('/', async (req, res) => {
  // Always ack Twilio quickly; do work, then return empty 200.
  try {
    const from = req.body.From || '';
    const body = (req.body.Body || '').trim();
    const mediaUrl = req.body.MediaUrl0;
    const mediaType = req.body.MediaContentType0 || '';
    const phone = from.replace(/^whatsapp:/, '');
    const msgSid = req.body.MessageSid || req.body.SmsMessageSid || req.body.SmsSid || '(none)';
    const isVoice = !!(mediaUrl && mediaType.includes('audio'));

    // ── Detailed incoming-message log (debugging the live flow) ──────────────
    logger.info('WHATSAPP', '──────── Incoming WhatsApp message ────────');
    logger.info('WHATSAPP', `  Sender      : ${phone || '(unknown)'}`);
    logger.info('WHATSAPP', `  Message SID : ${msgSid}`);
    logger.info('WHATSAPP', `  Type        : ${isVoice ? 'VOICE NOTE' : (body ? 'TEXT' : 'OTHER/EMPTY')}`);
    logger.info('WHATSAPP', `  Twilio mode : ${twilio.isLive ? 'LIVE' : 'MOCK'} | Sarvam: ${sarvam.isLive ? 'LIVE' : 'MOCK'} | Gemini: ${gemini.isLive ? 'LIVE' : 'MOCK'}`);
    if (body) logger.info('WHATSAPP', `  Body        : "${body}"`);
    if (mediaUrl) logger.info('WHATSAPP', `  Media       : ${mediaType} ${mediaUrl}`);

    if (!phone) {
      return res.status(200).send('');
    }

    const { data: user } = await supabase.getOrCreateUser(phone);
    logger.info('WHATSAPP', `  User state  : ${user.conversation_state}`);

    const state = user.conversation_state || 'idle';

    // ── Mid-conversation states ──────────────────────────────────────────────
    if (state === 'awaiting_lpg_provider' || state === 'awaiting_consumer_number') {
      await confirmation.handleInfoCollection(user, body);
      return res.status(200).send('');
    }
    if (state === 'awaiting_confirmation') {
      await confirmation.handleConfirmationResponse(user, body);
      return res.status(200).send('');
    }
    if (state === 'processing') {
      await twilio.sendWhatsAppText(
        phone,
        'உங்கள் task process ஆகிறது, கொஞ்சம் wait பண்ணுங்க! ⏳',
      );
      return res.status(200).send('');
    }

    // ── New request (idle) ───────────────────────────────────────────────────
    let result;
    if (mediaUrl && mediaType.includes('audio')) {
      result = await intentExtractor.processVoiceNote(
        mediaUrl,
        phone,
        config.TWILIO_ACCOUNT_SID,
        config.TWILIO_AUTH_TOKEN,
      );
    } else if (body) {
      result = await intentExtractor.processTextMessage(body, phone);
    } else {
      await twilio.sendWhatsAppText(phone, helpMessage());
      return res.status(200).send('');
    }

    const intent = result.intent;

    // ── Log STT output + extracted intent/entities ───────────────────────────
    if (isVoice) {
      logger.info('WHATSAPP', `  STT output  : "${result.transcript}" (Sarvam ${sarvam.isLive ? 'LIVE' : 'MOCK'})`);
    }
    logger.info('WHATSAPP', `  Intent      : ${intent.task} (confidence ${(intent.confidence || 0).toFixed(2)})`);
    logger.info('WHATSAPP', `  Entities    : provider=${intent.provider || '—'} consumer=${intent.consumerNumber || '—'} tracking=${intent.trackingId || '—'} courier=${intent.courierCompany || '—'} lang=${intent.language}`);

    if (!intent || intent.task === 'unknown' || (intent.confidence || 0) < 0.5) {
      await twilio.sendWhatsAppText(phone, helpMessage());
      return res.status(200).send('');
    }

    // Save detected language + any entities we already have.
    const userUpdates = {};
    if (intent.language) userUpdates.language = intent.language;
    if (intent.provider) userUpdates.lpg_provider = intent.provider;
    if (intent.consumerNumber) userUpdates.lpg_consumer_number = intent.consumerNumber;
    if (Object.keys(userUpdates).length) {
      await supabase.updateUser(phone, userUpdates);
      Object.assign(user, userUpdates);
    }

    // Recompute what's still missing against the (now updated) user profile.
    const missing = computeMissing(intent, user);
    if (missing.length) {
      await confirmation.handleMissingInfo(user, { ...intent, missingInfo: missing });
    } else {
      await confirmation.promptConfirmation(user, intent);
    }

    return res.status(200).send('');
  } catch (err) {
    logger.error('WHATSAPP', 'handler failed', err);
    return res.status(200).send('');
  }
});

function computeMissing(intent, user) {
  const missing = [];
  if (intent.task === 'lpg_booking') {
    if (!(user.lpg_provider || intent.provider)) missing.push('lpg_provider');
    if (!(user.lpg_consumer_number || intent.consumerNumber)) missing.push('consumer_number');
  } else if (intent.task === 'courier_tracking') {
    if (!intent.trackingId) missing.push('tracking_id');
  }
  return missing;
}

function helpMessage() {
  return (
    '👋 Hi! I am CallSakthi. I can make phone calls for you.\n\n' +
    'Send me a voice note in Tamil or Hindi, like:\n' +
    '• "என் LPG cylinder book பண்ணிடு" (book a gas cylinder)\n' +
    '• "mera DTDC package track karo 12345" (track a courier)\n\n' +
    'I will call the company and get it done for you. 🙏'
  );
}

module.exports = router;
