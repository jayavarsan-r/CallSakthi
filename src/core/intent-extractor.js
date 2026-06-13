'use strict';

const logger = require('../utils/logger');
const gemini = require('../services/gemini');
const sarvam = require('../services/sarvam');
const { downloadTwilioMedia } = require('../utils/audio');

// ─────────────────────────────────────────────────────────────────────────────
// Turn an incoming message (voice note or text) into a structured intent.
// ─────────────────────────────────────────────────────────────────────────────

async function processVoiceNote(mediaUrl, userPhone, twilioAccountSid, twilioAuthToken) {
  let buffer;
  if (twilioAccountSid && twilioAuthToken) {
    buffer = await downloadTwilioMedia(mediaUrl, twilioAccountSid, twilioAuthToken);
  } else {
    // Mock mode: no creds to download with; hand an empty buffer to the mock STT.
    buffer = Buffer.from('');
  }

  const { transcript } = await sarvam.transcribeAudio(buffer);
  logger.info('INTENT', `Transcript: "${transcript}"`);

  const intent = await gemini.extractIntent(transcript, userPhone);
  logger.info('INTENT', `Extracted`, intent);
  return { transcript, intent };
}

async function processTextMessage(text, userPhone) {
  const intent = await gemini.extractIntent(text, userPhone);
  logger.info('INTENT', `Extracted from text`, intent);
  return { transcript: text, intent };
}

module.exports = { processVoiceNote, processTextMessage };
