// ITIL Problem Management: find and remove the underlying cause of incidents.
// A problem links the incidents it causes, records the root cause and a workaround
// (published as a known error), and is resolved by a permanent fix – often a change.
const db = require('./db');
const sla = require('./sla');

const STATUSES = ['New', 'Under Investigation', 'Root Cause Identified', 'Known Error', 'Resolved', 'Closed'];
const CLOSED = ['Resolved', 'Closed'];
const FIELDS = ['title', 'description', 'category', 'impact', 'urgency', 'priority', 'status', 'assigneeId', 'rootCause', 'workaround', 'resolution', 'knownError', 'projectId'];
const LABELS = { assigneeId: 'Owner', rootCause: 'Root cause', knownError: 'Known error', projectId: 'Project' };

const isClosed = (p) => CLOSED.includes(p.status);
const userName = (id) => db.find('users', id)?.name || 'Unassigned';

function history(rec, text, actor) {
  rec.comments = rec.comments || [];
  rec.comments.push({ id: db.uid(), at: db.now(), system: true, authorName: actor?.name || 'System', text });
}

function create(data, actor) {
  const s = db.state.settings;
  const impact = sla.LEVELS.includes(data.impact) ? data.impact : 'Medium';
  const urgency = sla.LEVELS.includes(data.urgency) ? data.urgency : 'Medium';
  const p = db.insert('problems', {
    number: `${s.problemPrefix || 'PRB'}-${db.nextNumber('problem')}`,
    title: String(data.title || '(untitled problem)').slice(0, 300),
    description: String(data.description || ''),
    category: data.category || s.ticketCategories[0],
    impact, urgency,
    priority: sla.normalizePriority(data.priority) || sla.priorityFor(impact, urgency) || 'Medium',
    status: 'New',
    assigneeId: data.assigneeId || null,
    projectId: data.projectId || null,
    rootCause: '', workaround: '', resolution: '', knownError: false,
    incidentIds: [], changeIds: [],
    createdById: actor?.id || null, resolvedAt: null, closedAt: null, comments: [],
  });
  history(p, 'Problem logged.', actor);
  for (const id of data.incidentIds || []) link(p, db.find('tickets', id), actor, { quiet: true });
  if (p.assigneeId) require('./alerts').recordAssigned(p, actor, 'problem');
  db.save();
  return p;
}

function update(p, patch, actor) {
  const changes = [];
  const before = { ...p };
  for (const k of FIELDS) {
    if (!(k in patch) || patch[k] === undefined) continue;
    let v = patch[k] === '' ? null : patch[k];
    if (k === 'knownError') v = v === true || v === 'true';
    if (k === 'priority') { v = sla.normalizePriority(v); if (!v) continue; }
    if ((k === 'impact' || k === 'urgency') && !sla.LEVELS.includes(v)) continue;
    if (k === 'status' && !STATUSES.includes(v)) continue;
    if (['rootCause', 'workaround', 'resolution', 'description'].includes(k)) v = String(v || '');
    if ((p[k] ?? null) === v || (typeof v === 'string' && (p[k] || '') === v)) continue;
    p[k] = v;
    if (k === 'assigneeId') changes.push(`Owner: ${userName(before.assigneeId)} → ${userName(v)}`);
    else if (k === 'projectId') changes.push(`Project: ${db.find('projects', v)?.name || 'None'}`);
    else if (k === 'priority') changes.push(`Priority: ${sla.label(before.priority)} → ${sla.label(v)}`);
    else if (k === 'knownError') changes.push(v ? 'Published as a known error' : 'Removed from known errors');
    else if (['rootCause', 'workaround', 'resolution', 'description'].includes(k)) changes.push(`${LABELS[k] || k[0].toUpperCase() + k.slice(1)}: ${v.slice(0, 200) || '—'}`);
    else changes.push(`${LABELS[k] || k[0].toUpperCase() + k.slice(1)}: ${before[k] ?? '—'} → ${v ?? '—'}`);
  }
  if ((before.impact !== p.impact || before.urgency !== p.urgency) && before.priority === p.priority) {
    const np = sla.priorityFor(p.impact, p.urgency);
    if (np && np !== p.priority) { p.priority = np; changes.push(`Priority: ${sla.label(before.priority)} → ${sla.label(np)} (impact × urgency)`); }
  }
  // ITIL: a problem with a documented workaround becomes a known error.
  if (p.status === 'Known Error' && !p.knownError && p.workaround) { p.knownError = true; changes.push('Published as a known error'); }
  if (!changes.length) return p;
  if (isClosed(p) && !p.resolvedAt) p.resolvedAt = db.now();
  if (!isClosed(p)) p.resolvedAt = null;
  p.closedAt = p.status === 'Closed' ? (p.closedAt || db.now()) : null;
  p.updatedAt = db.now();
  history(p, changes.join(' · '), actor);
  if (before.assigneeId !== p.assigneeId && p.assigneeId) require('./alerts').recordAssigned(p, actor, 'problem');
  db.save();
  return p;
}

function link(p, t, actor, { quiet = false } = {}) {
  if (!p || !t) return false;
  if (t.problemId && t.problemId !== p.id) unlink(db.find('problems', t.problemId), t, actor);
  if (!p.incidentIds.includes(t.id)) p.incidentIds.push(t.id);
  t.problemId = p.id;
  if (!quiet) history(p, `Incident ${t.number} linked.`, actor);
  t.comments = t.comments || [];
  t.comments.push({ id: db.uid(), at: db.now(), system: true, authorName: actor?.name || 'System', text: `Linked to problem ${p.number}: ${p.title}` });
  db.save();
  return true;
}

function unlink(p, t, actor) {
  if (!p || !t) return;
  p.incidentIds = p.incidentIds.filter((x) => x !== t.id);
  if (t.problemId === p.id) t.problemId = null;
  history(p, `Incident ${t.number} unlinked.`, actor);
  db.save();
}

// Shares the workaround with everyone waiting on a linked incident (public reply → email).
function shareWorkaround(p, actor) {
  if (!p.workaround) return 0;
  const tickets = require('./tickets');
  let n = 0;
  for (const t of p.incidentIds.map((id) => db.find('tickets', id)).filter((t) => t && !tickets.isClosed(t))) {
    tickets.addComment(t, `Workaround (known error ${p.number}):\n${p.workaround}`, actor, { internal: false });
    n++;
  }
  history(p, `Workaround shared with ${n} open incident(s).`, actor);
  db.save();
  return n;
}

// Closes every open linked incident once the permanent fix is in place.
function resolveIncidents(p, actor) {
  const tickets = require('./tickets');
  let n = 0;
  for (const t of p.incidentIds.map((id) => db.find('tickets', id)).filter((t) => t && !tickets.isClosed(t))) {
    tickets.update(t, {
      status: 'Resolved', resolutionCode: 'Fixed',
      resolutionNotes: `Resolved by problem ${p.number}. ${p.resolution || p.workaround || ''}`.trim(),
    }, actor);
    n++;
  }
  history(p, `${n} linked incident(s) resolved.`, actor);
  db.save();
  return n;
}

// Known errors that look like a ticket (shared words in the title / description, same category).
const STOP = new Set('the and for with from that this have after when what into your about cannot does not are was were will been also some there their them they then than only just over under very more most such please help issue error problem working work users user'.split(' '));
const words = (s) => new Set(String(s || '').toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g)?.filter((w) => !STOP.has(w)) || []);

function knownErrorsFor(t, limit = 3) {
  const tw = words(`${t.subject} ${t.description}`);
  if (!tw.size) return [];
  return db.where('problems', (p) => p.knownError && p.status !== 'Closed' && p.id !== t.problemId)
    .map((p) => {
      const pw = words(`${p.title} ${p.description} ${p.workaround}`);
      let score = 0;
      for (const w of tw) if (pw.has(w)) score++;
      if (p.category === t.category) score += 0.5;
      return { p, score };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.p);
}

module.exports = { STATUSES, CLOSED, FIELDS, isClosed, create, update, link, unlink, shareWorkaround, resolveIncidents, knownErrorsFor, history };
