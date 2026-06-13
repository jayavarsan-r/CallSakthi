'use strict';

const axios = require('axios');
const FormData = require('form-data');
const config = require('../config');
const logger = require('./../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Sarvam AI — STT (Saaras v3) + TTS (Bulbul v3).
// MOCK mode (no SARVAM_API_KEY): STT returns a canned transcript, TTS returns a
// tiny placeholder buffer so the rest of the pipeline runs offline.
// ─────────────────────────────────────────────────────────────────────────────

const LIVE = config.mode.sarvam === 'live';
const BASE = 'https://api.sarvam.ai';

if (!LIVE) logger.info('SARVAM', 'Running in MOCK mode (canned STT/TTS)');

const SUPPORTED_TTS_LANGS = ['ta-IN', 'hi-IN', 'en-IN', 'te-IN', 'kn-IN', 'ml-IN'];

// A canned transcript used in mock mode so intent extraction has something real.
const MOCK_TRANSCRIPT = 'சக்தி, என் LPG cylinder book பண்ணிடு';

// Build a small but VALID silent MP3 so the speaker + browser <audio> can play
// the mock TTS without erroring. Repeats a 128kbps/44.1kHz MPEG1-L3 silent frame.
function makeSilentMp3(frames = 20) {
  const FRAME_LEN = 417; // floor(144 * 128000 / 44100)
  const header = Buffer.from([0xff, 0xfb, 0x90, 0x64]);
  const frame = Buffer.concat([header, Buffer.alloc(FRAME_LEN - header.length)]);
  return Buffer.concat(Array.from({ length: frames }, () => frame));
}
const SILENT_MP3 = makeSilentMp3();

/**
 * Transcribe an audio buffer.
 * @returns {Promise<{transcript: string, language_detected: string}>}
 */
async function transcribeAudio(audioBuffer, languageCode = 'ta-IN') {
  if (!LIVE) {
    logger.info('SARVAM', `MOCK transcribeAudio -> "${MOCK_TRANSCRIPT}"`);
    return { transcript: MOCK_TRANSCRIPT, language_detected: languageCode };
  }
  try {
    const form = new FormData();
    form.append('file', audioBuffer, { filename: 'audio.ogg', contentType: 'audio/ogg' });
    form.append('model', 'saaras:v3');
    form.append('language_code', languageCode);

    const res = await axios.post(`${BASE}/speech-to-text`, form, {
      headers: {
        ...form.getHeaders(),
        'api-subscription-key': config.SARVAM_API_KEY,
      },
      maxBodyLength: Infinity,
    });
    const body = res.data || {};
    return {
      transcript: body.transcript || '',
      language_detected: body.language_code || body.language_detected || languageCode,
    };
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    logger.error('SARVAM', `transcribeAudio failed: ${detail}`);
    throw new Error(`Sarvam STT failed: ${detail}`);
  }
}

/**
 * Synthesize speech. Returns audio as a Buffer (mp3/wav as Sarvam provides).
 * In mock mode returns a tiny placeholder buffer.
 */
// 'priya' is a valid bulbul:v3 voice (the old 'meera' was v1/v2 only).
async function synthesizeSpeech(text, languageCode = 'ta-IN', speaker = 'priya') {
  const lang = SUPPORTED_TTS_LANGS.includes(languageCode) ? languageCode : 'ta-IN';

  if (!LIVE) {
    logger.info('SARVAM', `MOCK synthesizeSpeech (${lang}): "${String(text).slice(0, 60)}..."`);
    // Valid silent MP3 so save/send/playback paths all work offline.
    return Buffer.from(SILENT_MP3);
  }

  try {
    // Split very long text at sentence boundaries -> multiple calls -> concat.
    const chunks = text.length > 2000 ? splitText(text, 2000) : [text];
    const buffers = [];
    for (const chunk of chunks) {
      const res = await axios.post(
        `${BASE}/text-to-speech`,
        {
          inputs: [chunk],
          target_language_code: lang,
          speaker,
          model: 'bulbul:v3',
        },
        { headers: { 'api-subscription-key': config.SARVAM_API_KEY, 'Content-Type': 'application/json' } },
      );
      const audios = (res.data && res.data.audios) || [];
      if (!audios.length) throw new Error('Sarvam TTS returned no audio');
      buffers.push(Buffer.from(audios[0], 'base64'));
    }
    return Buffer.concat(buffers);
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    logger.error('SARVAM', `synthesizeSpeech failed: ${detail}`);
    throw new Error(`Sarvam TTS failed: ${detail}`);
  }
}

// Split text at sentence boundaries, keeping chunks under maxLen.
function splitText(text, maxLen) {
  const sentences = text.match(/[^.!?。]+[.!?。]?/g) || [text];
  const chunks = [];
  let current = '';
  for (const s of sentences) {
    if ((current + s).length > maxLen && current) {
      chunks.push(current.trim());
      current = '';
    }
    current += s;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

module.exports = { isLive: LIVE, transcribeAudio, synthesizeSpeech };
