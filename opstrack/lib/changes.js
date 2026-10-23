// ITIL Change Management (change enablement): every change to live services is raised as a
// request for change (RFC), assessed for risk, approved by the change advisory board (CAB),
// scheduled, implemented with a backout plan, and reviewed afterwards.
//
// Change types
//   standard  – low-risk, pre-approved, repeatable: goes straight to Approved when submitted
//   normal    – assessed, then approved by every chosen CAB member
//   emergency – urgent fix: one approval from the emergency CAB (ECAB) is enough
const db = require('./db');

const TYPES = { standard: 'Standard (pre-approved)', normal: 'Normal', emergency: 'Emergency' };
const STATUSES = ['Draft', 'Assessment', 'Awaiting Approval', 'Approved', 'Scheduled', 'Implementing', 'Review', 'Closed', 'Rejected', 'Cancelled'];
const FINAL = ['Closed', 'Rejected', 'Cancelled'];
const RISKS = ['Low', 'Medium', 'High'];
const OUTCOMES = ['Successful', 'Successful with issues', 'Failed – backed out'];
const FIELDS = ['title', 'description', 'type', 'category', 'risk', 'impact', 'reason', 'implementationPlan', 'backoutPlan', 'testPlan',
  'plannedStart', 'plannedEnd', 'assigneeId', 'deviceIds', 'problemId', 'outcome', 'reviewNotes'];
// Changing any of these after assessment means the CAB has to look again.
const MATERIAL = ['type', 'risk', 'impact', 'implementationPlan', 'backoutPlan', 'plannedStart', 'plannedEnd', 'deviceIds'];
const LABELS = {
  implementationPlan: 'Implementation plan', backoutPlan: 'Backout plan', testPlan: 'Test plan', plannedStart: 'Planned start',
  plannedEnd: 'Planned end', assigneeId: 'Change owner', deviceIds: 'Affected devices', problemId: 'Problem', reviewNotes: 'Review notes',
};

const userName = (id) => db.find('users', id)?.name || 'Unassigned';
const isFinal = (c) => FINAL.includes(c.status);
const approvers = () => db.where('users', (u) => u.active && (db.find('profiles', u.profileId)?.permissions?.changes || []).includes('approve'));

function history(c, text, actor) {
  c.comments = c.comments || [];
  c.comments.push({ id: db.uid(), at: db.now(), system: true, authorName: actor?.name || 'System', text });
}

const validDate = (v) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

function create(data, actor) {
  const s = db.state.settings;
  const c = db.insert('changes', {
    number: `${s.changePrefix || 'CHG'}-${db.nextNumber('change')}`,
    title: String(data.title || '(untitled change)').slice(0, 300),
    description: String(data.description || ''),
    type: TYPES[data.type] ? data.type : 'normal',
    category: data.category || 'Change',
    risk: RISKS.includes(data.risk) ? data.risk : 'Medium',
    impact: RISKS.includes(data.impact) ? data.impact : 'Medium',
    reason: String(data.reason || ''),
    implementationPlan: String(data.implementationPlan || ''),
    backoutPlan: String(data.backoutPlan || ''),
    testPlan: String(data.testPlan || ''),
    plannedStart: validDate(data.plannedStart), plannedEnd: validDate(data.plannedEnd),
    actualStart: null, actualEnd: null,
    status: 'Draft',
    assigneeId: data.assigneeId || null,
    requestedById: actor?.id || null,
    deviceIds: Array.isArray(data.deviceIds) ? data.deviceIds.filter((id) => db.find('devices', id)) : [],
    problemId: db.find('problems', data.problemId) ? data.problemId : null,
    incidentIds: (data.incidentIds || []).filter((id) => db.find('tickets', id)),
    approverIds: [], approvals: [], outcome: null, reviewNotes: '', comments: [],
  });
  history(c, `Request for change raised (${TYPES[c.type]}).`, actor);
  if (c.problemId) {
    const p = db.find('problems', c.problemId);
    if (!p.changeIds.includes(c.id)) p.changeIds.push(c.id);
    require('./problems').history(p, `Change ${c.number} raised for the permanent fix.`, actor);
  }
  for (const t of c.incidentIds.map((id) => db.find('tickets', id))) {
    t.changeIds = [...new Set([...(t.changeIds || []), c.id])];
    t.comments.push({ id: db.uid(), at: db.now(), system: true, authorName: actor?.name || 'System', text: `Change ${c.number} raised: ${c.title}` });
  }
  if (c.assigneeId) require('./alerts').recordAssigned(c, actor, 'change');
  db.save();
  return c;
}

function update(c, patch, actor) {
  if (isFinal(c)) return { error: `${c.number} is ${c.status.toLowerCase()} and can no longer be edited` };
  const changes = [];
  const before = { ...c, deviceIds: [...(c.deviceIds || [])] };
  for (const k of FIELDS) {
    if (!(k in patch) || patch[k] === undefined) continue;
    let v = patch[k] === '' ? null : patch[k];
    if (k === 'type' && !TYPES[v]) continue;
    if ((k === 'risk' || k === 'impact') && !RISKS.includes(v)) continue;
    if (k === 'outcome' && v && !OUTCOMES.includes(v)) continue;
    if (k === 'plannedStart' || k === 'plannedEnd') v = validDate(v);
    if (k === 'deviceIds') v = (Array.isArray(v) ? v : []).filter((id) => db.find('devices', id));
    if (k === 'problemId' && v && !db.find('problems', v)) continue;
    if (['description', 'reason', 'implementationPlan', 'backoutPlan', 'testPlan', 'reviewNotes', 'title'].includes(k)) v = String(v || '');
    const same = k === 'deviceIds' ? JSON.stringify([...v].sort()) === JSON.stringify([...(c[k] || [])].sort()) : (c[k] ?? '') === (v ?? '');
    if (same) continue;
    c[k] = v;
    if (k === 'assigneeId') changes.push(`Change owner: ${userName(before.assigneeId)} → ${userName(v)}`);
    else if (k === 'deviceIds') changes.push(`Affected devices: ${v.map((id) => db.find('devices', id)?.name).join(', ') || 'none'}`);
    else if (k === 'plannedStart' || k === 'plannedEnd') changes.push(`${LABELS[k]}: ${v ? new Date(v).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—'}`);
    else if (k === 'problemId') changes.push(`Problem: ${db.find('problems', v)?.number || 'none'}`);
    else if (k === 'type') changes.push(`Type: ${TYPES[before.type]} → ${TYPES[v]}`);
    else if (['description', 'reason', 'implementationPlan', 'backoutPlan', 'testPlan', 'reviewNotes'].includes(k)) changes.push(`${LABELS[k] || k[0].toUpperCase() + k.slice(1)} updated`);
    else changes.push(`${LABELS[k] || k[0].toUpperCase() + k.slice(1)}: ${before[k] ?? '—'} → ${v ?? '—'}`);
  }
  if (!changes.length) return { change: c };
  // A material change after approval sends the RFC back for assessment.
  const material = MATERIAL.some((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(c[k] ?? null));
  if (material && ['Awaiting Approval', 'Approved', 'Scheduled'].includes(c.status) && c.type !== 'standard') {
    c.status = 'Assessment';
    c.approvals = [];
    changes.push('Approvals cleared – the change must be approved again');
  }
  if (c.problemId && c.problemId !== before.problemId) {
    const p = db.find('problems', c.problemId);
    if (!p.changeIds.includes(c.id)) p.changeIds.push(c.id);
  }
  c.updatedAt = db.now();
  history(c, changes.join(' · '), actor);
  if (before.assigneeId !== c.assigneeId && c.assigneeId) require('./alerts').recordAssigned(c, actor, 'change');
  db.save();
  return { change: c };
}

// ---------- lifecycle ----------
function need(c, fields) {
  const missing = fields.filter((k) => !String(c[k] || '').trim());
  return missing.length ? `Fill in ${missing.map((k) => (LABELS[k] || k).toLowerCase()).join(', ')} first` : null;
}

function setStatus(c, status, actor, note) {
  const from = c.status;
  c.status = status;
  c.updatedAt = db.now();
  history(c, `Status: ${from} → ${status}${note ? ` · ${note}` : ''}`, actor);
}

// Runs a lifecycle action. Returns { change } or { error }.
function act(c, action, actor, body = {}) {
  const alerts = require('./alerts');
  const isApprover = approvers().some((u) => u.id === actor.id);
  switch (action) {
    case 'submit': {
      if (c.status !== 'Draft') return { error: 'Only a draft can be submitted' };
      const err = need(c, c.type === 'standard' ? ['implementationPlan'] : ['reason', 'implementationPlan', 'backoutPlan', 'plannedStart', 'plannedEnd']);
      if (err) return { error: err };
      if (c.plannedStart && c.plannedEnd && c.plannedEnd <= c.plannedStart) return { error: 'The planned end must be after the planned start' };
      if (c.type === 'standard') setStatus(c, 'Approved', actor, 'standard change – pre-approved');
      else if (c.type === 'emergency') return requestApproval(c, actor, body);
      else setStatus(c, 'Assessment', actor);
      break;
    }
    case 'request_approval':
      if (!['Assessment'].includes(c.status)) return { error: 'Only a change in assessment can be sent for approval' };
      return requestApproval(c, actor, body);
    case 'approve':
    case 'reject': {
      if (c.status !== 'Awaiting Approval') return { error: 'This change is not waiting for approval' };
      if (!isApprover || !(c.approverIds || []).includes(actor.id)) return { error: 'You are not an approver for this change' };
      if (action === 'reject' && !String(body.comment || '').trim()) return { error: 'Give a reason for rejecting the change' };
      c.approvals = (c.approvals || []).filter((a) => a.userId !== actor.id);
      c.approvals.push({ userId: actor.id, name: actor.name, decision: action === 'approve' ? 'approved' : 'rejected', comment: String(body.comment || ''), at: db.now() });
      history(c, `${actor.name} ${action === 'approve' ? 'approved' : 'rejected'} the change${body.comment ? `: ${body.comment}` : ''}`, actor);
      if (action === 'reject') {
        setStatus(c, 'Rejected', actor);
        alerts.changeDecision(c, actor, 'rejected');
      } else {
        const approved = new Set(c.approvals.filter((a) => a.decision === 'approved').map((a) => a.userId));
        const done = c.type === 'emergency' ? approved.size >= 1 : c.approverIds.every((id) => approved.has(id));
        if (done) { setStatus(c, 'Approved', actor, c.type === 'emergency' ? 'ECAB approval' : 'CAB approval complete'); alerts.changeDecision(c, actor, 'approved'); }
      }
      break;
    }
    case 'schedule':
      if (c.status !== 'Approved') return { error: 'Only an approved change can be scheduled' };
      if (!c.plannedStart || !c.plannedEnd) return { error: 'Set the planned start and end first' };
      setStatus(c, 'Scheduled', actor, `${c.plannedStart.slice(0, 16).replace('T', ' ')} UTC`);
      break;
    case 'start':
      if (!['Approved', 'Scheduled'].includes(c.status)) return { error: 'The change must be approved before work starts' };
      c.actualStart = db.now();
      setStatus(c, 'Implementing', actor);
      break;
    case 'complete': {
      if (c.status !== 'Implementing') return { error: 'Only a change being implemented can be completed' };
      if (!OUTCOMES.includes(body.outcome)) return { error: 'Choose the outcome of the change' };
      c.outcome = body.outcome;
      c.actualEnd = db.now();
      setStatus(c, 'Review', actor, `outcome: ${c.outcome}`);
      break;
    }
    case 'close': {
      if (c.status !== 'Review') return { error: 'Close the change after its post-implementation review' };
      const notes = String(body.reviewNotes ?? c.reviewNotes ?? '').trim();
      if (!notes) return { error: 'Add the post-implementation review notes' };
      c.reviewNotes = notes;
      setStatus(c, 'Closed', actor, 'post-implementation review done');
      const p = db.find('problems', c.problemId);
      if (p) {
        require('./problems').history(p, `Change ${c.number} closed – outcome: ${c.outcome}.`, actor);
        alerts.recordNotice(p, 'problem', `${c.number} for ${p.number} is done (${c.outcome})`, 'The permanent fix can now be confirmed and the problem resolved.', actor);
      }
      break;
    }
    case 'cancel':
      if (isFinal(c) || ['Implementing', 'Review'].includes(c.status)) return { error: 'This change can no longer be cancelled' };
      setStatus(c, 'Cancelled', actor, body.comment ? String(body.comment) : '');
      break;
    case 'rework':
      if (c.status !== 'Rejected') return { error: 'Only a rejected change can be reworked' };
      c.approvals = [];
      setStatus(c, 'Draft', actor, 'reworked after rejection');
      break;
    default:
      return { error: 'Unknown action' };
  }
  db.save();
  return { change: c };
}

function requestApproval(c, actor, body) {
  const valid = new Set(approvers().map((u) => u.id));
  const ids = [...new Set((body.approverIds || []).filter((id) => valid.has(id)))];
  if (!ids.length) return { error: 'Choose at least one approver (users whose profile can approve changes)' };
  c.approverIds = ids;
  c.approvals = [];
  setStatus(c, 'Awaiting Approval', actor, `${c.type === 'emergency' ? 'ECAB' : 'CAB'}: ${ids.map(userName).join(', ')}`);
  require('./alerts').changeApprovalRequested(c, actor);
  db.save();
  return { change: c };
}

// ---------- schedule ----------
const LIVE = (c) => !['Draft', 'Rejected', 'Cancelled', 'Closed'].includes(c.status) && c.plannedStart && c.plannedEnd;

// Other changes in the same window that touch the same device, or two high-risk changes at once.
function conflicts(c) {
  if (!LIVE(c)) return [];
  return db.where('changes', (o) => o.id !== c.id && LIVE(o) && o.plannedStart < c.plannedEnd && c.plannedStart < o.plannedEnd)
    .filter((o) => (o.deviceIds || []).some((d) => (c.deviceIds || []).includes(d)) || (o.risk === 'High' && c.risk === 'High'))
    .map((o) => ({ id: o.id, number: o.number, title: o.title, plannedStart: o.plannedStart, plannedEnd: o.plannedEnd, reason: (o.deviceIds || []).some((d) => (c.deviceIds || []).includes(d)) ? 'same device' : 'two high-risk changes' }));
}

module.exports = { TYPES, STATUSES, FINAL, RISKS, OUTCOMES, FIELDS, create, update, act, conflicts, approvers, history, isFinal };
