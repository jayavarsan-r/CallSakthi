'use strict';

const player = require('play-sound')({});
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');

const AUDIO_DIR = path.join(__dirname, '../../public/audio');

// Playing audio through host speakers only makes sense on an interactive machine.
// On Railway / CI there's no audio device, so we no-op there to avoid spawn errors.
const SPEAKER_ENABLED =
  process.env.SPEAKER === 'on' &&
  process.env.NODE_ENV !== 'production';

/**
 * Play an audio Buffer through the laptop speakers.
 * Saves to a temp file, plays it, then deletes it.
 * Works on Mac (afplay), Linux (aplay/mpg123), Windows (start).
 */
async function playBuffer(audioBuffer, label = '') {
  if (!SPEAKER_ENABLED) return;
  // A mock TTS buffer ("MOCK_AUDIO::…") or empty buffer isn't real audio — skip it.
  if (!audioBuffer || audioBuffer.length === 0) return;
  if (audioBuffer.slice(0, 11).toString('utf8') === 'MOCK_AUDIO:') {
    logger.info('SPEAKER', `(mock audio) ${label}`);
    return;
  }

  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  const tmpFile = path.join(AUDIO_DIR, `tmp_${uuidv4()}.mp3`);
  fs.writeFileSync(tmpFile, audioBuffer);

  if (label) logger.info('SPEAKER', `🔊 Playing: ${label}`);

  return new Promise((resolve) => {
    player.play(tmpFile, (err) => {
      if (err) logger.error('SPEAKER', `Playback error: ${err.message}`);
      try { fs.unlinkSync(tmpFile); } catch (_) {}
      resolve();
    });
  });
}

/**
 * Synthesize `text` with Sarvam TTS and play it through the speakers.
 * Sarvam is required lazily to avoid a circular dependency.
 */
async function speakText(text, language = 'ta-IN', label = '') {
  if (!SPEAKER_ENABLED) return;
  try {
    const sarvam = require('../services/sarvam');
    const audioBuffer = await sarvam.synthesizeSpeech(text, language);
    await playBuffer(audioBuffer, label || String(text).substring(0, 50));
  } catch (err) {
    logger.error('SPEAKER', `speakText error: ${err.message}`);
  }
}

module.exports = { playBuffer, speakText, SPEAKER_ENABLED };
