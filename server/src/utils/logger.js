// src/utils/logger.js
// Minimal timestamped logger. Swap for pino/winston later if you want
// structured logs shipped somewhere — not needed for a single-shop kiosk.

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function errorLog(...args) {
  console.error(`[${new Date().toISOString()}] ERROR:`, ...args);
}

module.exports = { log, errorLog };
