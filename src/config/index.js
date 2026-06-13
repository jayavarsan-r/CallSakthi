'use strict';

require('dotenv').config();

// ─────────────────────────────────────────────────────────────────────────────
// CallSakthi configuration.
//
// Design decision (see docs/superpowers/specs): missing keys do NOT hard-fail.
// Each service falls back to a built-in mock so the app + offline harness run
// with an empty .env. We WARN loudly and list which features are degraded.
// ─────────────────────────────────────────────────────────────────────────────

const env = process.env;

// Which env vars power which capability. If any in a group is missing, that
// capability runs in mock mode.
// NOTE: no TWILIO_PHONE_NUMBER (we use mock IVR, not outbound voice) and no
// SUPABASE (replaced by local SQLite). WhatsApp only needs SID/TOKEN/FROM.
const CAPABILITY_KEYS = {
  twilio: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM'],
  sarvam: ['SARVAM_API_KEY'],
  gemini: ['GEMINI_API_KEY'],
};

function isSet(name) {
  const v = env[name];
  if (!v) return false;
  // Treat the .env.example placeholders as "not set".
  if (/^(ACxxxx|xxxx|AIzaSyxxxx|eyJhbGc.*xxxx|https:\/\/xxxx|\+1xxxx)/i.test(v)) return false;
  if (/xxxxxxxx/.test(v)) return false;
  return true;
}

const capabilityMode = {};
const degraded = [];
for (const [cap, keys] of Object.entries(CAPABILITY_KEYS)) {
  const live = keys.every(isSet);
  capabilityMode[cap] = live ? 'live' : 'mock';
  if (!live) {
    const missing = keys.filter((k) => !isSet(k));
    degraded.push(`${cap} (missing: ${missing.join(', ')})`);
  }
}

const config = {
  // Raw values (may be undefined in mock mode).
  TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: env.TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER: env.TWILIO_PHONE_NUMBER,
  TWILIO_WHATSAPP_FROM: env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886',

  SARVAM_API_KEY: env.SARVAM_API_KEY,
  GEMINI_API_KEY: env.GEMINI_API_KEY,

  BASE_URL: (env.BASE_URL && isSet('BASE_URL')) ? env.BASE_URL.replace(/\/$/, '') : `http://localhost:${env.PORT || 3000}`,
  PORT: parseInt(env.PORT, 10) || 3000,
  NODE_ENV: env.NODE_ENV || 'development',

  // Per-capability live|mock mode.
  mode: capabilityMode,

  // Provider phone numbers (real). Overridden to mock-ivr endpoints when NODE_ENV==='test'.
  PROVIDER_NUMBERS: {
    indane: env.INDANE_NUMBER || '7718955555',
    hp: env.HP_GAS_NUMBER || '18002333555',
    bharat: env.BHARAT_GAS_NUMBER || '7715012345',
  },

  SUPPORTED_TASKS: ['lpg_booking', 'courier_tracking'],

  LANGUAGES: {
    'ta-IN': 'Tamil',
    'hi-IN': 'Hindi',
    'en-IN': 'English',
    'te-IN': 'Telugu',
    'kn-IN': 'Kannada',
    'ml-IN': 'Malayalam',
  },

  IVR_NAVIGATION_TIMEOUT: 8, // seconds
  MAX_IVR_STEPS: 12, // max Gemini decisions per call before declaring failure
};

config._degraded = degraded;

module.exports = config;
