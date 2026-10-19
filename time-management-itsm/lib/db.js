// Lightweight JSON-file datastore with atomic, debounced writes.
// Good for small/medium teams; the collection API is intentionally small so it
// can be swapped for a SQL database later without touching the routes.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const COLLECTIONS = [
  'users', 'profiles', 'projects', 'timesheets', 'tickets', 'forms',
  'emailAccounts', 'workflows', 'workflowLogs', 'emailLog', 'audit',
];

let state = null;
let saveTimer = null;

function uid(prefix = '') {
  return prefix + crypto.randomBytes(8).toString('hex');
}

function now() {
  return new Date().toISOString();
}

function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    state = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } else {
    state = {};
  }
  for (const c of COLLECTIONS) if (!Array.isArray(state[c])) state[c] = [];
  if (!state.settings) state.settings = {};
  if (!state.counters) state.counters = {};
  return state;
}

function flush() {
  if (!state) return;
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DB_FILE);
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
  load, save, flush, uid, now, nextNumber,
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

process.on('exit', flush);
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { flush(); process.exit(0); });
}

module.exports = db;
