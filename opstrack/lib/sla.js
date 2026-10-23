// ITIL service levels.
// - Priority comes from Impact × Urgency (the ITIL priority matrix) and is shown as P1–P4.
// - Each priority has a response target and a resolution target, measured either around
//   the clock (24×7) or in business hours (working days, hours and holidays in a time zone).
// - The resolution clock pauses while a ticket is in a "pending" status (On Hold).
// - A background check warns before a target is missed and escalates when it is breached.
const db = require('./db');

const LEVELS = ['High', 'Medium', 'Low'];
const IMPACT = { High: 'Organisation, a site or many users', Medium: 'A department or several users', Low: 'One user' };
const URGENCY = { High: 'Work has stopped; no workaround', Medium: 'Work is degraded; a workaround exists', Low: 'Can wait; little effect on work' };
const RESOLUTION_CODES = ['Fixed', 'Workaround provided', 'Known error', 'Duplicate', 'Not reproducible', 'User guidance given', 'Cancelled by requester'];
const HOLD_REASONS = ['Awaiting requester', 'Awaiting third party / vendor', 'Awaiting change', 'Scheduled for later'];

function serverTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

// Common ITIL targets (minutes). Admins can change them under Settings → SLA & Priority.
const DEFAULTS = {
  matrix: {
    High: { High: 'Critical', Medium: 'High', Low: 'Medium' },
    Medium: { High: 'High', Medium: 'Medium', Low: 'Low' },
    Low: { High: 'Medium', Medium: 'Low', Low: 'Low' },
  },
  policies: {
    Critical: { response: 15, resolution: 240, hours: '24x7' },
    High: { response: 30, resolution: 480, hours: '24x7' },
    Medium: { response: 120, resolution: 960, hours: 'business' },
    Low: { response: 480, resolution: 2400, hours: 'business' },
  },
  businessHours: { timezone: serverTimeZone(), start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] },
  holidays: [], // 'YYYY-MM-DD'
  pauseStatuses: ['On Hold'],
  warnAt: 75, // % of the target used before a warning goes out
  escalateToManager: true, // breaches also go to the assignee's reporting manager
  requireResolution: true, // resolution code + notes before a ticket is resolved or closed
  autoCloseDays: 3, // resolved tickets close after this many days without a reply (0 = never)
};

const settings = () => db.state.settings;
const cfg = () => {
  const s = settings().sla || {};
  return { ...DEFAULTS, ...s, businessHours: { ...DEFAULTS.businessHours, ...(s.businessHours || {}) } };
};

// P1 is the most urgent priority. The priority list is ordered lowest → highest.
function code(priority) {
  const list = settings().ticketPriorities || [];
  const i = list.indexOf(priority);
  return i < 0 ? '' : `P${list.length - i}`;
}
const label = (priority) => (code(priority) ? `${code(priority)} – ${priority}` : String(priority || ''));

// Accepts "P1", "p2", "Critical" … and returns the priority name, or null.
function normalizePriority(v) {
  const list = settings().ticketPriorities || [];
  if (list.includes(v)) return v;
  const m = String(v || '').trim().match(/^p(\d+)$/i);
  if (m) return list[list.length - Number(m[1])] || null;
  return list.find((p) => p.toLowerCase() === String(v || '').trim().toLowerCase()) || null;
}

// Reads an impact / urgency answer from a form or email ("High", "Whole company", "Work has stopped" …).
const WORDS = {
  impact: [[/compan|organi[sz]ation|many|everyone|all users|site|business/i, 'High'], [/team|department|several|multiple|group/i, 'Medium'], [/single|one user|just me|individual|only me/i, 'Low']],
  urgency: [[/stopp|down|block|cannot work|can't work|urgent|outage/i, 'High'], [/degrad|slow|workaround|partial/i, 'Medium'], [/wait|minor|low|no rush|whenever/i, 'Low']],
};
function levelFrom(kind, v) {
  const s = String(v ?? '').trim();
  const m = s.match(/^(high|medium|low)\b/i);
  if (m) return m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
  for (const [re, level] of WORDS[kind] || []) if (re.test(s)) return level;
  return null;
}

function priorityFor(impact, urgency) {
  return cfg().matrix?.[impact]?.[urgency] || null;
}

// Best matching impact / urgency for a priority set directly (e.g. by email or a workflow).
function levelsFor(priority) {
  const m = cfg().matrix;
  for (const i of LEVELS) for (const u of LEVELS) if (i === u && m[i]?.[u] === priority) return { impact: i, urgency: u };
  for (const i of LEVELS) for (const u of LEVELS) if (m[i]?.[u] === priority) return { impact: i, urgency: u };
  return { impact: 'Medium', urgency: 'Medium' };
}

function policy(priority) {
  const p = cfg().policies;
  return { response: 240, resolution: 1440, hours: '24x7', ...(p.Medium || {}), ...(p[priority] || {}) };
}

// ---------- business-time arithmetic (time-zone aware) ----------
const fmts = new Map();
function fmt(tz) {
  if (!fmts.has(tz)) {
    let f;
    try { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }); } catch { f = fmt('UTC'); }
    fmts.set(tz, f);
  }
  return fmts.get(tz);
}
function parts(ms, tz) {
  const o = {};
  for (const p of fmt(tz).formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return o;
}
function offset(ms, tz) {
  const p = parts(ms, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}
// UTC milliseconds of a wall-clock time (minutes after midnight) on a local date.
function zoned(y, m, d, minutes, tz) {
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const first = guess - offset(guess, tz);
  return guess - offset(first, tz);
}
const hm = (s) => { const [h, m] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

// Working windows [start, end] (ms) from `fromMs` onwards.
function* windows(fromMs, c) {
  const bh = c.businessHours;
  const tz = bh.timezone || 'UTC';
  const days = (bh.days || []).map(Number);
  const start = hm(bh.start); const end = hm(bh.end);
  if (!days.length || end <= start) return;
  const holidays = new Set(c.holidays || []);
  const p = parts(fromMs, tz);
  for (let i = 0; i < 1500; i++) {
    const day = new Date(Date.UTC(p.year, p.month - 1, p.day + i));
    const iso = day.toISOString().slice(0, 10);
    if (!days.includes(day.getUTCDay()) || holidays.has(iso)) continue;
    const y = day.getUTCFullYear(); const mo = day.getUTCMonth() + 1; const d = day.getUTCDate();
    const s = zoned(y, mo, d, start, tz); const e = zoned(y, mo, d, end, tz);
    if (e > fromMs) yield [Math.max(s, fromMs), e];
  }
}

function addTime(fromMs, minutes, mode, c = cfg()) {
  const ms = minutes * 60000;
  if (mode !== 'business') return fromMs + ms;
  let left = ms;
  for (const [s, e] of windows(fromMs, c)) {
    if (left <= e - s) return s + left;
    left -= e - s;
  }
  return fromMs + ms; // no working days configured
}

function elapsed(fromMs, toMs, mode, c = cfg()) {
  if (toMs <= fromMs) return 0;
  if (mode !== 'business') return (toMs - fromMs) / 60000;
  let total = 0;
  for (const [s, e] of windows(fromMs, c)) {
    if (s >= toMs) break;
    total += Math.min(e, toMs) - s;
  }
  return total / 60000;
}

// ---------- ticket lifecycle ----------
const isPause = (status) => (cfg().pauseStatuses || []).includes(status);
const isClosed = (t) => settings().closedStatuses.includes(t.status);
const ms = (iso) => new Date(iso).getTime();
const iso = (n) => new Date(n).toISOString();

// (Re)calculates both deadlines from the ticket's creation time.
function apply(t) {
  const p = policy(t.priority);
  const c = cfg();
  const created = ms(t.createdAt);
  t.slaPausedMinutes = t.slaPausedMinutes || 0;
  t.responseDueAt = iso(addTime(created, p.response, p.hours, c));
  t.dueAt = iso(addTime(created, p.resolution + t.slaPausedMinutes, p.hours, c));
}

// Called by the ticket service after any change. Returns history lines to record.
function onChange(t, before) {
  const notes = [];
  const now = Date.now();
  if (before && before.status !== t.status) {
    // Leaving a pending status (or closing while pending) adds the paused time to the deadline.
    if (t.slaPausedAt && (!isPause(t.status) || isClosed(t))) {
      const p = policy(t.priority);
      const paused = Math.round(elapsed(ms(t.slaPausedAt), now, p.hours));
      t.slaPausedMinutes = (t.slaPausedMinutes || 0) + paused;
      t.slaPausedAt = null;
      notes.push(`SLA clock resumed (paused ${fmtMinutes(paused)})`);
    } else if (isPause(t.status) && !isClosed(t) && !t.slaPausedAt) {
      t.slaPausedAt = iso(now);
      notes.push('SLA clock paused');
    }
    // ITIL: moving a ticket on from New / Open counts as the first response.
    if (!t.firstResponseAt && !['New', 'Open'].includes(t.status)) t.firstResponseAt = iso(now);
    if (isClosed(before) && !isClosed(t)) {
      t.reopenCount = (t.reopenCount || 0) + 1;
      notes.push('Ticket reopened');
      t.resolutionCode = null;
      t.resolutionNotes = '';
    }
    if (!isPause(t.status)) t.holdReason = null;
  }
  if (!before || before.priority !== t.priority) {
    apply(t);
    t.slaAlerts = {};
  }
  return notes;
}

function responded(t, at = db.now()) {
  if (!t.firstResponseAt) t.firstResponseAt = at;
}

function fmtMinutes(m) {
  m = Math.round(m);
  if (m < 60) return `${m}m`;
  if (m < 1440 || m % 1440) return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`;
  return `${m / 1440}d`;
}

// SLA state for display and reporting.
function status(t, now = Date.now()) {
  const p = policy(t.priority);
  const c = cfg();
  const created = ms(t.createdAt);
  if (!t.responseDueAt || !t.dueAt) apply(t);
  const pausedNow = t.slaPausedAt ? elapsed(ms(t.slaPausedAt), now, p.hours, c) : 0;
  const clock = (target, dueAt, doneAt, paused, pausable) => {
    const due = ms(dueAt);
    const out = { target, targetText: fmtMinutes(target), dueAt, doneAt: doneAt || null };
    if (doneAt) return { ...out, state: ms(doneAt) <= due ? 'met' : 'breached', pct: 100 };
    if (pausable && t.slaPausedAt) {
      const used = elapsed(created, ms(t.slaPausedAt), p.hours, c) - (t.slaPausedMinutes || 0);
      return { ...out, state: 'paused', pct: Math.max(0, Math.min(100, Math.round((used / target) * 100))) };
    }
    if (now > due) return { ...out, state: 'breached', pct: 100 };
    const used = elapsed(created, now, p.hours, c) - (pausable ? paused : 0);
    const pct = Math.max(0, Math.min(100, Math.round((used / target) * 100)));
    return { ...out, state: pct >= c.warnAt ? 'at_risk' : 'on_track', pct, leftMinutes: Math.max(0, Math.round(target - used)) };
  };
  return {
    code: code(t.priority), label: label(t.priority), hours: p.hours,
    paused: !!t.slaPausedAt, pausedMinutes: Math.round((t.slaPausedMinutes || 0) + pausedNow),
    response: clock(p.response, t.responseDueAt, t.firstResponseAt, 0, false),
    resolution: clock(p.resolution, t.dueAt, isClosed(t) ? t.resolvedAt : null, t.slaPausedMinutes || 0, true),
  };
}

// ---------- warnings, breaches and auto-close ----------
const TARGET_NAME = { response: 'response', resolution: 'resolution' };

// Marks warnings/breaches that already happened, so an upgrade or demo data doesn't send a flood.
function markCurrent(t) {
  if (isClosed(t)) return;
  const st = status(t);
  t.slaAlerts = t.slaAlerts || {};
  for (const k of ['response', 'resolution']) {
    if (st[k].state === 'breached') t.slaAlerts[`${k}Breach`] = t.slaAlerts[`${k}Warn`] = true;
    if (st[k].state === 'at_risk') t.slaAlerts[`${k}Warn`] = true;
  }
}

function check(now = Date.now()) {
  const c = cfg();
  let changed = false;
  for (const t of db.all('tickets')) {
    if (isClosed(t)) continue;
    const st = status(t, now);
    t.slaAlerts = t.slaAlerts || {};
    for (const k of ['response', 'resolution']) {
      const s = st[k].state;
      if (s === 'breached' && !t.slaAlerts[`${k}Breach`]) {
        t.slaAlerts[`${k}Breach`] = t.slaAlerts[`${k}Warn`] = true;
        fire(t, 'breached', k, st);
        changed = true;
      } else if (s === 'at_risk' && !t.slaAlerts[`${k}Warn`]) {
        t.slaAlerts[`${k}Warn`] = true;
        fire(t, 'warning', k, st);
        changed = true;
      }
    }
  }
  // ITIL closure: resolved tickets close automatically when the requester doesn't come back.
  const days = Number(c.autoCloseDays) || 0;
  if (days > 0 && settings().ticketStatuses.includes('Closed')) {
    for (const t of db.where('tickets', (x) => x.status === 'Resolved' && x.resolvedAt && now - ms(x.resolvedAt) > days * 86400000)) {
      require('./tickets').update(t, { status: 'Closed' }, { name: 'OpsTrack (auto-close)' });
      changed = true;
    }
  }
  if (changed) db.save();
}

function fire(t, kind, target, st) {
  const clock = st[target];
  const text = kind === 'breached'
    ? `SLA breached: ${TARGET_NAME[target]} target of ${clock.targetText} for ${st.label} missed`
    : `SLA warning: ${clock.pct}% of the ${TARGET_NAME[target]} target (${clock.targetText}) used`;
  t.comments = t.comments || [];
  t.comments.push({ id: db.uid(), at: db.now(), system: true, authorName: 'SLA', text: `${text}.` });
  require('./alerts').slaEvent(t, kind, target, text);
  require('./notify').ticketEvent(`sla.${kind}`, t);
  require('./workflow').run(`sla.${kind}`, t, { slaTarget: target });
}

let timer = null;
function startChecker() {
  clearInterval(timer);
  timer = setInterval(() => { try { check(); } catch (e) { console.error('SLA check failed:', e.message); } }, 60000);
  timer.unref?.();
}

// One-time upgrade of older databases: hours-to-resolve → full SLA policy, deadlines on every ticket.
function migrate() {
  const s = settings();
  if (!s.sla) s.sla = JSON.parse(JSON.stringify(DEFAULTS));
  if (s.slaHours) {
    // Keep resolution times an admin had customised in the old "hours to resolve" setting.
    const old = s.slaHours;
    const oldDefault = { Low: 72, Medium: 24, High: 8, Critical: 4 };
    for (const [p, h] of Object.entries(old)) {
      if (Number(h) && Number(h) !== oldDefault[p]) s.sla.policies[p] = { ...policy(p), resolution: Number(h) * 60, hours: '24x7' };
    }
  }
  delete s.slaHours;
  for (const t of db.all('tickets')) {
    if (t.responseDueAt && t.impact) continue;
    if (!t.impact || !t.urgency) Object.assign(t, levelsFor(t.priority));
    if (!t.firstResponseAt) {
      const reply = (t.comments || []).find((x) => !x.system && !x.internal && x.authorId);
      if (reply) t.firstResponseAt = reply.at;
      else if (!['New', 'Open'].includes(t.status)) t.firstResponseAt = t.updatedAt;
    }
    if (isPause(t.status) && !isClosed(t) && !t.slaPausedAt) t.slaPausedAt = t.updatedAt;
    apply(t);
    markCurrent(t);
  }
}

module.exports = {
  DEFAULTS, LEVELS, IMPACT, URGENCY, RESOLUTION_CODES, HOLD_REASONS,
  cfg, code, label, normalizePriority, levelFrom, priorityFor, levelsFor, policy, addTime, elapsed,
  apply, onChange, responded, status, check, markCurrent, startChecker, migrate, fmtMinutes,
};
