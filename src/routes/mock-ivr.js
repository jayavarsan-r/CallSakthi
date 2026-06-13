'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Mock IVR systems — simulated Indane / HP Gas / courier phone trees.
// These return TwiML exactly like a real provider IVR would, so SakthiFlow can
// be pointed at them during development and in the offline harness.
//
// All routes accept GET and POST so they're easy to curl and easy to drive.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

function xml(res, twiml) {
  res.set('Content-Type', 'text/xml');
  res.send(twiml.trim());
}

// ── Indane LPG booking ───────────────────────────────────────────────────────
function indaneWelcome(req, res) {
  xml(
    res,
    `<Response>
  <Gather input="dtmf speech" timeout="10" action="/mock-ivr/indane/step1" method="POST" numDigits="1">
    <Say voice="Polly.Aditi" language="hi-IN">
      Welcome to Indane Gas booking service.
      Press 1 for cylinder booking.
      Press 2 for booking status.
      Press 3 for complaint.
    </Say>
  </Gather>
</Response>`,
  );
}
router.get('/indane', indaneWelcome);
router.post('/indane', indaneWelcome);

router.post('/indane/step1', (req, res) => {
  logger.debug('MOCK-IVR', `indane/step1 digits=${req.body.Digits}`);
  xml(
    res,
    `<Response>
  <Gather input="dtmf speech" timeout="10" action="/mock-ivr/indane/step2" method="POST">
    <Say voice="Polly.Aditi" language="hi-IN">
      Please enter your 10 digit consumer number followed by hash.
    </Say>
  </Gather>
</Response>`,
  );
});

router.post('/indane/step2', (req, res) => {
  logger.debug('MOCK-IVR', `indane/step2 consumer=${req.body.Digits || req.body.SpeechResult}`);
  xml(
    res,
    `<Response>
  <Gather input="dtmf speech" timeout="10" action="/mock-ivr/indane/confirm" method="POST" numDigits="1">
    <Say voice="Polly.Aditi" language="hi-IN">
      Your consumer number is confirmed.
      Press 1 to confirm cylinder booking.
      Press 2 to cancel.
    </Say>
  </Gather>
</Response>`,
  );
});

router.post('/indane/confirm', (req, res) => {
  logger.debug('MOCK-IVR', `indane/confirm digits=${req.body.Digits}`);
  xml(
    res,
    `<Response>
  <Say voice="Polly.Aditi" language="hi-IN">
    Your LPG cylinder has been successfully booked.
    Your booking reference number is 7 8 9 3 4.
    Thank you for using Indane Gas service.
  </Say>
  <Hangup/>
</Response>`,
  );
});

// ── HP Gas booking ───────────────────────────────────────────────────────────
function hpWelcome(req, res) {
  xml(
    res,
    `<Response>
  <Gather input="dtmf speech" timeout="10" action="/mock-ivr/hp/step1" method="POST" numDigits="1">
    <Say voice="Polly.Aditi" language="hi-IN">
      HP Gas mein aapka swagat hai.
      Cylinder booking ke liye 1 dabaiye.
      Booking status ke liye 2 dabaiye.
    </Say>
  </Gather>
</Response>`,
  );
}
router.get('/hp', hpWelcome);
router.post('/hp', hpWelcome);

router.post('/hp/step1', (req, res) => {
  xml(
    res,
    `<Response>
  <Gather input="dtmf speech" timeout="10" action="/mock-ivr/hp/confirm" method="POST">
    <Say voice="Polly.Aditi" language="hi-IN">
      Apna consumer number darj kijiye, anth mein hash dabaiye.
    </Say>
  </Gather>
</Response>`,
  );
});

router.post('/hp/confirm', (req, res) => {
  xml(
    res,
    `<Response>
  <Gather input="dtmf speech" timeout="10" action="/mock-ivr/hp/done" method="POST" numDigits="1">
    <Say voice="Polly.Aditi" language="hi-IN">
      Booking confirm karne ke liye 1 dabaiye. Radd karne ke liye 2 dabaiye.
    </Say>
  </Gather>
</Response>`,
  );
});

router.post('/hp/done', (req, res) => {
  xml(
    res,
    `<Response>
  <Say voice="Polly.Aditi" language="hi-IN">
    Aapka HP Gas cylinder successfully booked ho gaya hai.
    Aapka booking reference number 5 5 2 1 0 hai.
    Dhanyavaad.
  </Say>
  <Hangup/>
</Response>`,
  );
});

// ── Generic courier tracking ─────────────────────────────────────────────────
function courierWelcome(req, res) {
  xml(
    res,
    `<Response>
  <Gather input="dtmf speech" timeout="10" action="/mock-ivr/courier/track" method="POST">
    <Say voice="Polly.Aditi" language="en-IN">
      Welcome to courier tracking.
      Please enter your tracking number followed by hash.
    </Say>
  </Gather>
</Response>`,
  );
}
router.get('/courier', courierWelcome);
router.post('/courier', courierWelcome);

router.post('/courier/track', (req, res) => {
  logger.debug('MOCK-IVR', `courier/track id=${req.body.Digits || req.body.SpeechResult}`);
  xml(
    res,
    `<Response>
  <Say voice="Polly.Aditi" language="en-IN">
    Your package status is: Out for delivery.
    Expected delivery today by 6 P M.
    Your reference is 4 4 1 2 2.
    Thank you.
  </Say>
  <Hangup/>
</Response>`,
  );
});

module.exports = router;
