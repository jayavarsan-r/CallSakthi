'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Local SQLite store (replaces the old Supabase service).
//
// Same function signatures as the old supabase.js — every call returns the
// { data, error } shape — so nothing else in the codebase has to change beyond
// swapping the require path.
//
// On Railway the filesystem is ephemeral, so we keep the DB under /tmp there;
// locally it lives at the repo root for easy inspection.
// ─────────────────────────────────────────────────────────────────────────────

const DB_PATH = process.env.RAILWAY_ENVIRONMENT
  ? path.join('/tmp', 'callsakthi.db')
  : path.join(__dirname, '../../callsakthi.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    phone TEXT PRIMARY KEY,
    name TEXT,
    language TEXT DEFAULT 'ta-IN',
    lpg_provider TEXT,
    lpg_consumer_number TEXT,
    courier_preference TEXT,
    conversation_state TEXT DEFAULT 'idle',
    pending_task_data TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_phone TEXT NOT NULL,
    task_type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    intent_data TEXT NOT NULL,
    call_sid TEXT,
    result TEXT,
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS call_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    call_sid TEXT,
    step_number INTEGER DEFAULT 0,
    ivr_prompt TEXT,
    action_taken TEXT,
    action_value TEXT,
    reasoning TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

logger.info('DB', `SQLite ready at ${DB_PATH}`);

// Serialize object/array fields to JSON for storage; leave scalars + null as-is.
function serialize(v) {
  if (v === null || v === undefined) return v;
  return typeof v === 'object' ? JSON.stringify(v) : v;
}

function getOrCreateUser(phone) {
  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user) {
    db.prepare('INSERT INTO users (phone) VALUES (?)').run(phone);
    user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  }
  if (user.pending_task_data) {
    try { user.pending_task_data = JSON.parse(user.pending_task_data); } catch (_) {}
  }
  return { data: user, error: null };
}

function updateUser(phone, updates) {
  const keys = Object.keys(updates);
  if (keys.length) {
    const fields = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => serialize(updates[k]));
    db.prepare(`UPDATE users SET ${fields}, updated_at = datetime('now') WHERE phone = ?`)
      .run(...values, phone);
  }
  return { data: getOrCreateUser(phone).data, error: null };
}

function createTask(phone, taskType, intentData) {
  const id = uuidv4();
  db.prepare('INSERT INTO tasks (id, user_phone, task_type, intent_data) VALUES (?, ?, ?, ?)')
    .run(id, phone, taskType, JSON.stringify(intentData || {}));
  return {
    data: { id, user_phone: phone, task_type: taskType, status: 'pending', intent_data: intentData },
    error: null,
  };
}

function updateTask(taskId, updates) {
  const keys = Object.keys(updates);
  if (keys.length) {
    const fields = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => serialize(updates[k]));
    db.prepare(`UPDATE tasks SET ${fields}, updated_at = datetime('now') WHERE id = ?`)
      .run(...values, taskId);
  }
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (task) {
    try { task.intent_data = JSON.parse(task.intent_data || '{}'); } catch (_) {}
    try { task.result = task.result ? JSON.parse(task.result) : null; } catch (_) {}
  }
  return { data: task || null, error: null };
}

function logCallStep(taskId, callSid, stepNumber, ivrPrompt, action, value, reasoning) {
  db.prepare(`INSERT INTO call_logs
    (task_id, call_sid, step_number, ivr_prompt, action_taken, action_value, reasoning)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(taskId, callSid, stepNumber, ivrPrompt, action, value, reasoning);
  return { data: null, error: null };
}

function getTaskByCallSid(callSid) {
  const task = db.prepare('SELECT * FROM tasks WHERE call_sid = ? ORDER BY created_at DESC LIMIT 1').get(callSid);
  if (task) {
    try { task.intent_data = JSON.parse(task.intent_data || '{}'); } catch (_) {}
    try { task.result = task.result ? JSON.parse(task.result) : null; } catch (_) {}
  }
  return { data: task || null, error: null };
}

function getActiveTask(phone) {
  const task = db.prepare(
    `SELECT * FROM tasks WHERE user_phone = ? AND status NOT IN ('completed','failed')
     ORDER BY created_at DESC LIMIT 1`
  ).get(phone);
  return { data: task || null, error: null };
}

function getCallLogs(taskId) {
  return db.prepare('SELECT * FROM call_logs WHERE task_id = ? ORDER BY step_number').all(taskId);
}

function getAllMetrics() {
  const total = db.prepare('SELECT COUNT(*) as count FROM tasks').get().count;
  const completed = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status='completed'").get().count;
  const failed = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status='failed'").get().count;
  const avgSteps = db.prepare(
    'SELECT AVG(step_count) as avg FROM (SELECT COUNT(*) as step_count FROM call_logs GROUP BY task_id)'
  ).get().avg || 0;
  return { total, completed, failed, avgSteps: Math.round(avgSteps * 10) / 10 };
}

function getRecentTasks(limit = 10) {
  const rows = db.prepare(`
    SELECT t.id, t.task_type, t.status, t.created_at, t.updated_at,
           COUNT(cl.id) as step_count
    FROM tasks t
    LEFT JOIN call_logs cl ON cl.task_id = t.id
    GROUP BY t.id
    ORDER BY t.created_at DESC
    LIMIT ?
  `).all(limit);
  return { data: rows, error: null };
}

module.exports = {
  db,
  getOrCreateUser,
  updateUser,
  createTask,
  updateTask,
  logCallStep,
  getTaskByCallSid,
  getActiveTask,
  getCallLogs,
  getAllMetrics,
  getRecentTasks,
};
