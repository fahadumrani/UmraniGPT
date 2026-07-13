/* ============================================================
   UMRANIGPT SERVER — App Config Manager
   Single source of truth for all runtime settings.

   IMPORTANT DESIGN RULE:
   Once server/config/app.json exists on disk, it is the ONLY
   source of truth. Environment variables (OLLAMA_URL, etc.) are
   used ONLY to seed app.json the very first time it's created —
   after that they are never consulted again. This is what makes
   "change Ollama URL from admin.html → Provider Settings" work
   correctly and PERSIST. An earlier version of this file kept
   re-applying env var overrides on every read, which silently
   reverted every admin panel change back to the .env value —
   fixed here.

   Admins can still force a reset back to env-var values by
   deleting server/config/app.json and restarting.
============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { logError } = require('../utils/logger');

const APP_JSON_PATH = path.join(__dirname, '..', '..', 'config', 'app.json');
const EXAMPLE_PATH  = path.join(__dirname, '..', '..', 'config', 'app.json.example');

/* Deep merge — right wins for scalars, recurses for objects. */
const deepMerge = (base, override) => {
  const out = { ...base };
  for (const key of Object.keys(override || {})) {
    if (override[key] !== null && typeof override[key] === 'object' && !Array.isArray(override[key])) {
      out[key] = deepMerge(base[key] || {}, override[key]);
    } else {
      out[key] = override[key];
    }
  }
  return out;
};

/* Applied ONLY when app.json is being created for the very first
   time, so a custom OLLAMA_URL/DEFAULT_MODEL already set in the
   env files carries over as the initial value. Never applied again
   after that — app.json becomes authoritative. */
const applySeedFromEnv = (cfg) => {
  const c = deepMerge({}, cfg);

  if (process.env.OLLAMA_URL)     c.providers.ollama.url = process.env.OLLAMA_URL;
  if (process.env.DEFAULT_MODEL)  c.defaultModel = process.env.DEFAULT_MODEL;
  if (process.env.GEN_TEMPERATURE !== undefined)    c.generation.temperature   = Number(process.env.GEN_TEMPERATURE);
  if (process.env.GEN_TOP_P !== undefined)          c.generation.topP         = Number(process.env.GEN_TOP_P);
  if (process.env.GEN_TOP_K !== undefined)          c.generation.topK         = Number(process.env.GEN_TOP_K);
  if (process.env.GEN_REPEAT_PENALTY !== undefined) c.generation.repeatPenalty = Number(process.env.GEN_REPEAT_PENALTY);
  if (process.env.GEN_CONTEXT_LENGTH !== undefined) c.generation.contextLength = Number(process.env.GEN_CONTEXT_LENGTH);
  if (process.env.GEN_SEED !== undefined)           c.generation.seed         = Number(process.env.GEN_SEED);
  if (process.env.GEN_SYSTEM_PROMPT)                c.system.systemPrompt     = process.env.GEN_SYSTEM_PROMPT;
  if (process.env.MEMORY_ENABLED !== undefined)     c.memory.enabled          = process.env.MEMORY_ENABLED !== 'false';
  if (process.env.MEMORY_EXTRACT_EVERY)             c.memory.extractEvery     = Number(process.env.MEMORY_EXTRACT_EVERY);
  if (process.env.MEMORY_MAX_FACTS)                 c.memory.maxFacts         = Number(process.env.MEMORY_MAX_FACTS);
  if (process.env.MEMORY_MODEL)                     c.memory.model            = process.env.MEMORY_MODEL;

  return c;
};

/* Load config from disk. If app.json doesn't exist yet, create it
   from app.json.example, seeded once from env vars, and persist
   that as the new app.json — from then on app.json alone rules. */
const loadFromDisk = () => {
  if (fs.existsSync(APP_JSON_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(APP_JSON_PATH, 'utf8'));
    } catch (err) {
      logError('Could not read app.json — check it is valid JSON', err);
      return {};
    }
  }

  // First run — create app.json from the example, seeded from env.
  let example = {};
  try {
    example = JSON.parse(fs.readFileSync(EXAMPLE_PATH, 'utf8'));
  } catch (err) {
    logError('Could not read app.json.example', err);
  }
  const seeded = applySeedFromEnv(example);

  try {
    if (!fs.existsSync(path.dirname(APP_JSON_PATH))) {
      fs.mkdirSync(path.dirname(APP_JSON_PATH), { recursive: true });
    }
    fs.writeFileSync(APP_JSON_PATH, JSON.stringify(seeded, null, 2), 'utf8');
    console.log('[UmraniGPT] Created server/config/app.json from defaults (+ any .env overrides).');
  } catch (err) {
    logError('Could not create app.json on disk — using in-memory defaults only', err);
  }

  return seeded;
};

let _cache = null;

const get = () => {
  if (!_cache) _cache = loadFromDisk();
  return _cache;
};

/* Partially update the config and persist to disk.
   This is what admin.html → Provider Settings calls. Writes
   EXACTLY what's requested — no env var reapplication, so the
   change actually sticks. */
const update = (partial) => {
  if (!partial || typeof partial !== 'object') throw new Error('Invalid config update');

  const current = get();
  const merged  = deepMerge(current, partial);

  // Basic sanity checks before writing
  if (!['ollama', 'openai_compat'].includes(merged.provider)) {
    throw new Error(`Unknown provider: ${merged.provider}`);
  }
  if (typeof merged.generation.temperature !== 'number' || merged.generation.temperature < 0 || merged.generation.temperature > 2) {
    throw new Error('temperature must be a number between 0 and 2');
  }
  if (merged.providers?.ollama?.url && !/^https?:\/\/.+/i.test(merged.providers.ollama.url)) {
    throw new Error('Ollama URL must start with http:// or https://');
  }
  if (merged.providers?.openai_compat?.url && !/^https?:\/\/.+/i.test(merged.providers.openai_compat.url)) {
    throw new Error('Provider URL must start with http:// or https://');
  }

  try {
    if (!fs.existsSync(path.dirname(APP_JSON_PATH))) {
      fs.mkdirSync(path.dirname(APP_JSON_PATH), { recursive: true });
    }
    fs.writeFileSync(APP_JSON_PATH, JSON.stringify(merged, null, 2), 'utf8');
    _cache = merged; // cache exactly what was written — no overrides layered back on
    return _cache;
  } catch (err) {
    logError('Could not write app config', err);
    throw new Error('Config could not be saved to disk');
  }
};

const reload = () => { _cache = null; return get(); };

module.exports = { get, update, reload };
