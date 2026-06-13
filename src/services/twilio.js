'use strict';

const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('./../utils/logger');
const { saveAudioBuffer, getPublicAudioUrl } = require('../utils/audio');

// ─────────────────────────────────────────────────────────────────────────────
// Twilio — outbound calls + WhatsApp messages/media.
// MOCK mode (no Twilio creds): logs the action and returns a synthetic SID so the
// orchestration runs offline.
// ─────────────────────────────────────────────────────────────────────────────

const LIVE = config.mode.twilio === 'live';

let client = null;
if (LIVE) {
  const twilio = require('twilio');
  client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
  logger.info('TWILIO', 'Live client initialized');
} else {
  logger.info('TWILIO', 'Running in MOCK mode (no real messages/calls)');
}

// Ensure the WhatsApp channel prefix is present.
function whatsappAddr(to) {
  return to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
}

async function sendWhatsAppText(to, message) {
  if (!LIVE) {
    logger.info('TWILIO', `MOCK WhatsApp text -> ${to}: ${message}`);
    return { sid: `MOCK_MSG_${uuidv4()}` };
  }
  try {
    const msg = await client.messages.create({
      from: config.TWILIO_WHATSAPP_FROM,
      to: whatsappAddr(to),
      body: message,
    });
    return { sid: msg.sid };
  } catch (err) {
    logger.error('TWILIO', `sendWhatsAppText to ${to} failed`, err);
    throw err;
  }
}

async function sendWhatsAppVoiceNote(to, audioBuffer, filename) {
  const fname = filename.endsWith('.mp3') ? filename : `${filename}.mp3`;
  saveAudioBuffer(audioBuffer, fname);
  const publicUrl = getPublicAudioUrl(fname);

  if (!LIVE) {
    logger.info('TWILIO', `MOCK WhatsApp voice note -> ${to}: ${publicUrl}`);
    return { sid: `MOCK_MEDIA_${uuidv4()}`, mediaUrl: publicUrl };
  }
  try {
    const msg = await client.messages.create({
      from: config.TWILIO_WHATSAPP_FROM,
      to: whatsappAddr(to),
      body: '',
      mediaUrl: [publicUrl],
    });
    return { sid: msg.sid, mediaUrl: publicUrl };
  } catch (err) {
    logger.error('TWILIO', `sendWhatsAppVoiceNote to ${to} failed`, err);
    throw err;
  }
}

async function makeOutboundCall(toNumber, webhookUrl, statusCallbackUrl) {
  if (!LIVE) {
    const sid = `MOCK_CALL_${uuidv4()}`;
    logger.info('TWILIO', `MOCK outbound call -> ${toNumber} (webhook ${webhookUrl})`);
    return { callSid: sid, status: 'queued' };
  }
  try {
    const call = await client.calls.create({
      from: config.TWILIO_PHONE_NUMBER,
      to: toNumber,
      url: webhookUrl,
      statusCallback: statusCallbackUrl,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
    });
    return { callSid: call.sid, status: call.status };
  } catch (err) {
    logger.error('TWILIO', `makeOutboundCall to ${toNumber} failed`, err);
    throw err;
  }
}

module.exports = {
  isLive: LIVE,
  sendWhatsAppText,
  sendWhatsAppVoiceNote,
  makeOutboundCall,
};
