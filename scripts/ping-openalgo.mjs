#!/usr/bin/env node
/**
 * Pings OpenAlgo every 30 seconds to keep Render free-tier from sleeping.
 * Run: node scripts/ping-openalgo.mjs
 * Or: npm run ping-openalgo
 */
const OPENALGO_URL = process.env.OPENALGO_URL || "https://openalgo-kqed.onrender.com";
const INTERVAL_MS = 30 * 1000;

async function ping() {
  try {
    const res = await fetch(OPENALGO_URL, { method: "HEAD" });
    console.log(`[${new Date().toISOString()}] ping ${OPENALGO_URL} -> ${res.status}`);
  } catch (e) {
    console.error(`[${new Date().toISOString()}] ping failed:`, e.message);
  }
}

console.log(`Pinging ${OPENALGO_URL} every 30s. Ctrl+C to stop.`);
ping();
setInterval(ping, INTERVAL_MS);
