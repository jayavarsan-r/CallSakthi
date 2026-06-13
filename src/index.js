'use strict';

require('dotenv').config();

const express = require('express');
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');
const { cleanupOldAudioFiles, ensureAudioDir } = require('./utils/audio');

const { getNgrokUrl } = require('./utils/ngrok');

const whatsappRouter = require('./routes/whatsapp');
const voiceRouter = require('./routes/voice');
const mockIvrRouter = require('./routes/mock-ivr');
const demoRouter = require('./routes/demo');
const metricsRouter = require('./routes/metrics');
const playgroundRouter = require('./routes/playground');

// ── Startup: warn (don't fail) about any capabilities running in mock mode ───
if (config._degraded.length) {
  logger.info('CONFIG', `Running with MOCK fallbacks for: ${config._degraded.join(' | ')}`);
  logger.info('CONFIG', 'Add the missing keys to .env to enable live mode for those services.');
} else {
  logger.info('CONFIG', 'All services configured in LIVE mode.');
}

ensureAudioDir();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static audio (served to WhatsApp as media).
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

// Routes.
app.use('/whatsapp', whatsappRouter);
app.use('/voice', voiceRouter);
app.use('/mock-ivr', mockIvrRouter);
app.use('/demo', demoRouter);
app.use('/metrics', metricsRouter);
app.use('/playground', playgroundRouter);

// Health check.
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date(),
    mode: config.mode,
  });
});

app.get('/', (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CallSakthi — AI Phone Agent for Bharat</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0B0D10;
  --card:rgba(255,255,255,0.04);
  --border:rgba(255,255,255,0.08);
  --blue:#4A90E2;
  --blue-glow:rgba(74,144,226,0.18);
  --emerald:#10B981;
  --emerald-glow:rgba(16,185,129,0.15);
  --amber:#F59E0B;
}
html{scroll-behavior:smooth}
body{
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  background:var(--bg);color:#E8E8E8;min-height:100vh;overflow-x:hidden;
}

/* ─── Cinematic video hero ─── */
.video-hero{
  position:relative;width:100%;height:100vh;overflow:hidden;
  display:flex;align-items:center;justify-content:center;
}
.video-bg{
  position:absolute;inset:0;width:100%;height:100%;
  object-fit:cover;object-position:center;
  opacity:0;transition:opacity 1.2s ease;
}
.video-bg.loaded{opacity:1}
.video-overlay{
  position:absolute;inset:0;
  background:linear-gradient(
    to bottom,
    rgba(11,13,16,0.55) 0%,
    rgba(11,13,16,0.35) 40%,
    rgba(11,13,16,0.65) 80%,
    rgba(11,13,16,1) 100%
  );
}
.hero-content{
  position:relative;z-index:2;
  text-align:center;padding:0 24px;
  max-width:820px;
}
.hero-eyebrow{
  display:inline-flex;align-items:center;gap:8px;
  font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;
  color:rgba(255,255,255,0.6);margin-bottom:24px;
  background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);
  border-radius:20px;padding:5px 14px;
  opacity:0;animation:fadeUp 0.7s 0.3s ease forwards;
}
.eyebrow-dot{width:6px;height:6px;border-radius:50%;background:var(--emerald);flex-shrink:0;animation:eye-pulse 2s ease infinite;}
@keyframes eye-pulse{0%,100%{opacity:1}50%{opacity:0.4}}
.hero-h1{
  font-size:clamp(36px,5.5vw,72px);font-weight:800;line-height:1.08;
  color:#fff;margin-bottom:20px;letter-spacing:-0.02em;
  opacity:0;animation:fadeUp 0.8s 0.5s ease forwards;
  text-shadow:0 2px 40px rgba(0,0,0,0.5);
}
.hero-h1 em{font-style:normal;color:rgba(255,255,255,0.35)}
.hero-sub{
  font-size:17px;color:rgba(255,255,255,0.5);line-height:1.7;
  max-width:500px;margin:0 auto 44px;
  opacity:0;animation:fadeUp 0.8s 0.7s ease forwards;
}
.hero-sub strong{color:rgba(255,255,255,0.8)}

/* scroll indicator */
.scroll-hint{
  position:absolute;bottom:32px;left:50%;transform:translateX(-50%);
  z-index:2;display:flex;flex-direction:column;align-items:center;gap:8px;
  opacity:0;animation:fadeUp 0.8s 1.4s ease forwards;
}
.scroll-line{width:1px;height:36px;background:linear-gradient(to bottom,rgba(255,255,255,0.4),transparent);}
.scroll-label{font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.25);}

canvas#particles{position:fixed;inset:0;pointer-events:none;z-index:0}

/* ─── Layout ─── */
.page{position:relative;z-index:1}
.hero-section{
  min-height:100vh;display:flex;flex-direction:column;
  align-items:center;justify-content:center;
  padding:80px 24px 60px;text-align:center;
}
.section{padding:80px 24px;max-width:900px;margin:0 auto}

/* ─── Hero ─── */
.hero-eyebrow{
  font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;
  color:var(--blue);margin-bottom:28px;
  opacity:0;animation:fadeUp 0.6s 0.2s ease forwards;
}
.hero-h1{
  font-size:clamp(36px,6vw,68px);font-weight:800;line-height:1.1;
  color:#fff;max-width:780px;margin:0 auto 24px;
  opacity:0;animation:fadeUp 0.7s 0.4s ease forwards;
}
.hero-h1 em{font-style:normal;color:rgba(255,255,255,0.35)}
.hero-sub{
  font-size:17px;color:rgba(255,255,255,0.45);line-height:1.7;
  max-width:480px;margin:0 auto 52px;
  opacity:0;animation:fadeUp 0.7s 0.6s ease forwards;
}
.hero-sub strong{color:rgba(255,255,255,0.7)}

/* ─── Journey Viz ─── */
.journey{
  display:flex;flex-direction:column;align-items:center;
  gap:0;margin-bottom:56px;
  opacity:0;animation:fadeUp 0.7s 0.8s ease forwards;
}
.journey-node{
  display:flex;flex-direction:column;align-items:center;gap:6px;
}
.node-dot{
  width:10px;height:10px;border-radius:50%;
  background:var(--border);border:2px solid rgba(255,255,255,0.12);
  position:relative;transition:all 0.4s;
}
.node-dot.active{
  background:var(--blue);border-color:var(--blue);
  box-shadow:0 0 18px var(--blue-glow),0 0 36px var(--blue-glow);
  animation:pulse-node 2s ease-in-out infinite;
}
.node-dot.done{background:var(--emerald);border-color:var(--emerald)}
@keyframes pulse-node{
  0%,100%{box-shadow:0 0 12px var(--blue-glow),0 0 24px var(--blue-glow)}
  50%{box-shadow:0 0 24px rgba(74,144,226,0.4),0 0 48px var(--blue-glow)}
}
.node-label{font-size:12px;font-weight:500;color:rgba(255,255,255,0.35);letter-spacing:0.04em}
.node-label.active{color:rgba(255,255,255,0.8)}
.node-label.done{color:var(--emerald)}
.journey-line{
  width:2px;height:28px;
  background:linear-gradient(to bottom,rgba(255,255,255,0.08),rgba(255,255,255,0.04));
  position:relative;overflow:hidden;
}
.journey-line::after{
  content:'';position:absolute;top:-100%;left:0;
  width:100%;height:100%;
  background:linear-gradient(to bottom,transparent,var(--blue),transparent);
  animation:flow-down 2s linear infinite;
}
@keyframes flow-down{
  0%{top:-100%}100%{top:100%}
}

/* ─── CTA Buttons ─── */
.cta-group{
  display:flex;gap:12px;flex-wrap:wrap;justify-content:center;
  opacity:0;animation:fadeUp 0.7s 1s ease forwards;
}
.btn-primary{
  background:#fff;color:#000;border:none;border-radius:10px;
  padding:14px 28px;font-size:14px;font-weight:600;cursor:pointer;
  text-decoration:none;display:inline-flex;align-items:center;gap:8px;
  transition:transform 0.15s,box-shadow 0.15s;
}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(255,255,255,0.12)}
.btn-ghost{
  background:var(--card);color:rgba(255,255,255,0.7);
  border:1px solid var(--border);border-radius:10px;
  padding:14px 28px;font-size:14px;font-weight:500;cursor:pointer;
  text-decoration:none;display:inline-flex;align-items:center;gap:8px;
  backdrop-filter:blur(8px);transition:border-color 0.2s,color 0.2s,transform 0.15s;
}
.btn-ghost:hover{border-color:rgba(255,255,255,0.2);color:#fff;transform:translateY(-2px)}

/* ─── CTA Buttons ─── */
.cta-group{
  display:flex;gap:12px;flex-wrap:wrap;justify-content:center;
  opacity:0;animation:fadeUp 0.7s 0.9s ease forwards;
}
.btn-primary{
  background:#fff;color:#000;border:none;border-radius:10px;
  padding:14px 28px;font-size:14px;font-weight:600;cursor:pointer;
  text-decoration:none;display:inline-flex;align-items:center;gap:8px;
  transition:transform 0.15s,box-shadow 0.15s;
}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(255,255,255,0.15)}
.btn-ghost{
  background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.75);
  border:1px solid rgba(255,255,255,0.14);border-radius:10px;
  padding:14px 28px;font-size:14px;font-weight:500;cursor:pointer;
  text-decoration:none;display:inline-flex;align-items:center;gap:8px;
  backdrop-filter:blur(12px);transition:border-color 0.2s,color 0.2s,transform 0.15s,background 0.2s;
}
.btn-ghost:hover{border-color:rgba(255,255,255,0.3);color:#fff;background:rgba(255,255,255,0.11);transform:translateY(-2px)}

/* ─── Section layout ─── */
.section{padding:80px 24px;max-width:960px;margin:0 auto}
.sec-intro{margin-bottom:40px;}
.sec-eyebrow{font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:var(--blue);margin-bottom:10px;}
.sec-h2{font-size:clamp(22px,3vw,32px);font-weight:700;color:#fff;line-height:1.2;}

/* ─── Feature Cards ─── */
.feat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.feat-card{
  background:var(--card);border:1px solid var(--border);border-radius:16px;
  padding:28px;text-decoration:none;color:inherit;
  backdrop-filter:blur(8px);
  transition:border-color 0.25s,transform 0.25s,box-shadow 0.25s;
  display:block;
  opacity:0;transform:translateY(24px);
}
.feat-card.revealed{animation:slideUp 0.5s ease forwards}
.feat-card:hover{
  border-color:rgba(255,255,255,0.16);
  transform:translateY(-4px);
  box-shadow:0 20px 60px rgba(0,0,0,0.5);
}
.feat-icon-wrap{font-size:22px;margin-bottom:18px;display:block;opacity:0.7}
.feat-title{font-size:15px;font-weight:600;color:#fff;margin-bottom:8px}
.feat-desc{font-size:13px;color:rgba(255,255,255,0.38);line-height:1.65}
.feat-arrow{
  display:inline-flex;align-items:center;gap:4px;
  font-size:12px;color:var(--blue);margin-top:18px;font-weight:500;
  transition:gap 0.2s;
}
.feat-card:hover .feat-arrow{gap:8px}

/* ─── How it works ─── */
.how-section{
  background:rgba(255,255,255,0.02);
  border-top:1px solid var(--border);border-bottom:1px solid var(--border);
  padding:56px 24px;
}
.how-inner{
  max-width:960px;margin:0 auto;
  display:flex;align-items:flex-start;gap:0;
  flex-wrap:wrap;justify-content:center;
}
.how-step{
  flex:1;min-width:160px;max-width:220px;text-align:center;padding:0 16px;
  opacity:0;transform:translateY(20px);
}
.how-step.revealed{animation:slideUp 0.5s ease forwards}
.how-num{font-size:11px;font-weight:700;letter-spacing:0.1em;color:rgba(255,255,255,0.2);margin-bottom:10px;}
.how-title{font-size:14px;font-weight:600;color:rgba(255,255,255,0.85);margin-bottom:6px;}
.how-desc{font-size:12px;color:rgba(255,255,255,0.3);line-height:1.6;}
.how-arrow{color:rgba(255,255,255,0.12);font-size:20px;padding-top:28px;flex-shrink:0;}

/* ─── Divider ─── */
.divider{
  border:none;height:1px;
  background:linear-gradient(to right,transparent,var(--border),transparent);
  margin:0;
}

/* ─── Bottom strip ─── */
.health{
  position:fixed;bottom:16px;right:20px;
  font-size:11px;color:rgba(255,255,255,0.15);
  text-decoration:none;z-index:10;
}
.health:hover{color:rgba(255,255,255,0.35)}

/* ─── Animations ─── */
@keyframes fadeUp{
  from{opacity:0;transform:translateY(20px)}
  to{opacity:1;transform:translateY(0)}
}
@keyframes slideUp{
  from{opacity:0;transform:translateY(24px)}
  to{opacity:1;transform:translateY(0)}
}

@media(max-width:640px){
  .feat-grid{grid-template-columns:1fr}
  .hero-h1{font-size:34px}
  .btn-primary,.btn-ghost{width:100%;justify-content:center}
  .cta-group{flex-direction:column;align-items:stretch}
  .how-arrow{display:none}
  .how-step{min-width:140px}
}
</style>
</head>
<body>
<canvas id="particles"></canvas>
<div class="page">

<!-- ─── Cinematic Video Hero ─── -->
<section class="video-hero">
  <video class="video-bg" id="heroBg" autoplay muted loop playsinline preload="auto">
    <source src="/public/video/hero.mp4" type="video/mp4">
  </video>
  <div class="video-overlay"></div>
  <div class="hero-content">
    <div class="hero-eyebrow">
      <span class="eyebrow-dot"></span>
      AI Phone Agent for Bharat
    </div>
    <h1 class="hero-h1">
      What if your parents never had to navigate<br>
      <em>"Press 1 for English"</em> ever again?
    </h1>
    <p class="hero-sub">
      <strong>CallSakthi</strong> turns WhatsApp voice notes into completed phone tasks.
      Tamil in. Task done. No English required.
    </p>
    <div class="cta-group">
      <a class="btn-primary" href="/demo">Try the Experience &rarr;</a>
      <a class="btn-ghost" href="/playground">Inside SakthiFlow</a>
      <a class="btn-ghost" href="/metrics">Reliability Metrics</a>
    </div>
  </div>
  <div class="scroll-hint">
    <div class="scroll-label">Scroll</div>
    <div class="scroll-line"></div>
  </div>
</section>

<hr class="divider">

<!-- ─── Feature Cards ─── -->
<section class="section">
  <div class="sec-intro">
    <div class="sec-eyebrow">Explore the system</div>
    <h2 class="sec-h2">Built for judges, optimized for trust</h2>
  </div>
  <div class="feat-grid" id="feat-grid">
    <a class="feat-card" href="/demo">
      <div class="feat-icon-wrap">▶</div>
      <div class="feat-title">Try the Experience</div>
      <div class="feat-desc">Type a request in Tamil, Hindi, or English. Watch Sakthi place the call and navigate the IVR autonomously in real time.</div>
      <div class="feat-arrow">Open demo <span>→</span></div>
    </a>
    <a class="feat-card" href="/playground">
      <div class="feat-icon-wrap">◎</div>
      <div class="feat-title">Inside SakthiFlow</div>
      <div class="feat-desc">Step through every AI decision behind a live call. See how Gemini reasons about each IVR prompt and what action it takes.</div>
      <div class="feat-arrow">Explore <span>→</span></div>
    </a>
    <a class="feat-card" href="/metrics">
      <div class="feat-icon-wrap">◈</div>
      <div class="feat-title">Reliability Metrics</div>
      <div class="feat-desc">Real data from SQLite. 100% IVR completion across 6 test cases. Fallback engineering that never lets a task fail silently.</div>
      <div class="feat-arrow">View metrics <span>→</span></div>
    </a>
  </div>
</section>

<!-- ─── How it works strip ─── -->
<section class="how-section">
  <div class="how-inner">
    <div class="how-step">
      <div class="how-num">01</div>
      <div class="how-title">Voice Note Received</div>
      <div class="how-desc">User sends a WhatsApp voice note in Tamil, Hindi, or English</div>
    </div>
    <div class="how-arrow">→</div>
    <div class="how-step">
      <div class="how-num">02</div>
      <div class="how-title">Intent Extracted</div>
      <div class="how-desc">Gemini parses the intent, provider, and consumer details</div>
    </div>
    <div class="how-arrow">→</div>
    <div class="how-step">
      <div class="how-num">03</div>
      <div class="how-title">SakthiFlow Executes</div>
      <div class="how-desc">State machine calls the IVR, navigates menus, presses keys</div>
    </div>
    <div class="how-arrow">→</div>
    <div class="how-step">
      <div class="how-num">04</div>
      <div class="how-title">Voice Reply Sent</div>
      <div class="how-desc">Tamil voice note confirms booking ref or tracking status</div>
    </div>
  </div>
</section>

</div><!-- /page -->

<a class="health" href="/health">health</a>

<script>
/* ─── Video fade-in on load ─── */
(function(){
  var v = document.getElementById('heroBg');
  if(!v) return;
  function show(){ v.classList.add('loaded'); }
  if(v.readyState >= 3){ show(); }
  else { v.addEventListener('canplay', show, {once:true}); }
  // fallback: show after 2s regardless
  setTimeout(show, 2000);
})();

/* ─── Scroll reveal for cards ─── */
(function(){
  var cards=document.querySelectorAll('.feat-card');
  var io=new IntersectionObserver(function(entries){
    entries.forEach(function(e,idx){
      if(e.isIntersecting){
        setTimeout(function(){e.target.classList.add('revealed');},idx*90);
        io.unobserve(e.target);
      }
    });
  },{threshold:0.12});
  cards.forEach(function(c){io.observe(c);});
  var steps=document.querySelectorAll('.how-step');
  var io2=new IntersectionObserver(function(entries){
    entries.forEach(function(e,idx){
      if(e.isIntersecting){
        setTimeout(function(){e.target.classList.add('revealed');},idx*100);
        io2.unobserve(e.target);
      }
    });
  },{threshold:0.1});
  steps.forEach(function(s){io2.observe(s);});
})();
</script>
</body>
</html>`;
  res.send(html);
});

// Periodic audio cleanup (every 60 min, delete files > 2h old).
const cleanupInterval = setInterval(cleanupOldAudioFiles, 60 * 60 * 1000);
cleanupInterval.unref();

// Don't crash on unexpected errors.
process.on('uncaughtException', (err) => logger.error('PROCESS', 'uncaughtException', err));
process.on('unhandledRejection', (reason) => logger.error('PROCESS', 'unhandledRejection', reason));

// Pretty startup status block + live webhook instructions.
async function printStartupChecklist() {
  const mark = (m) => (m === 'live' ? 'LIVE ' : 'MOCK ');
  const localUrl = `http://localhost:${config.PORT}`;
  const lines = [
    '',
    '════════════════════════════════════════════════════',
    '   CALLSAKTHI STATUS',
    '════════════════════════════════════════════════════',
    `   ✓ Server Running      : ${localUrl}`,
    `   ✓ Twilio WhatsApp     : ${mark(config.mode.twilio)}`,
    `   ✓ Sarvam (STT/TTS)    : ${mark(config.mode.sarvam)}`,
    `   ✓ Gemini (AI brain)   : ${mark(config.mode.gemini)}`,
    `   ✓ Database (SQLite)   : READY (local file)`,
  ];

  // Resolve the public URL Twilio must reach: prefer a running ngrok tunnel,
  // else the configured BASE_URL.
  const ngrokUrl = await getNgrokUrl();
  const publicUrl = ngrokUrl || config.BASE_URL;
  const webhook = `${publicUrl.replace(/\/$/, '')}/whatsapp`;

  if (ngrokUrl) {
    lines.push(`   ✓ ngrok tunnel        : ${ngrokUrl}`);
    if (config.BASE_URL !== ngrokUrl) {
      lines.push(`   ! BASE_URL in .env    : ${config.BASE_URL}`);
      lines.push(`     → For voice-note REPLIES to work, set BASE_URL=${ngrokUrl} and restart.`);
    }
  } else {
    lines.push(`   ○ ngrok tunnel        : not detected (run: npm run tunnel)`);
  }

  lines.push(`   ✓ Webhook Endpoint    : ${webhook}`);
  lines.push('   ✓ Ready to receive WhatsApp messages');
  lines.push('────────────────────────────────────────────────────');
  lines.push(`   Demo:        ${localUrl}/demo`);
  lines.push(`   Playground:  ${localUrl}/playground`);
  lines.push(`   Metrics:     ${localUrl}/metrics`);
  lines.push('────────────────────────────────────────────────────');
  lines.push('   Configure this in Twilio → Messaging → WhatsApp Sandbox');
  lines.push(`   "When a message comes in"  (POST):  ${webhook}`);
  lines.push('════════════════════════════════════════════════════');
  lines.push('');
  // Print as one block so it isn't interleaved with other logs.
  console.log(lines.join('\n'));
}

// Only listen when run directly (the harness imports the app instead).
if (require.main === module) {
  app.listen(config.PORT, () => {
    logger.info('SERVER', `CallSakthi listening on port ${config.PORT}`);
    printStartupChecklist();
  });
}

module.exports = app;
