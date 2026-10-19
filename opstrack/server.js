// OpsTrack — API server + static web app.
const path = require('path');
const express = require('express');
const db = require('./lib/db');
const auth = require('./lib/auth');
const { seed } = require('./lib/seed');
const tickets = require('./lib/tickets');
const workflow = require('./lib/workflow');
const email = require('./lib/email');

const app = express();
app.disable('x-powered-by');
// Behind a hosting proxy (Render, nginx, …) so req.secure / req.ip reflect the real client.
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' });
  next();
});

const { requireAuth, requirePerm, can } = auth;
const settings = () => db.state.settings;
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

// ---------- serializers ----------
function publicUser(u) {
  const profile = db.find('profiles', u.profileId);
  const manager = db.find('users', u.managerId);
  return {
    id: u.id, username: u.username, name: u.name, email: u.email, phone: u.phone,
    department: u.department, designation: u.designation, active: u.active,
    profileId: u.profileId, profileName: profile?.name || '—', profileColor: profile?.color,
    managerId: u.managerId, managerName: manager?.name || null,
    online: auth.isOnline(u), lastSeen: u.lastSeen, createdAt: u.createdAt,
    workload: tickets.workload(u.id),
  };
}

function maskAccount(a) {
  return { ...a, password: a.password ? '********' : '' };
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---------- auth ----------
const loginAttempts = new Map();
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const ip = req.ip;
  const att = loginAttempts.get(ip) || { n: 0, until: 0 };
  if (att.until > Date.now()) return bad(res, 'Too many failed attempts. Try again in a minute.', 429);
  const user = db.all('users').find((u) => u.username.toLowerCase() === String(username || '').toLowerCase());
  if (!user || !auth.verifyPassword(password, user.passwordHash)) {
    att.n += 1;
    if (att.n >= 5) { att.until = Date.now() + 60000; att.n = 0; }
    loginAttempts.set(ip, att);
    return bad(res, 'Invalid username or password', 401);
  }
  if (!user.active) return bad(res, 'This account is disabled. Contact your administrator.', 403);
  loginAttempts.delete(ip);
  const token = auth.createSession(user.id);
  res.cookie('tm_session', token, { httpOnly: true, sameSite: 'lax', maxAge: auth.SESSION_TTL_MS, secure: req.secure });
  db.log('audit', { userId: user.id, action: 'login' });
  res.json({ ok: true });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  auth.destroySession(req.token);
  res.clearCookie('tm_session');
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user), permissions: auth.permissionsFor(req.user), mustChangePassword: !!req.user.mustChangePassword });
});

app.post('/api/auth/heartbeat', requireAuth, (req, res) => res.json({ ok: true }));

app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  if (!auth.verifyPassword(current, req.user.passwordHash)) return bad(res, 'Current password is incorrect');
  if (!next || String(next).length < 5) return bad(res, 'New password must be at least 5 characters');
  db.update('users', req.user.id, { passwordHash: auth.hashPassword(next), mustChangePassword: false });
  res.json({ ok: true });
});

// ---------- lookup data used across the UI ----------
app.get('/api/meta', requireAuth, (req, res) => {
  res.json({
    settings: settings(),
    modules: auth.MODULES,
    users: db.all('users').filter((u) => u.active).map((u) => ({
      id: u.id, name: u.name, email: u.email, designation: u.designation, managerId: u.managerId,
      online: auth.isOnline(u), workload: tickets.workload(u.id), profileId: u.profileId,
    })),
    projects: db.all('projects').map((p) => pick(p, ['id', 'code', 'name', 'status', 'client'])),
    profiles: db.all('profiles').map((p) => pick(p, ['id', 'name', 'color'])),
    forms: db.all('forms').map((f) => pick(f, ['id', 'name', 'active', 'public'])),
    workflowMeta: { triggers: workflow.TRIGGERS, operators: workflow.OPERATORS, actions: workflow.ACTIONS },
    emailProviders: email.PROVIDERS,
  });
});

app.get('/api/presence', requireAuth, (req, res) => {
  res.json(db.all('users').filter((u) => u.active).map((u) => ({ id: u.id, online: auth.isOnline(u), workload: tickets.workload(u.id) })));
});

// ---------- users ----------
const USER_FIELDS = ['name', 'email', 'phone', 'department', 'designation', 'profileId', 'managerId', 'active'];

function validManager(userId, managerId) {
  if (!managerId) return true;
  if (managerId === userId) return false;
  return !auth.reportees(userId).has(managerId); // no cycles
}

app.get('/api/users', requireAuth, requirePerm('users', 'view'), (req, res) => {
  res.json(db.all('users').map(publicUser));
});

app.post('/api/users', requireAuth, requirePerm('users', 'create'), (req, res) => {
  const b = req.body || {};
  if (!b.username || !b.name || !b.password) return bad(res, 'Username, full name and password are required');
  if (db.all('users').some((u) => u.username.toLowerCase() === b.username.toLowerCase())) return bad(res, 'Username already exists');
  if (!db.find('profiles', b.profileId)) return bad(res, 'Select a valid profile');
  const u = db.insert('users', {
    username: b.username.trim(), ...pick(b, USER_FIELDS), active: b.active !== false,
    managerId: b.managerId || null, passwordHash: auth.hashPassword(b.password),
    mustChangePassword: !!b.mustChangePassword, lastSeen: null,
  });
  db.log('audit', { userId: req.user.id, action: 'user.create', target: u.username });
  res.json(publicUser(u));
});

app.put('/api/users/:id', requireAuth, requirePerm('users', 'edit'), (req, res) => {
  const u = db.find('users', req.params.id);
  if (!u) return bad(res, 'User not found', 404);
  const b = req.body || {};
  if (b.profileId && !db.find('profiles', b.profileId)) return bad(res, 'Select a valid profile');
  if (!validManager(u.id, b.managerId)) return bad(res, 'A user cannot report to themselves or to someone who reports to them');
  if (u.id === req.user.id && b.active === false) return bad(res, 'You cannot disable your own account');
  const patch = pick(b, USER_FIELDS);
  if ('managerId' in patch) patch.managerId = patch.managerId || null;
  if (b.username && b.username !== u.username) {
    if (db.all('users').some((x) => x.id !== u.id && x.username.toLowerCase() === b.username.toLowerCase())) return bad(res, 'Username already exists');
    patch.username = b.username.trim();
  }
  if (b.password) { patch.passwordHash = auth.hashPassword(b.password); patch.mustChangePassword = !!b.mustChangePassword; }
  db.update('users', u.id, patch);
  if (patch.active === false) auth.destroyUserSessions(u.id);
  db.log('audit', { userId: req.user.id, action: 'user.update', target: u.username });
  res.json(publicUser(u));
});

app.delete('/api/users/:id', requireAuth, requirePerm('users', 'delete'), (req, res) => {
  const u = db.find('users', req.params.id);
  if (!u) return bad(res, 'User not found', 404);
  if (u.id === req.user.id) return bad(res, 'You cannot delete your own account');
  const adminProfiles = db.where('profiles', (p) => p.system).map((p) => p.id);
  if (adminProfiles.includes(u.profileId) && db.where('users', (x) => adminProfiles.includes(x.profileId)).length <= 1) {
    return bad(res, 'Cannot delete the last administrator');
  }
  for (const x of db.all('users')) if (x.managerId === u.id) x.managerId = u.managerId || null;
  for (const t of db.all('tickets')) if (t.assigneeId === u.id && !tickets.isClosed(t)) t.assigneeId = null;
  auth.destroyUserSessions(u.id);
  db.remove('users', u.id);
  db.log('audit', { userId: req.user.id, action: 'user.delete', target: u.username });
  res.json({ ok: true });
});

// ---------- profiles (custom roles) ----------
function cleanPermissions(input) {
  const out = {};
  for (const [mod, def] of Object.entries(auth.MODULES)) {
    const acts = Array.isArray(input?.[mod]) ? input[mod].filter((a) => def.actions.includes(a)) : [];
    if (acts.length) out[mod] = acts;
  }
  return out;
}

app.get('/api/profiles', requireAuth, requirePerm('profiles', 'view'), (req, res) => {
  res.json(db.all('profiles').map((p) => ({ ...p, userCount: db.where('users', (u) => u.profileId === p.id).length })));
});

app.post('/api/profiles', requireAuth, requirePerm('profiles', 'create'), (req, res) => {
  const b = req.body || {};
  if (!b.name) return bad(res, 'Profile name is required');
  if (db.all('profiles').some((p) => p.name.toLowerCase() === b.name.toLowerCase())) return bad(res, 'A profile with that name exists');
  res.json(db.insert('profiles', { name: b.name, description: b.description || '', color: b.color || '#64748b', permissions: cleanPermissions(b.permissions) }));
});

app.put('/api/profiles/:id', requireAuth, requirePerm('profiles', 'edit'), (req, res) => {
  const p = db.find('profiles', req.params.id);
  if (!p) return bad(res, 'Profile not found', 404);
  const b = req.body || {};
  const patch = pick(b, ['name', 'description', 'color']);
  if (!p.system && b.permissions) patch.permissions = cleanPermissions(b.permissions);
  res.json(db.update('profiles', p.id, patch));
});

app.delete('/api/profiles/:id', requireAuth, requirePerm('profiles', 'delete'), (req, res) => {
  const p = db.find('profiles', req.params.id);
  if (!p) return bad(res, 'Profile not found', 404);
  if (p.system) return bad(res, 'The Administrator profile cannot be deleted');
  const n = db.where('users', (u) => u.profileId === p.id).length;
  if (n) return bad(res, `${n} user(s) still use this profile. Reassign them first.`);
  db.remove('profiles', p.id);
  res.json({ ok: true });
});

// ---------- projects ----------
const PROJECT_FIELDS = ['code', 'name', 'client', 'description', 'status', 'startDate', 'endDate', 'budgetHours', 'managerId', 'memberIds', 'keywords', 'color'];

function projectStats(p) {
  const entries = db.where('timesheets', (e) => e.projectId === p.id);
  const minutes = entries.reduce((s, e) => s + e.minutes, 0);
  return { loggedMinutes: minutes, contributors: new Set(entries.map((e) => e.userId)).size };
}

app.get('/api/projects', requireAuth, requirePerm('projects', 'view'), (req, res) => {
  res.json(db.all('projects').map((p) => ({ ...p, ...projectStats(p), managerName: db.find('users', p.managerId)?.name || null })));
});

app.post('/api/projects', requireAuth, requirePerm('projects', 'create'), (req, res) => {
  const b = req.body || {};
  if (!b.name) return bad(res, 'Project name is required');
  if (b.code && db.all('projects').some((p) => p.code && p.code.toLowerCase() === b.code.toLowerCase())) return bad(res, 'Project code already exists');
  res.json(db.insert('projects', { status: 'Active', memberIds: [], ...pick(b, PROJECT_FIELDS) }));
});

app.put('/api/projects/:id', requireAuth, requirePerm('projects', 'edit'), (req, res) => {
  const p = db.find('projects', req.params.id);
  if (!p) return bad(res, 'Project not found', 404);
  res.json(db.update('projects', p.id, pick(req.body || {}, PROJECT_FIELDS)));
});

app.delete('/api/projects/:id', requireAuth, requirePerm('projects', 'delete'), (req, res) => {
  const p = db.find('projects', req.params.id);
  if (!p) return bad(res, 'Project not found', 404);
  // Keep history readable: entries keep a snapshot of the project name.
  for (const e of db.all('timesheets')) if (e.projectId === p.id) { e.projectName = p.name; e.projectId = null; }
  for (const t of db.all('tickets')) if (t.projectId === p.id) t.projectId = null;
  db.remove('projects', p.id);
  res.json({ ok: true });
});

// ---------- daily tracker (timesheets) ----------
function visibleUserIds(user) {
  if (can(user, 'timesheet', 'viewAll')) return null; // everyone
  const ids = auth.reportees(user.id);
  ids.add(user.id);
  return ids;
}

// If no project is selected, detect one from the activity text (name, code or keywords).
function detectProject(text) {
  const hay = ` ${String(text || '').toLowerCase()} `;
  for (const p of db.all('projects')) {
    const terms = [p.name, p.code, ...String(p.keywords || '').split(',')].map((x) => String(x || '').trim().toLowerCase()).filter((x) => x.length >= 3);
    if (terms.some((t) => hay.includes(t))) return p;
  }
  return null;
}

function toMinutes(b) {
  if (b.startTime && b.endTime) {
    const [sh, sm] = b.startTime.split(':').map(Number);
    const [eh, em] = b.endTime.split(':').map(Number);
    const m = (eh * 60 + em) - (sh * 60 + sm);
    if (m > 0) return m;
  }
  return Math.round(Number(b.hours || 0) * 60 + Number(b.minutes || 0));
}

function entryOut(e) {
  const p = db.find('projects', e.projectId);
  const t = db.find('tickets', e.ticketId);
  return { ...e, userName: db.find('users', e.userId)?.name || 'Deleted user', projectName: p?.name || e.projectName || null, projectCode: p?.code, ticketNumber: t?.number || null };
}

function filterEntries(user, q) {
  const vis = visibleUserIds(user);
  return db.where('timesheets', (e) => (!vis || vis.has(e.userId))
    && (!q.from || e.date >= q.from) && (!q.to || e.date <= q.to)
    && (!q.userId || e.userId === q.userId)
    && (!q.projectId || (q.projectId === 'none' ? !e.projectId : e.projectId === q.projectId))
    && (!q.category || e.category === q.category));
}

app.get('/api/timesheets', requireAuth, requirePerm('timesheet', 'view'), (req, res) => {
  const list = filterEntries(req.user, req.query).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  res.json(list.map(entryOut));
});

function buildEntry(b, user) {
  const minutes = toMinutes(b);
  if (!b.date || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return { error: 'A valid date is required' };
  if (!b.activity) return { error: 'Describe the activity you performed' };
  if (minutes <= 0 || minutes > 24 * 60) return { error: 'Duration must be between 1 minute and 24 hours' };
  let projectId = b.projectId || null;
  let autoDetected = false;
  if (!projectId) {
    const p = detectProject(`${b.activity} ${b.notes || ''}`);
    if (p) { projectId = p.id; autoDetected = true; }
  }
  let userId = user.id;
  if (b.userId && b.userId !== user.id) {
    const vis = visibleUserIds(user);
    if (vis && !vis.has(b.userId)) return { error: 'You can only log time for yourself or your team' };
    userId = b.userId;
  }
  return {
    entry: {
      userId, date: b.date, projectId, autoDetected, category: b.category || (projectId ? 'Project Work' : 'Customer Support'),
      activity: String(b.activity).slice(0, 500), notes: b.notes || '', ticketId: b.ticketId || null,
      startTime: b.startTime || '', endTime: b.endTime || '', minutes, billable: !!b.billable,
      customer: b.customer || '',
    },
  };
}

app.post('/api/timesheets', requireAuth, requirePerm('timesheet', 'create'), (req, res) => {
  const { entry, error } = buildEntry(req.body || {}, req.user);
  if (error) return bad(res, error);
  res.json(entryOut(db.insert('timesheets', entry)));
});

function canTouchEntry(user, e) {
  const vis = visibleUserIds(user);
  return !vis || vis.has(e.userId);
}

app.put('/api/timesheets/:id', requireAuth, requirePerm('timesheet', 'edit'), (req, res) => {
  const e = db.find('timesheets', req.params.id);
  if (!e || !canTouchEntry(req.user, e)) return bad(res, 'Entry not found', 404);
  const { entry, error } = buildEntry({ userId: e.userId, ...req.body }, req.user);
  if (error) return bad(res, error);
  res.json(entryOut(db.update('timesheets', e.id, entry)));
});

app.delete('/api/timesheets/:id', requireAuth, requirePerm('timesheet', 'delete'), (req, res) => {
  const e = db.find('timesheets', req.params.id);
  if (!e || !canTouchEntry(req.user, e)) return bad(res, 'Entry not found', 404);
  db.remove('timesheets', e.id);
  res.json({ ok: true });
});

// ---------- tickets ----------
function visibleTicket(user, t) {
  return can(user, 'tickets', 'viewAll') || t.assigneeId === user.id || t.createdById === user.id
    || auth.reportees(user.id).has(t.assigneeId);
}

function ticketOut(t, full = false) {
  const minutes = db.where('timesheets', (e) => e.ticketId === t.id).reduce((s, e) => s + e.minutes, 0);
  const out = {
    ...t, assigneeName: db.find('users', t.assigneeId)?.name || null,
    projectName: db.find('projects', t.projectId)?.name || null,
    formName: db.find('forms', t.formId)?.name || null, timeSpentMinutes: minutes,
    overdue: !tickets.isClosed(t) && t.dueAt && new Date(t.dueAt) < new Date(),
    commentCount: (t.comments || []).filter((c) => !c.system).length,
  };
  if (!full) delete out.comments;
  return out;
}

app.get('/api/tickets', requireAuth, requirePerm('tickets', 'view'), (req, res) => {
  const q = req.query;
  const text = String(q.q || '').toLowerCase();
  const list = db.where('tickets', (t) => visibleTicket(req.user, t)
    && (!q.status || (q.status === 'open' ? !tickets.isClosed(t) : t.status === q.status))
    && (!q.assigneeId || (q.assigneeId === 'none' ? !t.assigneeId : t.assigneeId === q.assigneeId))
    && (!q.priority || t.priority === q.priority)
    && (!text || `${t.number} ${t.subject} ${t.requesterEmail} ${t.requesterName}`.toLowerCase().includes(text)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(list.map((t) => ticketOut(t)));
});

app.get('/api/tickets/:id', requireAuth, requirePerm('tickets', 'view'), (req, res) => {
  const t = db.find('tickets', req.params.id);
  if (!t || !visibleTicket(req.user, t)) return bad(res, 'Ticket not found', 404);
  const time = db.where('timesheets', (e) => e.ticketId === t.id).map(entryOut);
  res.json({ ...ticketOut(t, true), timeEntries: time });
});

app.post('/api/tickets', requireAuth, requirePerm('tickets', 'create'), (req, res) => {
  const b = req.body || {};
  if (!b.subject) return bad(res, 'Subject is required');
  if (b.assigneeId && !can(req.user, 'tickets', 'assign')) b.assigneeId = null;
  const t = tickets.create(pick(b, ['subject', 'description', 'category', 'priority', 'assigneeId', 'projectId', 'requesterName', 'requesterEmail']), req.user, { source: 'web' });
  res.json(ticketOut(t));
});

app.put('/api/tickets/:id', requireAuth, requirePerm('tickets', 'edit'), (req, res) => {
  const t = db.find('tickets', req.params.id);
  if (!t || !visibleTicket(req.user, t)) return bad(res, 'Ticket not found', 404);
  const b = { ...req.body };
  if ('assigneeId' in b && b.assigneeId !== t.assigneeId && !can(req.user, 'tickets', 'assign')) {
    // Engineers may only pick up an unassigned ticket themselves.
    if (!(b.assigneeId === req.user.id && !t.assigneeId)) return bad(res, 'You do not have permission to assign tickets', 403);
  }
  tickets.update(t, b, req.user);
  res.json(ticketOut(t, true));
});

app.delete('/api/tickets/:id', requireAuth, requirePerm('tickets', 'delete'), (req, res) => {
  if (!db.remove('tickets', req.params.id)) return bad(res, 'Ticket not found', 404);
  res.json({ ok: true });
});

app.post('/api/tickets/:id/comments', requireAuth, requirePerm('tickets', 'view'), (req, res) => {
  const t = db.find('tickets', req.params.id);
  if (!t || !visibleTicket(req.user, t)) return bad(res, 'Ticket not found', 404);
  if (!req.body?.text) return bad(res, 'Comment text is required');
  tickets.addComment(t, req.body.text, req.user, { internal: !!req.body.internal });
  res.json(ticketOut(t, true));
});

// ---------- forms ----------
const FORM_FIELDS = ['name', 'description', 'fields', 'public', 'active', 'category', 'defaultPriority', 'defaultAssigneeId', 'projectId'];

function cleanFields(fields) {
  return (Array.isArray(fields) ? fields : []).filter((f) => f && f.label).map((f, i) => ({
    key: String(f.key || f.label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `field_${i}`,
    label: String(f.label), type: ['text', 'email', 'textarea', 'select', 'number', 'date', 'checkbox'].includes(f.type) ? f.type : 'text',
    required: !!f.required, options: f.type === 'select' ? (Array.isArray(f.options) ? f.options : String(f.options || '').split(',')).map((o) => String(o).trim()).filter(Boolean) : undefined,
  }));
}

app.get('/api/forms', requireAuth, requirePerm('forms', 'view'), (req, res) => {
  res.json(db.all('forms').map((f) => ({ ...f, submissions: db.where('tickets', (t) => t.formId === f.id).length })));
});
app.post('/api/forms', requireAuth, requirePerm('forms', 'create'), (req, res) => {
  const b = req.body || {};
  if (!b.name) return bad(res, 'Form name is required');
  res.json(db.insert('forms', { active: true, public: true, ...pick(b, FORM_FIELDS), fields: cleanFields(b.fields) }));
});
app.put('/api/forms/:id', requireAuth, requirePerm('forms', 'edit'), (req, res) => {
  const f = db.find('forms', req.params.id);
  if (!f) return bad(res, 'Form not found', 404);
  const patch = pick(req.body || {}, FORM_FIELDS);
  if (patch.fields) patch.fields = cleanFields(patch.fields);
  res.json(db.update('forms', f.id, patch));
});
app.delete('/api/forms/:id', requireAuth, requirePerm('forms', 'delete'), (req, res) => {
  if (!db.remove('forms', req.params.id)) return bad(res, 'Form not found', 404);
  res.json({ ok: true });
});

// Internal submission (logged-in user picks a form from "New ticket").
app.post('/api/forms/:id/submit', requireAuth, requirePerm('tickets', 'create'), (req, res) => {
  const f = db.find('forms', req.params.id);
  if (!f || !f.active) return bad(res, 'Form not available', 404);
  const err = validateForm(f, req.body || {});
  if (err) return bad(res, err);
  res.json(ticketOut(tickets.fromForm(f, req.body, req.user)));
});

function validateForm(f, values) {
  for (const fld of f.fields) {
    const v = values[fld.key];
    if (fld.required && (v === undefined || v === null || String(v).trim() === '' || v === false)) return `${fld.label} is required`;
    if (fld.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `${fld.label} must be a valid email`;
  }
  return null;
}

// Public self-service portal (no login) for public forms.
app.get('/api/public/forms/:id', (req, res) => {
  const f = db.find('forms', req.params.id);
  if (!f || !f.active || !f.public) return bad(res, 'Form not available', 404);
  res.json({ id: f.id, name: f.name, description: f.description, fields: f.fields, company: settings().companyName });
});
const publicHits = new Map();
app.post('/api/public/forms/:id', (req, res) => {
  const f = db.find('forms', req.params.id);
  if (!f || !f.active || !f.public) return bad(res, 'Form not available', 404);
  const h = publicHits.get(req.ip) || [];
  const recent = h.filter((x) => Date.now() - x < 60000);
  if (recent.length >= 10) return bad(res, 'Too many submissions, please wait a minute', 429);
  publicHits.set(req.ip, [...recent, Date.now()]);
  const values = {};
  for (const fld of f.fields) values[fld.key] = req.body?.[fld.key];
  const err = validateForm(f, values);
  if (err) return bad(res, err);
  const t = tickets.fromForm(f, values, null);
  res.json({ ok: true, number: t.number });
});

// ---------- email channels ----------
const EMAIL_FIELDS = ['name', 'direction', 'provider', 'host', 'port', 'secure', 'authType', 'username', 'password', 'fromName', 'fromAddress', 'folder', 'pollMinutes', 'enabled', 'isDefault', 'defaultFormId', 'defaultAssigneeId', 'allowSelfSigned'];

app.get('/api/email-accounts', requireAuth, requirePerm('email', 'view'), (req, res) => {
  res.json({ accounts: db.all('emailAccounts').map(maskAccount), log: db.all('emailLog').slice(0, 100) });
});
app.post('/api/email-accounts', requireAuth, requirePerm('email', 'create'), (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.host || !['inbound', 'outbound'].includes(b.direction)) return bad(res, 'Name, direction and server host are required');
  if (b.isDefault) for (const a of db.all('emailAccounts')) if (a.direction === b.direction) a.isDefault = false;
  res.json(maskAccount(db.insert('emailAccounts', { enabled: true, ...pick(b, EMAIL_FIELDS) })));
});
app.put('/api/email-accounts/:id', requireAuth, requirePerm('email', 'edit'), (req, res) => {
  const a = db.find('emailAccounts', req.params.id);
  if (!a) return bad(res, 'Email channel not found', 404);
  const patch = pick(req.body || {}, EMAIL_FIELDS);
  if (patch.password === '********') delete patch.password;
  if (patch.isDefault) for (const x of db.all('emailAccounts')) if (x.direction === a.direction) x.isDefault = false;
  res.json(maskAccount(db.update('emailAccounts', a.id, patch)));
});
app.delete('/api/email-accounts/:id', requireAuth, requirePerm('email', 'delete'), (req, res) => {
  if (!db.remove('emailAccounts', req.params.id)) return bad(res, 'Email channel not found', 404);
  res.json({ ok: true });
});
app.post('/api/email-accounts/:id/test', requireAuth, requirePerm('email', 'edit'), async (req, res) => {
  const a = db.find('emailAccounts', req.params.id);
  if (!a) return bad(res, 'Email channel not found', 404);
  try { res.json({ ok: true, message: await email.testAccount(a) }); } catch (e) { bad(res, `Connection failed: ${e.message}`); }
});
app.post('/api/email-accounts/:id/poll', requireAuth, requirePerm('email', 'edit'), async (req, res) => {
  const a = db.find('emailAccounts', req.params.id);
  if (!a || a.direction !== 'inbound') return bad(res, 'Inbound channel not found', 404);
  try {
    const r = await email.pollInbound(a);
    res.json({ ok: true, message: `${r.created} new ticket(s), ${r.updated} reply(ies) processed` });
  } catch (e) {
    db.update('emailAccounts', a.id, { lastError: e.message });
    bad(res, `Fetch failed: ${e.message}`);
  }
});
app.post('/api/email-accounts/:id/send-test', requireAuth, requirePerm('email', 'edit'), async (req, res) => {
  const a = db.find('emailAccounts', req.params.id);
  if (!a || a.direction !== 'outbound') return bad(res, 'Outbound channel not found', 404);
  await email.sendMail({ accountId: a.id, to: req.body?.to || req.user.email, subject: 'Test email from OpsTrack', text: 'Your outbound email channel is working.' });
  const last = db.all('emailLog')[0];
  if (last?.status === 'sent') return res.json({ ok: true, message: `Test email sent to ${last.to}` });
  bad(res, `Send failed: ${last?.detail || 'unknown error'}`);
});

// ---------- workflows ----------
const WF_FIELDS = ['name', 'description', 'enabled', 'trigger', 'formId', 'emailAccountId', 'matchType', 'conditions', 'actions', 'schedule', 'order'];

app.get('/api/workflows', requireAuth, requirePerm('workflows', 'view'), (req, res) => {
  res.json({ workflows: db.all('workflows'), logs: db.all('workflowLogs').slice(0, 100) });
});
app.post('/api/workflows', requireAuth, requirePerm('workflows', 'create'), (req, res) => {
  const b = req.body || {};
  if (!b.name || !workflow.TRIGGERS[b.trigger]) return bad(res, 'Name and a valid trigger are required');
  res.json(db.insert('workflows', { enabled: true, matchType: 'all', conditions: [], actions: [], runCount: 0, ...pick(b, WF_FIELDS) }));
});
app.put('/api/workflows/:id', requireAuth, requirePerm('workflows', 'edit'), (req, res) => {
  const w = db.find('workflows', req.params.id);
  if (!w) return bad(res, 'Workflow not found', 404);
  res.json(db.update('workflows', w.id, pick(req.body || {}, WF_FIELDS)));
});
app.delete('/api/workflows/:id', requireAuth, requirePerm('workflows', 'delete'), (req, res) => {
  if (!db.remove('workflows', req.params.id)) return bad(res, 'Workflow not found', 404);
  res.json({ ok: true });
});
app.post('/api/workflows/:id/run', requireAuth, requirePerm('workflows', 'edit'), (req, res) => {
  const w = db.find('workflows', req.params.id);
  if (!w) return bad(res, 'Workflow not found', 404);
  const t = req.body?.ticketId ? db.find('tickets', req.body.ticketId) : null;
  workflow.runOne(w, t, { trigger: 'manual' });
  res.json({ ok: true, log: db.all('workflowLogs')[0] });
});

// ---------- settings ----------
app.get('/api/settings', requireAuth, requirePerm('settings', 'view'), (req, res) => res.json(settings()));
app.put('/api/settings', requireAuth, requirePerm('settings', 'edit'), (req, res) => {
  const b = req.body || {};
  const listKeys = ['activityCategories', 'ticketCategories', 'ticketPriorities', 'ticketStatuses', 'closedStatuses'];
  const patch = pick(b, ['companyName', 'ticketPrefix', 'workloadGreenMax', 'dailyTargetHours', 'slaHours', 'notifyOnAssign', 'notifyRequesterOnCreate', ...listKeys]);
  for (const k of listKeys) if (k in patch) patch[k] = (Array.isArray(patch[k]) ? patch[k] : String(patch[k]).split(',')).map((x) => String(x).trim()).filter(Boolean);
  if (patch.ticketPrefix) patch.ticketPrefix = patch.ticketPrefix.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'INC';
  Object.assign(db.state.settings, patch);
  db.save();
  res.json(settings());
});

// ---------- dashboard & reports ----------
const dayStr = (d) => d.toISOString().slice(0, 10);

app.get('/api/dashboard', requireAuth, requirePerm('dashboard', 'view'), (req, res) => {
  const q = { ...req.query };
  const today = dayStr(new Date());
  if (!q.from) { const d = new Date(); d.setDate(d.getDate() - 13); q.from = dayStr(d); }
  if (!q.to) q.to = today;
  const entries = filterEntries(req.user, q);
  const vis = visibleUserIds(req.user);
  const sum = (arr) => arr.reduce((s, e) => s + e.minutes, 0);
  const group = (keyFn) => {
    const m = new Map();
    for (const e of entries) { const k = keyFn(e); m.set(k, (m.get(k) || 0) + e.minutes); }
    return m;
  };

  const byProject = [...group((e) => e.projectId || '__none')].map(([id, minutes]) => ({
    id, name: id === '__none' ? 'No project (support / other)' : (db.find('projects', id)?.name || 'Deleted project'), minutes,
  })).sort((a, b) => b.minutes - a.minutes);
  const byCategory = [...group((e) => e.category)].map(([name, minutes]) => ({ name, minutes })).sort((a, b) => b.minutes - a.minutes);
  const users = db.where('users', (u) => u.active && (!vis || vis.has(u.id)) && (!q.userId || u.id === q.userId));
  const byUser = users.map((u) => {
    const mine = entries.filter((e) => e.userId === u.id);
    return {
      id: u.id, name: u.name, minutes: sum(mine), online: auth.isOnline(u),
      projectMinutes: sum(mine.filter((e) => e.projectId)), supportMinutes: sum(mine.filter((e) => e.category === 'Customer Support')),
      todayMinutes: sum(db.where('timesheets', (e) => e.userId === u.id && e.date === today)),
      workload: tickets.workload(u.id),
    };
  }).sort((a, b) => b.minutes - a.minutes);

  const daily = [];
  for (let d = new Date(`${q.from}T00:00:00Z`); dayStr(d) <= q.to && daily.length < 370; d.setUTCDate(d.getUTCDate() + 1)) {
    const ds = dayStr(d);
    const de = entries.filter((e) => e.date === ds);
    const cats = {};
    for (const e of de) cats[e.category] = (cats[e.category] || 0) + e.minutes;
    daily.push({ date: ds, minutes: sum(de), categories: cats });
  }

  const tv = db.where('tickets', (t) => visibleTicket(req.user, t) && (!q.userId || t.assigneeId === q.userId) && (!q.projectId || t.projectId === q.projectId));
  const inRange = (iso) => iso && iso.slice(0, 10) >= q.from && iso.slice(0, 10) <= q.to;
  const countBy = (arr, k) => arr.reduce((m, t) => { m[t[k]] = (m[t[k]] || 0) + 1; return m; }, {});
  const open = tv.filter((t) => !tickets.isClosed(t));
  const resolved = tv.filter((t) => inRange(t.resolvedAt));
  const avgRes = resolved.length ? resolved.reduce((s, t) => s + (new Date(t.resolvedAt) - new Date(t.createdAt)), 0) / resolved.length / 3600000 : 0;

  // Project x engineer effort matrix (top projects)
  const matrix = byProject.filter((p) => p.id !== '__none').slice(0, 6).map((p) => ({
    project: p.name, total: p.minutes,
    engineers: [...entries.filter((e) => e.projectId === p.id).reduce((m, e) => m.set(e.userId, (m.get(e.userId) || 0) + e.minutes), new Map())]
      .map(([uidv, minutes]) => ({ name: db.find('users', uidv)?.name || '—', minutes })).sort((a, b) => b.minutes - a.minutes),
  }));

  res.json({
    range: { from: q.from, to: q.to },
    kpis: {
      totalMinutes: sum(entries), todayMinutes: sum(entries.filter((e) => e.date === today)),
      projectMinutes: sum(entries.filter((e) => e.projectId)), supportMinutes: sum(entries.filter((e) => e.category === 'Customer Support')),
      entries: entries.length, activeProjects: db.where('projects', (p) => p.status === 'Active').length,
      openTickets: open.length, overdueTickets: open.filter((t) => t.dueAt && new Date(t.dueAt) < new Date()).length,
      createdTickets: tv.filter((t) => inRange(t.createdAt)).length, resolvedTickets: resolved.length,
      avgResolutionHours: Math.round(avgRes * 10) / 10, onlineUsers: users.filter((u) => auth.isOnline(u)).length,
      totalUsers: users.length, notLoggedToday: byUser.filter((u) => u.todayMinutes === 0).length,
    },
    byProject, byCategory, byUser, daily, matrix,
    ticketsByStatus: countBy(open, 'status'), ticketsByPriority: countBy(open, 'priority'),
    ticketsBySource: countBy(tv.filter((t) => inRange(t.createdAt)), 'source'),
    recent: entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8).map(entryOut),
    dailyTargetMinutes: (Number(settings().dailyTargetHours) || 8) * 60,
  });
});

app.get('/api/reports/effort', requireAuth, requirePerm('reports', 'view'), (req, res) => {
  const entries = filterEntries(req.user, req.query).map(entryOut);
  const key = (e) => `${e.projectName || 'No project'}|${e.userId}`;
  const groups = new Map();
  for (const e of entries) {
    const k = key(e);
    if (!groups.has(k)) groups.set(k, { project: e.projectName || 'No project', projectCode: e.projectCode || '', user: e.userName, minutes: 0, days: new Set(), activities: new Map() });
    const g = groups.get(k);
    g.minutes += e.minutes;
    g.days.add(e.date);
    g.activities.set(e.category, (g.activities.get(e.category) || 0) + e.minutes);
  }
  const summary = [...groups.values()].map((g) => ({
    ...g, days: g.days.size, activities: [...g.activities].map(([name, minutes]) => ({ name, minutes })),
  })).sort((a, b) => a.project.localeCompare(b.project) || b.minutes - a.minutes);
  res.json({ summary, entries });
});

app.get('/api/audit', requireAuth, requirePerm('settings', 'view'), (req, res) => {
  res.json(db.all('audit').slice(0, 200).map((a) => ({ ...a, userName: db.find('users', a.userId)?.name })));
});

// ---------- static web app ----------
app.use('/vendor/chart.js', express.static(path.join(__dirname, 'node_modules/chart.js/dist')));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/portal/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'portal.html')));
app.use('/api', (req, res) => bad(res, 'Not found', 404));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = Number(process.env.PORT) || 3000;
if (require.main === module) {
  db.load().then(() => {
    seed();
    app.listen(PORT, () => {
      console.log(`OpsTrack running at http://localhost:${PORT} (storage: ${process.env.DATABASE_URL ? 'PostgreSQL' : 'file'})`);
      workflow.startScheduler();
      email.startInboundPolling();
    });
  }).catch((e) => {
    console.error('Could not load data:', e.message);
    process.exit(1);
  });
}

module.exports = app;
