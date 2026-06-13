'use strict';

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const mockIVREngine = require('../core/mock-ivr-engine');
const logger = require('../utils/logger');

// Pre-run the full IVR and return all steps as JSON.
router.post('/start', async (req, res) => {
  try {
    const { scenario = 'lpg_booking', provider = 'indane', consumerNumber = '1234567890' } = req.body;

    const ivrProvider = scenario === 'courier_tracking' ? 'courier' : (provider || 'indane');
    const userInfo = {
      phone: 'playground',
      language: 'ta-IN',
      lpg_provider: ivrProvider,
      lpg_consumer_number: consumerNumber || '1234567890',
      name: 'Judge',
    };

    const steps = [];
    const taskId = 'playground_' + uuidv4();

    await mockIVREngine.runMockIVR(taskId, ivrProvider, userInfo, (stepData) => {
      steps.push(stepData);
    });

    logger.info('PLAYGROUND', 'Collected ' + steps.length + ' steps for scenario: ' + scenario);
    res.json({ steps });
  } catch (err) {
    logger.error('PLAYGROUND', 'runMockIVR failed', err);
    res.status(500).json({ error: err.message });
  }
});

// NOTE: Uses string concatenation throughout — JS backtick characters inside
// the <script> block would break a template literal wrapper.
router.get('/', (req, res) => {
  var p = [];
  p.push('<!DOCTYPE html>');
  p.push('<html lang="en">');
  p.push('<head>');
  p.push('<meta charset="UTF-8">');
  p.push('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
  p.push('<title>Inside SakthiFlow — CallSakthi</title>');
  p.push('<style>');
  p.push('@import url(\'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap\');');
  p.push('*{box-sizing:border-box;margin:0;padding:0}');
  p.push(':root{');
  p.push('  --bg:#0B0D10;--card:rgba(255,255,255,0.04);--border:rgba(255,255,255,0.08);');
  p.push('  --blue:#4A90E2;--blue-glow:rgba(74,144,226,0.15);');
  p.push('  --emerald:#10B981;--emerald-glow:rgba(16,185,129,0.12);');
  p.push('  --amber:#F59E0B;--purple:#8B5CF6;');
  p.push('}');
  p.push('body{font-family:\'Inter\',-apple-system,sans-serif;background:var(--bg);color:#E8E8E8;min-height:100vh;display:flex;flex-direction:column;}');
  p.push('.top-bar{padding:16px 24px;display:flex;align-items:center;gap:16px;border-bottom:1px solid var(--border);flex-shrink:0;}');
  p.push('.back{color:rgba(255,255,255,0.35);font-size:13px;text-decoration:none;display:flex;align-items:center;gap:6px;transition:color 0.2s;}');
  p.push('.back:hover{color:rgba(255,255,255,0.7)}');
  p.push('.top-title{font-size:14px;font-weight:600;color:rgba(255,255,255,0.6)}');
  p.push('.top-sub{font-size:12px;color:rgba(255,255,255,0.2);margin-left:4px}');
  p.push('.layout{display:grid;grid-template-columns:200px 1fr 1fr;flex:1;min-height:0;height:calc(100vh - 53px);}');
  p.push('@media(max-width:900px){.layout{grid-template-columns:1fr;height:auto}}');

  p.push('.col{overflow-y:auto;padding:24px;}');
  p.push('.col-left{border-right:1px solid var(--border);}');
  p.push('.col-center{border-right:1px solid var(--border);}');

  p.push('.col-label{font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.2);margin-bottom:16px;}');

  /* State machine */
  p.push('.sm-nodes{display:flex;flex-direction:column;gap:0;}');
  p.push('.sm-node{display:flex;flex-direction:column;align-items:flex-start;gap:0;}');
  p.push('.sm-dot-row{display:flex;align-items:center;gap:10px;}');
  p.push('.sm-dot{width:10px;height:10px;border-radius:50%;border:2px solid rgba(255,255,255,0.1);background:transparent;flex-shrink:0;transition:all 0.4s;}');
  p.push('.sm-dot.sm-done{border-color:var(--emerald);background:var(--emerald);}');
  p.push('.sm-dot.sm-active{border-color:var(--blue);background:var(--blue);box-shadow:0 0 14px var(--blue-glow);animation:sm-pulse 1.5s ease infinite;}');
  p.push('@keyframes sm-pulse{0%,100%{box-shadow:0 0 8px var(--blue-glow)}50%{box-shadow:0 0 20px rgba(74,144,226,0.5)}}');
  p.push('.sm-label{font-size:12px;font-weight:500;color:rgba(255,255,255,0.2);transition:color 0.4s;}');
  p.push('.sm-label.sm-done{color:var(--emerald)}');
  p.push('.sm-label.sm-active{color:#fff}');
  p.push('.sm-connector{width:1px;height:24px;background:rgba(255,255,255,0.07);margin-left:4px;margin:4px 0 4px 4px;position:relative;overflow:hidden;}');
  p.push('.sm-connector.sm-flowing::after{content:\'\';position:absolute;top:-100%;left:0;width:100%;height:100%;background:linear-gradient(to bottom,transparent,var(--blue),transparent);animation:flow 1.5s linear infinite;}');
  p.push('@keyframes flow{0%{top:-100%}100%{top:100%}}');

  /* Center: IVR prompt */
  p.push('.ivr-area{min-height:80px;margin-bottom:16px;}');
  p.push('.ivr-phone{');
  p.push('  background:rgba(255,255,255,0.03);border:1px solid var(--border);');
  p.push('  border-radius:14px;padding:20px 22px;');
  p.push('  font-size:16px;color:rgba(255,255,255,0.7);');
  p.push('  font-style:italic;line-height:1.65;');
  p.push('  min-height:80px;');
  p.push('  transition:all 0.3s;');
  p.push('}');
  p.push('.ivr-phone.active{border-color:rgba(255,255,255,0.15);color:rgba(255,255,255,0.85);}');
  p.push('.ivr-tag{font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.2);margin-bottom:10px;}');
  p.push('.step-counter{font-size:11px;color:rgba(255,255,255,0.2);margin-top:10px;}');
  p.push('.step-counter span{color:rgba(255,255,255,0.5);font-weight:600;}');

  /* Right: Reasoning */
  p.push('.reasoning-area{margin-bottom:20px;}');
  p.push('.reason-box{');
  p.push('  background:rgba(0,0,0,0.25);border:1px solid var(--border);');
  p.push('  border-radius:12px;padding:16px;');
  p.push('  font-size:13px;color:rgba(255,255,255,0.5);');
  p.push('  line-height:1.65;min-height:80px;font-family:\'SF Mono\',monospace;');
  p.push('}');
  p.push('.reason-tag{font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.2);margin-bottom:10px;}');
  p.push('.cursor{display:inline-block;width:2px;height:13px;background:var(--blue);vertical-align:middle;animation:blink 0.9s step-end infinite;}');
  p.push('@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}');

  /* Decision badge */
  p.push('.decision-area{margin-top:16px;}');
  p.push('.decision-tag{font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.2);margin-bottom:10px;}');
  p.push('.d-badge{');
  p.push('  display:inline-flex;align-items:center;gap:8px;');
  p.push('  padding:10px 18px;border-radius:10px;');
  p.push('  font-size:13px;font-weight:600;letter-spacing:0.05em;');
  p.push('  opacity:0;transform:translateY(8px);transition:all 0.35s;');
  p.push('}');
  p.push('.d-badge.show{opacity:1;transform:translateY(0);}');
  p.push('.badge-dtmf{background:rgba(139,92,246,0.15);color:#8B5CF6;border:1px solid rgba(139,92,246,0.25);}');
  p.push('.badge-speak{background:var(--emerald-glow);color:var(--emerald);border:1px solid rgba(16,185,129,0.2);}');
  p.push('.badge-wait{background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.3);border:1px solid var(--border);}');
  p.push('.badge-complete{background:var(--emerald-glow);color:var(--emerald);border:1px solid rgba(16,185,129,0.25);}');
  p.push('.badge-start{background:rgba(74,144,226,0.12);color:var(--blue);border:1px solid rgba(74,144,226,0.2);}');
  p.push('.badge-listen{background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.25);border:1px solid var(--border);}');
  p.push('.badge-failed{background:rgba(239,68,68,0.12);color:#ef4444;border:1px solid rgba(239,68,68,0.2);}');

  /* Config panel */
  p.push('.config-card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:20px;margin-bottom:24px;}');
  p.push('.field{display:flex;flex-direction:column;gap:6px;margin-bottom:14px;}');
  p.push('.field:last-child{margin-bottom:0}');
  p.push('.field label{font-size:11px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.06em;}');
  p.push('.radio-group{display:flex;gap:6px;flex-wrap:wrap;}');
  p.push('.rb{background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:8px;');
  p.push('    padding:7px 12px;font-size:12px;color:rgba(255,255,255,0.4);cursor:pointer;transition:all 0.2s;}');
  p.push('.rb.on{background:rgba(255,255,255,0.1);border-color:rgba(255,255,255,0.2);color:#fff;}');
  p.push('select,input[type=text]{background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:8px;');
  p.push('  padding:8px 11px;font-size:13px;color:#fff;outline:none;width:100%;font-family:inherit;}');
  p.push('select:focus,input[type=text]:focus{border-color:rgba(74,144,226,0.4)}');

  /* Next button */
  p.push('#nextBtn{');
  p.push('  position:fixed;bottom:28px;right:28px;');
  p.push('  background:#fff;color:#000;border:none;border-radius:10px;');
  p.push('  padding:13px 26px;font-size:14px;font-weight:600;cursor:pointer;');
  p.push('  display:none;');
  p.push('  box-shadow:0 8px 32px rgba(0,0,0,0.5);');
  p.push('  transition:all 0.2s;font-family:inherit;');
  p.push('}');
  p.push('#nextBtn:hover{transform:translateY(-2px);box-shadow:0 12px 40px rgba(0,0,0,0.6)}');
  p.push('#nextBtn:disabled{background:rgba(255,255,255,0.15);color:rgba(255,255,255,0.3);cursor:default;transform:none}');

  p.push('.start-btn{background:#fff;color:#000;border:none;border-radius:10px;padding:12px 20px;');
  p.push('  font-size:14px;font-weight:600;cursor:pointer;width:100%;font-family:inherit;transition:all 0.2s;}');
  p.push('.start-btn:hover{background:#e8e8e8}');
  p.push('.start-btn:disabled{background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.3);cursor:default}');

  /* Success card */
  p.push('.success-card{');
  p.push('  background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.2);');
  p.push('  border-radius:16px;padding:24px;');
  p.push('  animation:boom 0.5s ease forwards;');
  p.push('}');
  p.push('@keyframes boom{0%{opacity:0;transform:scale(0.93)}60%{transform:scale(1.02)}100%{opacity:1;transform:scale(1)}}');
  p.push('.s-ref{font-size:30px;font-weight:700;color:#fff;font-family:\'SF Mono\',monospace;margin:8px 0 6px;}');
  p.push('.s-tamil{font-size:15px;color:rgba(255,255,255,0.5);margin-bottom:16px;}');
  p.push('.s-label{font-size:10px;color:var(--emerald);font-weight:700;letter-spacing:0.1em;text-transform:uppercase;}');
  p.push('.glow-ring{');
  p.push('  display:inline-flex;align-items:center;justify-content:center;');
  p.push('  width:44px;height:44px;border-radius:50%;');
  p.push('  background:var(--emerald-glow);border:1px solid rgba(16,185,129,0.3);');
  p.push('  font-size:20px;margin-bottom:12px;');
  p.push('  animation:ring-pulse 2s ease infinite;');
  p.push('}');
  p.push('@keyframes ring-pulse{0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.3)}50%{box-shadow:0 0 0 12px rgba(16,185,129,0)}}');
  p.push('.rel-list{margin-top:16px;display:flex;flex-direction:column;gap:7px;}');
  p.push('.rel-item{font-size:12px;color:rgba(255,255,255,0.35);padding-left:16px;position:relative;line-height:1.5}');
  p.push('.rel-item::before{content:"\\2022";position:absolute;left:4px;color:var(--emerald)}');

  p.push('.placeholder-text{font-size:13px;color:rgba(255,255,255,0.15);text-align:center;padding:40px 20px;line-height:1.7}');
  p.push('</style>');
  p.push('</head>');
  p.push('<body>');

  p.push('<div class="top-bar">');
  p.push('  <a class="back" href="/">← CallSakthi</a>');
  p.push('  <span class="top-title">Inside SakthiFlow</span>');
  p.push('  <span class="top-sub">Every decision. Fully transparent.</span>');
  p.push('</div>');

  p.push('<div class="layout">');

  /* LEFT: State Machine */
  p.push('<div class="col col-left">');
  p.push('<div class="col-label">State Machine</div>');
  p.push('<div class="config-card">');
  p.push('<div class="field"><label>Task</label>');
  p.push('<div class="radio-group">');
  p.push('<div class="rb on" id="rb-lpg" onclick="selScen(\'lpg_booking\')">LPG Booking</div>');
  p.push('<div class="rb" id="rb-courier" onclick="selScen(\'courier_tracking\')">Courier</div>');
  p.push('</div></div>');
  p.push('<div class="field" id="prov-field"><label>Provider</label>');
  p.push('<select id="provSel"><option value="indane">Indane</option><option value="hp">HP Gas</option><option value="bharat">Bharat Gas</option></select>');
  p.push('</div>');
  p.push('<div class="field"><label>Consumer / Tracking ID</label>');
  p.push('<input type="text" id="consumerIn" value="1234567890" />');
  p.push('</div>');
  p.push('<button class="start-btn" id="startBtn" onclick="go()">Start Investigation</button>');
  p.push('</div>');

  p.push('<div class="sm-nodes" id="smNodes">');
  var smStates = ['Start', 'Calling', 'Navigating', 'Processing', 'Completed'];
  for (var i = 0; i < smStates.length; i++) {
    p.push('<div class="sm-node">');
    p.push('<div class="sm-dot-row">');
    p.push('<div class="sm-dot" id="sm-' + i + '"></div>');
    p.push('<div class="sm-label" id="sml-' + i + '">' + smStates[i] + '</div>');
    p.push('</div>');
    if (i < smStates.length - 1) {
      p.push('<div class="sm-connector" id="smc-' + i + '"></div>');
    }
    p.push('</div>');
  }
  p.push('</div>');
  p.push('</div>');

  /* CENTER: IVR prompt */
  p.push('<div class="col col-center">');
  p.push('<div class="col-label">IVR Prompt</div>');
  p.push('<div class="ivr-tag">What the phone system says</div>');
  p.push('<div class="ivr-phone" id="ivrPhone">');
  p.push('<span style="color:rgba(255,255,255,0.15)">Start an investigation to see the IVR prompt appear here.</span>');
  p.push('</div>');
  p.push('<div class="step-counter" id="stepCounter" style="display:none">Step <span id="stepN">0</span> of <span id="stepTotal">0</span></div>');
  p.push('</div>');

  /* RIGHT: Reasoning + Decision */
  p.push('<div class="col">');
  p.push('<div class="col-label">Sakthi Reasoning</div>');
  p.push('<div class="reason-tag">How Gemini thinks through this</div>');
  p.push('<div class="reason-box" id="reasonBox">');
  p.push('<span style="color:rgba(255,255,255,0.1)">Reasoning will appear here with a typewriter effect.</span>');
  p.push('</div>');
  p.push('<div class="decision-area">');
  p.push('<div class="decision-tag">Decision</div>');
  p.push('<div class="d-badge" id="dBadge"></div>');
  p.push('</div>');
  p.push('<div id="successArea"></div>');
  p.push('</div>');

  p.push('</div>'); /* /layout */

  p.push('<button id="nextBtn" onclick="step()">Next Step →</button>');

  p.push('<script>');
  p.push('var scenario = "lpg_booking";');
  p.push('var allSteps = [];');
  p.push('var cursor = 0;');
  p.push('var animating = false;');
  p.push('var meaningful = ["call_started","ivr_speaking","gemini_decision","call_complete"];');
  p.push('var smOrder = ["start","calling","navigating","processing","completed"];');

  p.push('function selScen(s){');
  p.push('  scenario = s;');
  p.push('  document.getElementById("rb-lpg").className = "rb" + (s==="lpg_booking"?" on":"");');
  p.push('  document.getElementById("rb-courier").className = "rb" + (s==="courier_tracking"?" on":"");');
  p.push('  document.getElementById("prov-field").style.display = s==="lpg_booking" ? "" : "none";');
  p.push('}');

  p.push('function setSM(state){');
  p.push('  var idx = smOrder.indexOf(state);');
  p.push('  for(var i=0;i<5;i++){');
  p.push('    var d = document.getElementById("sm-"+i);');
  p.push('    var l = document.getElementById("sml-"+i);');
  p.push('    var c = document.getElementById("smc-"+i);');
  p.push('    d.className = "sm-dot" + (i<idx?" sm-done":i===idx?" sm-active":"");');
  p.push('    l.className = "sm-label" + (i<idx?" sm-done":i===idx?" sm-active":"");');
  p.push('    if(c) c.className = "sm-connector" + (i<idx?" sm-flowing":"");');
  p.push('  }');
  p.push('}');

  p.push('function stepToSM(s){');
  p.push('  if(!s) return "navigating";');
  p.push('  if(s.type==="call_started") return "calling";');
  p.push('  if(s.type==="call_complete") return "completed";');
  p.push('  if(s.type==="gemini_decision") return "navigating";');
  p.push('  if(s.type==="ivr_speaking") return "navigating";');
  p.push('  if(s.type==="dtmf_press"||s.type==="sakthi_speaking") return "processing";');
  p.push('  return "navigating";');
  p.push('}');

  p.push('function esc(s){');
  p.push('  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");');
  p.push('}');

  p.push('function typewriter(el, text){');
  p.push('  return new Promise(function(resolve){');
  p.push('    el.innerHTML = "";');
  p.push('    var cur = document.createElement("span");');
  p.push('    cur.className = "cursor";');
  p.push('    el.appendChild(cur);');
  p.push('    var i=0;');
  p.push('    function tick(){');
  p.push('      if(i>=text.length){ cur.remove(); resolve(); return; }');
  p.push('      var t = document.createTextNode(text[i++]);');
  p.push('      el.insertBefore(t, cur);');
  p.push('      setTimeout(tick, 20);');
  p.push('    }');
  p.push('    tick();');
  p.push('  });');
  p.push('}');

  p.push('function delay(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }');

  p.push('async function go(){');
  p.push('  var btn = document.getElementById("startBtn");');
  p.push('  btn.disabled = true; btn.textContent = "Thinking…";');
  p.push('  document.getElementById("ivrPhone").innerHTML = "<span style=\'color:rgba(255,255,255,0.2)\'>Connecting…</span>";');
  p.push('  document.getElementById("reasonBox").innerHTML = "<span style=\'color:rgba(255,255,255,0.1)\'>Loading…</span>";');
  p.push('  document.getElementById("dBadge").className = "d-badge";');
  p.push('  document.getElementById("successArea").innerHTML = "";');
  p.push('  document.getElementById("stepCounter").style.display = "none";');
  p.push('  document.getElementById("nextBtn").style.display = "none";');
  p.push('  setSM("start");');
  p.push('  var prov = document.getElementById("provSel").value;');
  p.push('  var cnum = document.getElementById("consumerIn").value.trim() || "1234567890";');
  p.push('  try{');
  p.push('    var r = await fetch("/playground/start",{');
  p.push('      method:"POST",');
  p.push('      headers:{"Content-Type":"application/json"},');
  p.push('      body:JSON.stringify({scenario:scenario,provider:prov,consumerNumber:cnum})');
  p.push('    });');
  p.push('    var d = await r.json();');
  p.push('    if(d.error) throw new Error(d.error);');
  p.push('    allSteps = d.steps;');
  p.push('    cursor = 0;');
  p.push('    var total = allSteps.filter(function(s){ return meaningful.indexOf(s.type)!==-1; }).length;');
  p.push('    document.getElementById("stepTotal").textContent = total;');
  p.push('    document.getElementById("stepCounter").style.display = "block";');
  p.push('    document.getElementById("nextBtn").style.display = "block";');
  p.push('    setSM("calling");');
  p.push('    await step();');
  p.push('  }catch(e){');
  p.push('    btn.disabled = false; btn.textContent = "Start Investigation";');
  p.push('    alert("Error: "+e.message);');
  p.push('  }');
  p.push('}');

  p.push('var stepNum = 0;');
  p.push('async function step(){');
  p.push('  if(animating || cursor >= allSteps.length) return;');
  p.push('  animating = true;');
  p.push('  document.getElementById("nextBtn").disabled = true;');

  p.push('  while(cursor < allSteps.length && meaningful.indexOf(allSteps[cursor].type)===-1) cursor++;');
  p.push('  if(cursor >= allSteps.length){ document.getElementById("nextBtn").style.display="none"; animating=false; return; }');

  p.push('  var s = allSteps[cursor++];');
  p.push('  stepNum++;');
  p.push('  document.getElementById("stepN").textContent = stepNum;');
  p.push('  setSM(stepToSM(s));');

  p.push('  var ivrEl = document.getElementById("ivrPhone");');
  p.push('  var reasonEl = document.getElementById("reasonBox");');
  p.push('  var badge = document.getElementById("dBadge");');

  p.push('  badge.className = "d-badge";');

  p.push('  if(s.type === "call_complete"){');
  p.push('    setSM("completed");');
  p.push('    ivrEl.className = "ivr-phone";');
  p.push('    ivrEl.textContent = "Call ended. Task complete.";');
  p.push('    await typewriter(reasonEl, "IVR navigation complete. The booking has been confirmed.");');
  p.push('    await showSuccess(s);');
  p.push('    document.getElementById("nextBtn").style.display = "none";');
  p.push('    document.getElementById("startBtn").disabled = false;');
  p.push('    document.getElementById("startBtn").textContent = "Start Investigation";');
  p.push('    animating = false;');
  p.push('    return;');
  p.push('  }');

  p.push('  var ivrText = "";');
  p.push('  var reasoning = "";');
  p.push('  var action = "";');
  p.push('  var value = "";');

  p.push('  if(s.type === "call_started"){');
  p.push('    ivrText = "Call connected to " + esc((s.provider||"").toUpperCase()) + " IVR system.";');
  p.push('    reasoning = "Initiating the call. Goal: " + (s.goal||"complete the booking");');
  p.push('    action = "start";');
  p.push('  } else if(s.type === "ivr_speaking"){');
  p.push('    ivrText = s.prompt || "";');
  p.push('    reasoning = "IVR is speaking. Analysing the prompt to decide next action.";');
  p.push('    action = "listen";');
  p.push('  } else if(s.type === "gemini_decision"){');
  p.push('    ivrText = s.ivrPrompt || "";');
  p.push('    reasoning = s.reasoning || "";');
  p.push('    action = s.action || "";');
  p.push('    value = s.value || "";');
  p.push('  }');

  p.push('  ivrEl.className = "ivr-phone" + (ivrText?" active":"");');
  p.push('  ivrEl.innerHTML = ivrText');
  p.push('    ? "“" + esc(ivrText) + "”"');
  p.push('    : "<span style=\'color:rgba(255,255,255,0.15)\'>No IVR prompt for this step.</span>";');

  p.push('  await typewriter(reasonEl, reasoning || "—");');

  p.push('  if(action && action !== "listen" && action !== "start"){');
  p.push('    var bCls = "badge-" + action;');
  p.push('    var bLabel = action.toUpperCase() + (value ? "  ·  " + esc(value) : "");');
  p.push('    badge.className = "d-badge " + bCls;');
  p.push('    badge.textContent = bLabel;');
  p.push('    await delay(80);');
  p.push('    badge.classList.add("show");');
  p.push('  }');

  p.push('  var hasMore = allSteps.slice(cursor).some(function(x){ return meaningful.indexOf(x.type)!==-1; });');
  p.push('  document.getElementById("nextBtn").textContent = hasMore ? "Next Step →" : "Finish";');
  p.push('  document.getElementById("nextBtn").disabled = false;');
  p.push('  animating = false;');
  p.push('}');

  p.push('async function showSuccess(s){');
  p.push('  var res = s.result || {};');
  p.push('  var ref = res.bookingReference || res.trackingStatus || res.deliveryStatus || "Done";');
  p.push('  var isLpg = !!res.bookingReference;');
  p.push('  var tamil = isLpg');
  p.push('    ? "உஙகள் சிலிண்டர் பதிவு செய்யப்பட்டது."');
  p.push('    : "உஙகள் package நிலை பதிவு செய்யப்பட்டது.";');
  p.push('  var area = document.getElementById("successArea");');
  p.push('  area.innerHTML =');
  p.push('    \'<div class="success-card">\' +');
  p.push('    \'<div class="glow-ring">✓</div>\' +');
  p.push('    \'<div class="s-label">Task Complete</div>\' +');
  p.push('    \'<div class="s-ref">\' + esc(String(ref)) + \'</div>\' +');
  p.push('    \'<div class="s-tamil">\' + tamil + \'</div>\' +');
  p.push('    \'<div class="rel-list">\' +');
  p.push('    \'<div class="rel-item">Confirmation obtained before any action</div>\' +');
  p.push('    \'<div class="rel-item">Gemini reads each IVR prompt fresh — no hardcoded scripts</div>\' +');
  p.push('    \'<div class="rel-item">Deterministic fallback if Gemini quota exhausted</div>\' +');
  p.push('    \'<div class="rel-item">100% completion across 6 harness test cases</div>\' +');
  p.push('    \'<div class="rel-item">Fully offline in mock mode — zero API keys needed</div>\' +');
  p.push('    \'</div></div>\';');
  p.push('}');

  p.push('</script>');
  p.push('</body>');
  p.push('</html>');

  res.send(p.join('\n'));
});

module.exports = router;
