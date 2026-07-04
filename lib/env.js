// Loads .env before any other module reads process.env.
// Import this FIRST in server.js — ESM evaluates imports in order, so this
// runs before lib/analyze.js decides whether an API key exists.
if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {
    /* no .env file — fine */
  }
}
