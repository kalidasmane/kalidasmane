// Lightweight in-memory datastore with debounced writes.
// Persists to a JSON file, or — when DATABASE_URL is set — to a single JSONB row in
// PostgreSQL, so hosts without a persistent disk (e.g. Render free) keep their data.
// Good for small/medium teams; the collection API is intentionally small.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const COLLECTIONS = [
  'users', 'profiles', 'projects', 'timesheets', 'tickets', 'forms',
  'emailAccounts', 'workflows', 'workflowLogs', 'emailLog', 'audit', 'devices', 'remoteSessions', 'notifyChannels', 'notifyLog', 'pushSubs',
];

let state = null;
let saveTimer = null;
let pool = null; // pg Pool when DATABASE_URL is set
let writing = Promise.resolve(); // serialises PostgreSQL writes

function uid(prefix = '') {
  return prefix + crypto.randomBytes(8).toString('hex');
}

function now() {
  return new Date().toISOString();
}

function pgSsl(url) {
  if (/@(localhost|127\.0\.0\.1)[:/]/.test(url) || /sslmode=disable/.test(url)) return false;
  return { rejectUnauthorized: process.env.DATABASE_SSL_VERIFY !== 'false' };
}

async function load() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = require('pg');
    // sslmode in the URL would override our ssl option, so drop it and set ssl explicitly.
    const connectionString = url.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '');
    pool = new Pool({ connectionString, ssl: pgSsl(url), max: 3 });
    await pool.query('CREATE TABLE IF NOT EXISTS app_state (id int PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
    const r = await pool.query('SELECT data FROM app_state WHERE id = 1');
    state = r.rows[0]?.data || {};
  } else {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    state = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
  }
  for (const c of COLLECTIONS) if (!Array.isArray(state[c])) state[c] = [];
  if (!state.settings) state.settings = {};
  if (!state.counters) state.counters = {};
  return state;
}

// Writes the current state now. Returns a promise that settles once it is stored.
function flush() {
  if (!state) return Promise.resolve();
  clearTimeout(saveTimer);
  if (pool) {
    const json = JSON.stringify(state);
    writing = writing.then(() => pool.query(
      'INSERT INTO app_state (id, data, updated_at) VALUES (1, $1, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()',
      [json],
    )).catch((e) => console.error('Failed to save to PostgreSQL:', e.message));
    return writing;
  }
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DB_FILE);
  return Promise.resolve();
}

async function close() {
  await flush();
  if (pool) await pool.end();
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 150);
}

function nextNumber(key, start = 1000) {
  state.counters[key] = (state.counters[key] || start) + 1;
  save();
  return state.counters[key];
}

const db = {
  load, save, flush, close, uid, now, nextNumber,
  get state() { return state; },
  all(col) { return state[col]; },
  find(col, id) { return state[col].find((r) => r.id === id) || null; },
  where(col, fn) { return state[col].filter(fn); },
  insert(col, rec) {
    const r = { id: uid(), createdAt: now(), updatedAt: now(), ...rec };
    state[col].push(r);
    save();
    return r;
  },
  update(col, id, patch) {
    const r = db.find(col, id);
    if (!r) return null;
    Object.assign(r, patch, { id: r.id, createdAt: r.createdAt, updatedAt: now() });
    save();
    return r;
  },
  remove(col, id) {
    const i = state[col].findIndex((r) => r.id === id);
    if (i === -1) return false;
    state[col].splice(i, 1);
    save();
    return true;
  },
  // Append to a capped log collection.
  log(col, rec, cap = 500) {
    state[col].unshift({ id: uid(), at: now(), ...rec });
    if (state[col].length > cap) state[col].length = cap;
    save();
  },
};

process.on('exit', () => { if (!pool) flush(); });
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { close().finally(() => process.exit(0)); });
}

module.exports = db;
