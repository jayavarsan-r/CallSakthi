'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Tiny helper to read the public URL of a running ngrok tunnel via its local
// inspection API (http://127.0.0.1:4040). Used only for nicer local-dev logging;
// returns null if ngrok isn't running. No effect on the app itself.
// ─────────────────────────────────────────────────────────────────────────────

async function getNgrokUrl() {
  try {
    const res = await fetch('http://127.0.0.1:4040/api/tunnels', { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return null;
    const body = await res.json();
    const tunnels = (body && body.tunnels) || [];
    // Prefer the https tunnel.
    const https = tunnels.find((t) => t.public_url && t.public_url.startsWith('https://'));
    return (https || tunnels[0] || {}).public_url || null;
  } catch (_) {
    return null;
  }
}

module.exports = { getNgrokUrl };
