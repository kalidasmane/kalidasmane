// Password hashing, sessions, presence (online status) and permission checks.
const crypto = require('crypto');
const db = require('./db');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const ONLINE_WINDOW_MS = 75 * 1000; // heartbeat every 30s on the client
const sessions = new Map(); // token -> { userId, expires }

// Modules and the actions a profile can grant on each.
const MODULES = {
  dashboard: { label: 'Dashboard', actions: ['view'] },
  timesheet: { label: 'Daily Tracker', actions: ['view', 'create', 'edit', 'delete', 'viewAll'] },
  tickets: { label: 'Tickets', actions: ['view', 'create', 'edit', 'delete', 'viewAll', 'assign'] },
  projects: { label: 'Projects', actions: ['view', 'create', 'edit', 'delete'] },
  devices: { label: 'Devices & Remote', actions: ['view', 'create', 'edit', 'delete', 'connect'] },
  reports: { label: 'Reports', actions: ['view'] },
  users: { label: 'Users', actions: ['view', 'create', 'edit', 'delete'] },
  profiles: { label: 'Profiles', actions: ['view', 'create', 'edit', 'delete'] },
  forms: { label: 'Forms', actions: ['view', 'create', 'edit', 'delete'] },
  email: { label: 'Email Channels', actions: ['view', 'create', 'edit', 'delete'] },
  workflows: { label: 'Workflow Automation', actions: ['view', 'create', 'edit', 'delete'] },
  settings: { label: 'General Settings', actions: ['view', 'edit'] },
};

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const [, salt, hash] = stored.split('$');
  const test = crypto.scryptSync(String(password), salt, 64);
  const known = Buffer.from(hash, 'hex');
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, expires: Date.now() + SESSION_TTL_MS });
  touch(userId);
  return token;
}

function destroySession(token) {
  const s = sessions.get(token);
  sessions.delete(token);
  if (s && !hasSession(s.userId)) {
    const u = db.find('users', s.userId);
    if (u) { u.lastSeen = null; db.save(); }
  }
}

function destroyUserSessions(userId) {
  for (const [t, s] of sessions) if (s.userId === userId) sessions.delete(t);
}

function hasSession(userId) {
  for (const s of sessions.values()) if (s.userId === userId && s.expires > Date.now()) return true;
  return false;
}

function touch(userId) {
  const u = db.find('users', userId);
  if (u) u.lastSeen = new Date().toISOString(); // in-memory; persisted on next save
}

function isOnline(user) {
  if (!user.lastSeen || !hasSession(user.id)) return false;
  return Date.now() - new Date(user.lastSeen).getTime() < ONLINE_WINDOW_MS;
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function permissionsFor(user) {
  const profile = user && db.find('profiles', user.profileId);
  return (profile && profile.permissions) || {};
}

function can(user, module, action) {
  const p = permissionsFor(user)[module];
  return Array.isArray(p) && p.includes(action);
}

// Express middleware: attaches req.user or rejects with 401.
function requireAuth(req, res, next) {
  const token = parseCookies(req).tm_session;
  const s = token && sessions.get(token);
  if (!s || s.expires < Date.now()) {
    if (token) sessions.delete(token);
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const user = db.find('users', s.userId);
  if (!user || !user.active) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Account disabled' });
  }
  s.expires = Date.now() + SESSION_TTL_MS;
  touch(user.id);
  req.user = user;
  req.token = token;
  next();
}

function requirePerm(module, action) {
  return (req, res, next) => {
    if (!can(req.user, module, action)) {
      return res.status(403).json({ error: `You do not have "${action}" permission on ${MODULES[module]?.label || module}` });
    }
    next();
  };
}

// Users that report (directly or indirectly) to the given user.
function reportees(userId) {
  const out = new Set();
  const walk = (id) => {
    for (const u of db.all('users')) {
      if (u.managerId === id && !out.has(u.id)) { out.add(u.id); walk(u.id); }
    }
  };
  walk(userId);
  return out;
}

module.exports = {
  MODULES, hashPassword, verifyPassword, createSession, destroySession,
  destroyUserSessions, isOnline, requireAuth, requirePerm, can, permissionsFor,
  parseCookies, reportees, SESSION_TTL_MS,
};
