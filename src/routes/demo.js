'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// /demo — a judge-facing web page that runs the full CallSakthi flow live:
// intent extraction → mock IVR navigation (Gemini) → Sarvam Tamil voice reply.
// Progress is streamed to the browser via Server-Sent Events.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const intentExtractor = require('../core/intent-extractor');
const mockIVREngine = require('../core/mock-ivr-engine');
const gemini = require('../services/gemini');
const sarvam = require('../services/sarvam');
const speaker = require('../utils/speaker');
const db = require('../services/db');
const logger = require('../utils/logger');

// Serve the demo HTML page.
router.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CallSakthi — Live Demo</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0B0D10;--card:rgba(255,255,255,0.04);--border:rgba(255,255,255,0.08);
  --blue:#4A90E2;--blue-glow:rgba(74,144,226,0.15);
  --emerald:#10B981;--emerald-glow:rgba(16,185,129,0.12);
  --amber:#F59E0B;--purple:#8B5CF6;
}
body{
  font-family:'Inter',-apple-system,sans-serif;
  background:var(--bg);color:#E8E8E8;min-height:100vh;
}
.top-bar{
  padding:16px 24px;display:flex;align-items:center;gap:16px;
  border-bottom:1px solid var(--border);
}
.back{
  color:rgba(255,255,255,0.35);font-size:13px;text-decoration:none;
  display:flex;align-items:center;gap:6px;transition:color 0.2s;
}
.back:hover{color:rgba(255,255,255,0.7)}
.top-title{font-size:14px;font-weight:600;color:rgba(255,255,255,0.6)}
.top-badge{
  margin-left:auto;font-size:10px;font-weight:600;letter-spacing:0.08em;
  text-transform:uppercase;color:var(--emerald);background:var(--emerald-glow);
  border:1px solid rgba(16,185,129,0.2);border-radius:20px;padding:3px 10px;
}

/* ─── Main layout ─── */
.main{display:grid;grid-template-columns:1fr 1fr;height:calc(100vh - 53px)}
@media(max-width:768px){.main{grid-template-columns:1fr;height:auto}}

/* ─── Left: Human side ─── */
.left{
  border-right:1px solid var(--border);
  padding:28px;display:flex;flex-direction:column;gap:20px;
  overflow-y:auto;
}
.panel-label{
  font-size:10px;font-weight:700;letter-spacing:0.12em;
  text-transform:uppercase;color:rgba(255,255,255,0.25);margin-bottom:4px;
}

/* Input area */
.input-area{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:20px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
.chip{
  font-size:12px;color:rgba(255,255,255,0.5);background:rgba(255,255,255,0.05);
  border:1px solid rgba(255,255,255,0.08);border-radius:20px;
  padding:5px 12px;cursor:pointer;transition:all 0.2s;
}
.chip:hover{background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.85);border-color:rgba(255,255,255,0.15)}
.input-row{display:flex;gap:8px}
.text-input{
  flex:1;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);
  border-radius:10px;padding:12px 14px;font-size:14px;color:#fff;outline:none;
  font-family:inherit;transition:border-color 0.2s;
}
.text-input:focus{border-color:rgba(74,144,226,0.5)}
.text-input::placeholder{color:rgba(255,255,255,0.2)}
.run-btn{
  background:#fff;color:#000;border:none;border-radius:10px;
  padding:12px 20px;font-size:13px;font-weight:600;cursor:pointer;
  white-space:nowrap;transition:all 0.2s;flex-shrink:0;
}
.run-btn:hover{background:#e8e8e8;transform:translateY(-1px)}
.run-btn:disabled{background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.3);cursor:default;transform:none}

/* WhatsApp conversation */
.chat{display:flex;flex-direction:column;gap:10px}
.bubble{
  max-width:78%;padding:12px 15px;border-radius:14px;font-size:14px;
  line-height:1.5;animation:bubbleIn 0.3s ease forwards;opacity:0;
}
.bubble.user{
  align-self:flex-end;
  background:rgba(74,144,226,0.15);border:1px solid rgba(74,144,226,0.2);
  border-bottom-right-radius:4px;color:rgba(255,255,255,0.9);
}
.bubble.ai{
  align-self:flex-start;
  background:rgba(255,255,255,0.05);border:1px solid var(--border);
  border-bottom-left-radius:4px;color:rgba(255,255,255,0.75);
}
.bubble.success{
  align-self:flex-start;
  background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);
  border-bottom-left-radius:4px;color:rgba(255,255,255,0.85);
}
.bubble.error-b{
  align-self:flex-start;
  background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);
  color:rgba(239,68,68,0.9);border-bottom-left-radius:4px;
}
.bubble-time{font-size:10px;color:rgba(255,255,255,0.2);margin-top:5px;text-align:right}
@keyframes bubbleIn{
  from{opacity:0;transform:translateY(8px) scale(0.97)}
  to{opacity:1;transform:translateY(0) scale(1)}
}
.avatar{
  width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.08);
  display:flex;align-items:center;justify-content:center;font-size:13px;
  flex-shrink:0;border:1px solid var(--border);
}
.msg-row{display:flex;align-items:flex-end;gap:8px}
.msg-row.user-row{flex-direction:row-reverse}

/* Waveform */
.waveform{
  display:flex;align-items:center;gap:2px;height:20px;padding:0 4px;
}
.wave-bar{
  width:2px;border-radius:2px;background:var(--blue);opacity:0.7;
  animation:wave-bounce var(--d,0.8s) var(--del,0s) ease-in-out infinite alternate;
}
@keyframes wave-bounce{
  from{height:3px;opacity:0.3}to{height:var(--h,14px);opacity:0.9}
}

/* audio player */
audio{width:100%;margin-top:8px;border-radius:8px;opacity:0.8}

/* ─── Right: AI side ─── */
.right{
  padding:28px;display:flex;flex-direction:column;gap:0;overflow-y:auto;
}
.ai-header{margin-bottom:20px}
.ai-title{font-size:13px;font-weight:600;color:rgba(255,255,255,0.4);margin-bottom:4px}
.ai-status{
  font-size:12px;color:rgba(255,255,255,0.2);
  display:flex;align-items:center;gap:6px;
}
.status-dot{
  width:6px;height:6px;border-radius:50%;background:#333;
  transition:background 0.3s;
}
.status-dot.active{background:var(--blue);box-shadow:0 0 8px var(--blue)}
.status-dot.done{background:var(--emerald)}

/* Timeline */
.timeline{display:flex;flex-direction:column;gap:0;position:relative}
.tl-item{
  display:flex;gap:14px;padding-bottom:4px;
  animation:tlIn 0.4s ease forwards;opacity:0;
}
@keyframes tlIn{
  from{opacity:0;transform:translateX(12px)}
  to{opacity:1;transform:translateX(0)}
}
.tl-connector{
  display:flex;flex-direction:column;align-items:center;flex-shrink:0;
  padding-top:4px;
}
.tl-dot{
  width:8px;height:8px;border-radius:50%;
  border:2px solid rgba(255,255,255,0.15);background:transparent;
  flex-shrink:0;transition:all 0.3s;
}
.tl-dot.active{
  border-color:var(--blue);background:var(--blue);
  box-shadow:0 0 10px var(--blue-glow);
  animation:tl-pulse 1.5s ease infinite;
}
@keyframes tl-pulse{
  0%,100%{box-shadow:0 0 6px var(--blue-glow)}
  50%{box-shadow:0 0 16px rgba(74,144,226,0.5)}
}
.tl-dot.done-intent{border-color:var(--blue);background:var(--blue)}
.tl-dot.done-ivr{border-color:rgba(255,255,255,0.3);background:rgba(255,255,255,0.12)}
.tl-dot.done-gemini{border-color:var(--amber);background:var(--amber)}
.tl-dot.done-complete{border-color:var(--emerald);background:var(--emerald)}
.tl-dot.done-error{border-color:#ef4444;background:#ef4444}
.tl-line{width:1px;flex:1;min-height:16px;background:rgba(255,255,255,0.07);margin:2px 0}
.tl-body{padding:2px 0 18px;flex:1}
.tl-type{
  font-size:10px;font-weight:700;letter-spacing:0.1em;
  text-transform:uppercase;margin-bottom:4px;
}
.type-intent{color:var(--blue)}
.type-ivr{color:rgba(255,255,255,0.3)}
.type-gemini{color:var(--amber)}
.type-speak{color:var(--emerald)}
.type-dtmf{color:var(--purple)}
.type-complete{color:var(--emerald)}
.type-error{color:#ef4444}
.tl-content{font-size:13px;color:rgba(255,255,255,0.55);line-height:1.55}
.tl-content strong{color:rgba(255,255,255,0.85);font-weight:500}
.tl-reasoning{
  font-size:11px;color:rgba(255,255,255,0.3);margin-top:4px;
  font-style:italic;line-height:1.5;
}
.tl-badge{
  display:inline-block;margin-top:6px;
  font-size:11px;font-weight:600;letter-spacing:0.06em;
  text-transform:uppercase;padding:3px 10px;border-radius:20px;
}
.badge-dtmf{background:rgba(139,92,246,0.15);color:var(--purple);border:1px solid rgba(139,92,246,0.25)}
.badge-speak{background:var(--emerald-glow);color:var(--emerald);border:1px solid rgba(16,185,129,0.2)}
.badge-wait{background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.25);border:1px solid rgba(255,255,255,0.08)}
.badge-complete{background:var(--emerald-glow);color:var(--emerald);border:1px solid rgba(16,185,129,0.25)}
.badge-error{background:rgba(239,68,68,0.12);color:#ef4444;border:1px solid rgba(239,68,68,0.2)}

/* Confidence bar */
.conf-row{display:flex;align-items:center;gap:8px;margin-top:5px}
.conf-label{font-size:10px;color:rgba(255,255,255,0.2);white-space:nowrap}
.conf-bar{flex:1;height:2px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden}
.conf-fill{height:100%;border-radius:2px;background:var(--blue);transition:width 0.6s ease}

/* Empty state */
.empty-ai{
  flex:1;display:flex;flex-direction:column;align-items:center;
  justify-content:center;color:rgba(255,255,255,0.12);text-align:center;gap:12px;
}
.empty-ai .big{font-size:32px}
.empty-ai p{font-size:13px;line-height:1.6}

/* Success explosion */
.success-card{
  background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.2);
  border-radius:14px;padding:20px;margin-top:4px;
  animation:successBoom 0.5s ease forwards;
}
@keyframes successBoom{
  0%{opacity:0;transform:scale(0.94)}
  60%{transform:scale(1.02)}
  100%{opacity:1;transform:scale(1)}
}
.success-ref{
  font-size:26px;font-weight:700;color:#fff;font-family:'SF Mono',monospace;
  margin:6px 0;
}
.success-tamil{font-size:14px;color:rgba(255,255,255,0.5);margin-top:4px}
.success-label{font-size:10px;color:var(--emerald);font-weight:700;letter-spacing:0.1em;text-transform:uppercase}
.glow-ring{
  display:inline-flex;align-items:center;justify-content:center;
  width:40px;height:40px;border-radius:50%;
  background:var(--emerald-glow);border:1px solid rgba(16,185,129,0.3);
  font-size:18px;margin-bottom:10px;
  animation:ring-pulse 2s ease infinite;
}
@keyframes ring-pulse{
  0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.3)}
  50%{box-shadow:0 0 0 10px rgba(16,185,129,0)}
}
</style>
</head>
<body>
<div class="top-bar">
  <a class="back" href="/">&#8592; CallSakthi</a>
  <span class="top-title">Live Demo</span>
  <span class="top-badge">SSE Stream</span>
</div>

<div class="main">
  <!-- LEFT: Human side -->
  <div class="left">
    <div>
      <div class="panel-label">Human Side</div>
    </div>

    <div class="input-area">
      <div class="chips" id="chips">
        <div class="chip" onclick="setEx('சக்தி, என் LPG cylinder book பண்ணிடு')">Tamil LPG</div>
        <div class="chip" onclick="setEx('Indane ka cylinder book karo, consumer number 1234567890')">Hindi LPG</div>
        <div class="chip" onclick="setEx('Book my HP gas cylinder')">English LPG</div>
        <div class="chip" onclick="setEx('My DTDC package kahan hai, tracking ID DTDC123456')">Courier</div>
      </div>
      <div class="input-row">
        <input class="text-input" id="textInput" type="text"
               placeholder="Type a request in Tamil, Hindi, or English…" />
        <button class="run-btn" id="runBtn" onclick="runDemo()">Run &#9654;</button>
      </div>
    </div>

    <div id="chat" class="chat"></div>
  </div>

  <!-- RIGHT: AI side -->
  <div class="right">
    <div class="ai-header">
      <div class="ai-title">SakthiFlow — AI Execution</div>
      <div class="ai-status">
        <div class="status-dot" id="statusDot"></div>
        <span id="statusText">Waiting for input</span>
      </div>
    </div>
    <div id="aiEmpty" class="empty-ai">
      <div class="big">◎</div>
      <p>The AI execution pipeline will<br>appear here when you run a task.</p>
    </div>
    <div class="timeline" id="timeline"></div>
  </div>
</div>

<script>
function setEx(t){document.getElementById('textInput').value=t}

function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function now(){
  var d=new Date();
  return d.getHours()+':'+(d.getMinutes()<10?'0':'')+d.getMinutes();
}

function addBubble(type,content,extra){
  var chat=document.getElementById('chat');
  var isUser=(type==='user');
  var row=document.createElement('div');
  row.className='msg-row'+(isUser?' user-row':'');
  var av=document.createElement('div');
  av.className='avatar';
  av.textContent=isUser?'👵':'◎';
  var bubble=document.createElement('div');
  bubble.className='bubble '+(extra||type);
  bubble.innerHTML=content+'<div class="bubble-time">'+now()+'</div>';
  row.appendChild(av);row.appendChild(bubble);
  chat.appendChild(row);
  row.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function addWaveform(){
  var chat=document.getElementById('chat');
  var row=document.createElement('div');
  row.className='msg-row';
  var av=document.createElement('div');av.className='avatar';av.textContent='👵';
  var bubble=document.createElement('div');
  bubble.className='bubble user';
  var wf=document.createElement('div');wf.className='waveform';
  var heights=[6,10,14,8,12,16,9,13,7,11,15,8];
  var delays=[0,0.1,0.2,0.05,0.15,0.25,0.08,0.18,0.03,0.13,0.22,0.07];
  heights.forEach(function(h,i){
    var b=document.createElement('div');b.className='wave-bar';
    b.style.cssText='--h:'+h+'px;--d:'+(0.5+Math.random()*0.5)+'s;--del:'+delays[i]+'s';
    wf.appendChild(b);
  });
  bubble.appendChild(wf);
  bubble.innerHTML+=('<div class="bubble-time">Voice note · '+now()+'</div>');
  row.appendChild(av);row.appendChild(bubble);
  chat.appendChild(row);
  row.scrollIntoView({behavior:'smooth',block:'nearest'});
}

var tlCount=0;
function addTL(dotClass,typeClass,typeLabel,content,extra){
  var tl=document.getElementById('timeline');
  document.getElementById('aiEmpty').style.display='none';
  var item=document.createElement('div');
  item.className='tl-item';
  item.style.animationDelay=(tlCount*50)+'ms';
  tlCount++;
  var conn=document.createElement('div');conn.className='tl-connector';
  var dot=document.createElement('div');dot.className='tl-dot '+dotClass;
  var line=document.createElement('div');line.className='tl-line';
  conn.appendChild(dot);conn.appendChild(line);
  var body=document.createElement('div');body.className='tl-body';
  body.innerHTML='<div class="tl-type '+typeClass+'">'+typeLabel+'</div>'+
    '<div class="tl-content">'+content+'</div>'+(extra||'');
  item.appendChild(conn);item.appendChild(body);
  tl.appendChild(item);
  item.scrollIntoView({behavior:'smooth',block:'nearest'});
  return item;
}

function setStatus(active,text){
  var dot=document.getElementById('statusDot');
  var st=document.getElementById('statusText');
  dot.className='status-dot'+(active==='active'?' active':active==='done'?' done':'');
  st.textContent=text;
}

async function runDemo(){
  var text=document.getElementById('textInput').value.trim();
  if(!text)return;
  var btn=document.getElementById('runBtn');
  btn.disabled=true;btn.textContent='Running…';

  document.getElementById('chat').innerHTML='';
  document.getElementById('timeline').innerHTML='';
  document.getElementById('aiEmpty').style.display='flex';
  tlCount=0;

  addWaveform();
  setTimeout(function(){
    addBubble('user',esc(text),'user');
  },400);
  setStatus('active','Initialising…');

  try{
    var resp=await fetch('/demo/run',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text:text})
    });

    var reader=resp.body.getReader();
    var decoder=new TextDecoder();
    var buffer='';

    while(true){
      var rv=await reader.read();
      if(rv.done)break;
      buffer+=decoder.decode(rv.value,{stream:true});
      var parts=buffer.split('\\n\\n');
      buffer=parts.pop();
      for(var i=0;i<parts.length;i++){
        var line=parts[i].split('\\n').find(function(l){return l.startsWith('data: ')});
        if(!line)continue;
        var data=JSON.parse(line.slice(6));

        if(data.type==='transcript'){
          setStatus('active','Transcribed voice note');
        } else if(data.type==='intent'){
          setStatus('active','Intent extracted');
          addTL('done-intent','type-intent','Intent Detected',
            '<strong>'+esc(data.task)+'</strong>'+(data.provider?' &middot; '+esc(data.provider):'')
            +' &middot; '+esc(data.language||''),
            data.confidence?'<div class="conf-row"><span class="conf-label">Confidence</span><div class="conf-bar"><div class="conf-fill" style="width:'+(data.confidence*100)+'%"></div></div></div>':''
          );
          setTimeout(function(){
            addBubble('ai','Understood! Shall I book your cylinder? Reply <strong>ஆமா</strong> to confirm.','ai');
          },300);
          setTimeout(function(){
            addBubble('ai','ஆமா','user');
          },1100);
        } else if(data.type==='call_started'){
          setStatus('active','Calling provider');
          addTL('done-ivr','type-ivr','Call Connected',
            'Dialling <strong>'+esc((data.provider||'').toUpperCase())+'</strong> IVR — '+esc(data.goal||''));
          setTimeout(function(){
            addBubble('ai','Placing the call now… ◎','ai');
          },200);
        } else if(data.type==='ivr_speaking'){
          setStatus('active','Listening to IVR');
          addTL('done-ivr','type-ivr','IVR Speaking',
            '&ldquo;'+esc(data.prompt||'')+'&rdquo;');
        } else if(data.type==='gemini_decision'){
          setStatus('active','Reasoning…');
          var bClass='badge-'+(data.action||'wait');
          var bLabel=(data.action||'').toUpperCase()+(data.value?' &nbsp;'+esc(data.value):'');
          addTL('active','type-gemini','Gemini Decides',
            esc(data.reasoning||''),
            '<div class="tl-badge '+bClass+'">'+bLabel+'</div>'
          );
        } else if(data.type==='dtmf_press'){
          addTL('done-gemini','type-dtmf','DTMF Pressed',
            'Key: <strong>'+esc(data.digit)+'</strong>');
        } else if(data.type==='sakthi_speaking'){
          addTL('done-gemini','type-speak','Sakthi Speaks',
            '&ldquo;'+esc(data.text||'')+'&rdquo;');
        } else if(data.type==='call_complete'){
          setStatus('done','Task complete');
          var ref=(data.result&&(data.result.bookingReference||data.result.trackingStatus||data.result.deliveryStatus))||'Done';
          addTL('done-complete','type-complete','Task Complete',
            'Reference: <strong>'+esc(String(ref))+'</strong>');
        } else if(data.type==='tts_ready'){
          var audio=data.audioUrl
            ?'<audio controls src="'+data.audioUrl+'"></audio>':
            '<p style="font-size:12px;color:rgba(255,255,255,0.3);margin-top:4px">(voice unavailable in mock mode)</p>';
          addBubble('ai','<strong>Done.</strong> '+esc(data.text||'')+audio,'success');
        } else if(data.type==='error'){
          setStatus('','Error');
          addTL('done-error','type-error','Error',esc(data.message||''));
          addBubble('ai',esc(data.message||'Something went wrong'),'error-b');
        }
      }
    }
  }catch(err){
    console.error(err);
    addTL('done-error','type-error','Error',esc(err.message));
  }

  btn.disabled=false;btn.textContent='Run ▶';
}

document.getElementById('textInput').addEventListener('keydown',function(e){
  if(e.key==='Enter')runDemo();
});
</script>
</body>
</html>`);
});

// SSE endpoint — runs the full flow and streams updates to the demo page.
router.post('/run', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const { text } = req.body;
    if (!text) { send({ type: 'error', message: 'No text provided' }); return res.end(); }

    // 1) Extract intent.
    const { intent } = await intentExtractor.processTextMessage(text, 'demo_user');
    send({ type: 'transcript', text });
    send({
      type: 'intent', task: intent.task, provider: intent.provider,
      language: intent.language, confidence: intent.confidence,
    });

    if (intent.task === 'unknown') {
      send({ type: 'error', message: 'Could not understand the task. Try: "Book my Indane cylinder" or "Track my DTDC package"' });
      return res.end();
    }

    const demoUser = {
      phone: 'demo_user',
      language: intent.language || 'ta-IN',
      lpg_provider: intent.provider || 'indane',
      lpg_consumer_number: intent.consumerNumber || intent.trackingId || '1234567890',
      name: 'Demo User',
    };

    // 2) Run the mock IVR with real Gemini navigation, streaming each step.
    const taskId = `demo_${uuidv4()}`;
    const provider = intent.task === 'courier_tracking' ? 'courier' : (intent.provider || 'indane');

    const ivrResult = await mockIVREngine.runMockIVR(taskId, provider, demoUser, (stepData) => send(stepData));

    if (ivrResult.success && ivrResult.result) {
      // Record the completed booking first — TTS is just how we render the reply,
      // so a TTS hiccup shouldn't lose a genuine success.
      const { data: task } = db.createTask('demo_user', intent.task, intent);
      db.updateTask(task.id, { status: 'completed', result: ivrResult.result });

      const resultText = await gemini.generateResultMessage(
        { task_type: intent.task }, ivrResult.result, demoUser.language,
      );

      let audioUrl = null;
      try {
        const audioBuffer = await sarvam.synthesizeSpeech(resultText, demoUser.language);
        const filename = `${taskId}.mp3`;
        const audioDir = path.join(__dirname, '../../public/audio');
        fs.mkdirSync(audioDir, { recursive: true });
        fs.writeFileSync(path.join(audioDir, filename), audioBuffer);
        await speaker.playBuffer(audioBuffer, 'Voice reply'); // also play on host speakers
        audioUrl = `/public/audio/${filename}`;
      } catch (ttsErr) {
        logger.error('DEMO', `TTS failed, returning text only: ${ttsErr.message}`);
      }

      send({ type: 'tts_ready', text: resultText, audioUrl });
    } else {
      // Record the failed attempt for honest metrics, then report.
      const { data: task } = db.createTask('demo_user', intent.task, intent);
      db.updateTask(task.id, { status: 'failed', error_message: 'IVR navigation did not complete' });
      send({ type: 'error', message: 'IVR navigation did not complete. Check logs.' });
    }
  } catch (err) {
    send({ type: 'error', message: err.message });
  }

  res.end();
});

// Metrics endpoint.
router.get('/metrics', (req, res) => {
  res.json(db.getAllMetrics());
});

module.exports = router;
