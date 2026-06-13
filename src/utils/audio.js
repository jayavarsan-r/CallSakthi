'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('../config');
const logger = require('./logger');

const AUDIO_DIR = path.join(__dirname, '..', '..', 'public', 'audio');

function ensureAudioDir() {
  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
  }
}

/**
 * Download an audio file from a Twilio media URL using HTTP Basic auth.
 * Twilio WhatsApp voice notes are audio/ogg;codecs=opus — fetched as binary.
 * @returns {Promise<Buffer>}
 */
async function downloadTwilioMedia(mediaUrl, accountSid, authToken) {
  const res = await axios.get(mediaUrl, {
    responseType: 'arraybuffer',
    auth: { username: accountSid, password: authToken },
    maxRedirects: 5,
  });
  return Buffer.from(res.data);
}

/**
 * Save a Buffer to ./public/audio/{filename}. Returns the full file path.
 */
function saveAudioBuffer(buffer, filename) {
  ensureAudioDir();
  const full = path.join(AUDIO_DIR, filename);
  fs.writeFileSync(full, buffer);
  return full;
}

/**
 * Public URL for a saved audio file (served via express static /public).
 */
function getPublicAudioUrl(filename) {
  return `${config.BASE_URL}/public/audio/${filename}`;
}

/**
 * Delete audio files older than 2 hours to prevent disk fill.
 */
function cleanupOldAudioFiles() {
  try {
    ensureAudioDir();
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    const files = fs.readdirSync(AUDIO_DIR);
    let removed = 0;
    for (const f of files) {
      if (f === '.gitkeep') continue;
      const full = path.join(AUDIO_DIR, f);
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(full);
        removed += 1;
      }
    }
    if (removed > 0) logger.info('AUDIO', `Cleaned up ${removed} old audio file(s)`);
  } catch (err) {
    logger.error('AUDIO', 'cleanupOldAudioFiles failed', err);
  }
}

module.exports = {
  AUDIO_DIR,
  ensureAudioDir,
  downloadTwilioMedia,
  saveAudioBuffer,
  getPublicAudioUrl,
  cleanupOldAudioFiles,
};
