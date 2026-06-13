'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Twilio voice webhooks. All routes return TwiML (Content-Type: text/xml),
// except /voice/status which returns an empty 200.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const sakthiflow = require('../core/sakthiflow');
const supabase = require('../services/db');

function xml(res, twiml) {
  res.set('Content-Type', 'text/xml');
  res.send(twiml.trim());
}

// Called by Twilio when an outbound call connects.
router.post('/outbound', async (req, res) => {
  const callSid = req.body.CallSid;
  const taskId = req.query.taskId;
  const phone = req.query.phone;
  logger.info('VOICE', `/outbound connected call=${callSid} task=${taskId}`);

  try {
    const { data: user } = await supabase.getOrCreateUser(phone);
    const userInfo = {
      phone,
      language: (user && user.language) || 'ta-IN',
      lpg_provider: user && user.lpg_provider,
      lpg_consumer_number: user && user.lpg_consumer_number,
      task_type: 'lpg_booking',
    };
    const goal =
      `Book LPG cylinder for ${userInfo.lpg_provider || 'the gas provider'} ` +
      `consumer number ${userInfo.lpg_consumer_number || 'unknown'}`;

    const twiml = sakthiflow.start(taskId, callSid, goal, userInfo);
    return xml(res, twiml);
  } catch (err) {
    logger.error('VOICE', '/outbound failed', err);
    return xml(res, `<Response><Hangup/></Response>`);
  }
});

// Called on every IVR step after Twilio gathers speech/DTMF.
router.post('/gather', async (req, res) => {
  const callSid = req.body.CallSid;
  const speech = req.body.SpeechResult || '';
  const digits = req.body.Digits || '';
  try {
    const twiml = await sakthiflow.processIvrStep(callSid, speech, digits);
    return xml(res, twiml);
  } catch (err) {
    logger.error('VOICE', '/gather failed', err);
    return xml(res, `<Response><Hangup/></Response>`);
  }
});

// Called on call status changes.
router.post('/status', async (req, res) => {
  const callSid = req.body.CallSid;
  const status = req.body.CallStatus;
  try {
    await sakthiflow.handleCallStatusUpdate(callSid, status);
  } catch (err) {
    logger.error('VOICE', '/status failed', err);
  }
  res.status(200).send('');
});

module.exports = router;
