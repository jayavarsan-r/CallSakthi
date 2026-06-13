'use strict';

// Structured console logger.
// Format: [2024-01-01 10:00:00] [INFO] [WHATSAPP] Message here

function ts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function fmt(level, category, message) {
  return `[${ts()}] [${level}] [${String(category).toUpperCase()}] ${message}`;
}

function info(category, message, data) {
  if (data !== undefined) console.log(fmt('INFO', category, message), safe(data));
  else console.log(fmt('INFO', category, message));
}

function error(category, message, err) {
  const line = fmt('ERROR', category, message);
  if (err instanceof Error) console.error(line, err.message, err.stack ? `\n${err.stack}` : '');
  else if (err !== undefined) console.error(line, safe(err));
  else console.error(line);
}

function debug(category, message, data) {
  if (process.env.NODE_ENV === 'production') return;
  if (data !== undefined) console.log(fmt('DEBUG', category, message), safe(data));
  else console.log(fmt('DEBUG', category, message));
}

function safe(data) {
  try {
    if (typeof data === 'string') return data;
    return JSON.stringify(data);
  } catch (_) {
    return '[unserializable]';
  }
}

module.exports = { info, error, debug };
