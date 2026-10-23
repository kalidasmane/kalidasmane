// Ticket service: creation from any channel (web, form, email, automation),
// updates with history, workload calculation and notifications.
const db = require('./db');
const sla = require('./sla');

const settings = () => db.state.settings;
const creating = new Set(); // tickets whose "created" chat notification is still pending

function isClosed(t) {
  return settings().closedStatuses.includes(t.status);
}

function openTicketsFor(userId) {
  return db.where('tickets', (t) => t.assigneeId === userId && !isClosed(t));
}

// white = free (0), green = available (1..greenMax), red = busy (> greenMax)
function workload(userId) {
  const open = openTicketsFor(userId);
  const count = open.length;
  const greenMax = Number(settings().workloadGreenMax) || 3;
  const level = count === 0 ? 'free' : count <= greenMax ? 'available' : 'busy';
  const byPriority = {};
  const byStatus = {};
  for (const t of open) {
    byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
  }
  return { count, level, byPriority, byStatus };
}

function userName(id) {
  return db.find('users', id)?.name || 'Unassigned';
}

function addHistory(t, text, actor) {
  t.comments = t.comments || [];
  t.comments.push({ id: db.uid(), at: db.now(), system: true, authorName: actor?.name || 'System', text });
}

function notifyAssignee(t) {
  if (!settings().notifyOnAssign || !t.assigneeId) return;
  const u = db.find('users', t.assigneeId);
  if (!u?.email) return;
  require('./email').sendMail({
    to: u.email,
    subject: `[${t.number}] Assigned to you: ${t.subject}`,
    text: `Hi ${u.name},\n\nTicket ${t.number} has been assigned to you.\n\nSubject: ${t.subject}\nPriority: ${sla.label(t.priority)}\nRequester: ${t.requesterName || ''} <${t.requesterEmail || ''}>\n\n${t.description || ''}\n`,
  });
}

// ITIL: priority comes from impact × urgency; a priority given directly (P1…P4 or a name) also works.
function initialPriority(data) {
  const levels = sla.LEVELS;
  const impact = levels.includes(data.impact) ? data.impact : null;
  const urgency = levels.includes(data.urgency) ? data.urgency : null;
  const direct = sla.normalizePriority(data.priority);
  if (impact && urgency && !direct) return { priority: sla.priorityFor(impact, urgency) || 'Medium', impact, urgency };
  const priority = direct || (impact && urgency && sla.priorityFor(impact, urgency)) || 'Medium';
  const guess = sla.levelsFor(priority);
  return { priority, impact: impact || guess.impact, urgency: urgency || guess.urgency };
}

function create(data, actor, { source = 'web', skipWorkflows = false, createdAt = null } = {}) {
  const s = settings();
  const { priority, impact, urgency } = initialPriority(data);
  const t = db.insert('tickets', {
    number: `${s.ticketPrefix}-${db.nextNumber('ticket')}`,
    subject: String(data.subject || '(no subject)').slice(0, 300),
    description: String(data.description || ''),
    category: data.category || s.ticketCategories[0],
    priority,
    impact,
    urgency,
    status: data.status && s.ticketStatuses.includes(data.status) ? data.status : 'New',
    assigneeId: data.assigneeId || null,
    projectId: data.projectId || null,
    deviceId: data.deviceId || null,
    watchers: require('./ticketmail').parseEmails(data.watchers).join(', '),
    requesterName: data.requesterName || actor?.name || '',
    requesterEmail: data.requesterEmail || actor?.email || '',
    formId: data.formId || null,
    formData: data.formData || null,
    source,
    createdById: actor?.id || null,
    resolvedAt: null,
    firstResponseAt: null,
    slaPausedAt: null,
    slaPausedMinutes: 0,
    slaAlerts: {},
    comments: [],
  });
  if (createdAt) t.createdAt = t.updatedAt = createdAt; // demo data only
  sla.onChange(t, null);
  addHistory(t, `Ticket created via ${source}${t.assigneeId ? ` and assigned to ${userName(t.assigneeId)}` : ''}.`, actor);
  if (!skipWorkflows) require('./workflow').run('ticket.created', t, { actor });
  if (t.assigneeId) notifyAssignee(t);
  // Chat notifications go out after the current call stack, so assignments made by
  // workflows that run right after creation (email, forms) are included.
  creating.add(t.id);
  setImmediate(() => {
    creating.delete(t.id);
    require('./notify').ticketEvent('ticket.created', t);
    require('./alerts').ticketCreated(t, actor);
  });
  if (settings().notifyRequesterOnCreate && t.requesterEmail && source !== 'web') {
    require('./email').sendMail({
      to: t.requesterEmail,
      subject: `[${t.number}] We received your request: ${t.subject}`,
      text: `Hello ${t.requesterName || ''},\n\nYour request has been logged as ${t.number}. Our team will get back to you shortly.\nPlease keep [${t.number}] in the subject line when replying.\n\n— ${s.companyName}`,
    });
  }
  db.save();
  return t;
}

const TRACKED = ['subject', 'description', 'category', 'impact', 'urgency', 'priority', 'status', 'holdReason', 'resolutionCode', 'resolutionNotes', 'assigneeId', 'projectId', 'deviceId', 'watchers'];
const LABELS = { holdReason: 'On-hold reason', resolutionCode: 'Resolution' };

function update(t, patch, actor, { skipWorkflows = false, quietEmail = false } = {}) {
  const s = settings();
  const changes = [];
  const before = { ...t };
  for (const k of TRACKED) {
    if (!(k in patch) || patch[k] === undefined) continue;
    let v = patch[k] === '' ? null : patch[k];
    if (k === 'watchers') v = require('./ticketmail').parseEmails(v).join(', ');
    if (k === 'priority') { v = sla.normalizePriority(v); if (!v) continue; }
    if ((k === 'impact' || k === 'urgency') && !sla.LEVELS.includes(v)) continue;
    if (k === 'status' && !s.ticketStatuses.includes(v)) continue;
    if (['watchers', 'resolutionNotes'].includes(k) ? (t[k] || '') === (v || '') : t[k] === v) continue; // older tickets lack these
    t[k] = v;
    if (k === 'assigneeId') changes.push(`Assignee: ${userName(before.assigneeId)} → ${userName(v)}`);
    else if (k === 'projectId') changes.push(`Project: ${db.find('projects', v)?.name || 'None'}`);
    else if (k === 'deviceId') changes.push(`Device: ${db.find('devices', v)?.name || 'None'}`);
    else if (k === 'watchers') changes.push(`CC: ${v || 'none'}`);
    else if (k === 'priority') changes.push(`Priority: ${sla.label(before.priority) || '—'} → ${sla.label(v)}`);
    else if (k === 'resolutionNotes') changes.push(`Resolution notes: ${String(v || '').slice(0, 200)}`);
    else if (k === 'description') changes.push('Description updated');
    else changes.push(`${LABELS[k] || k[0].toUpperCase() + k.slice(1)}: ${before[k] ?? '—'} → ${v ?? '—'}`);
  }
  // Changing impact or urgency re-derives the priority from the ITIL matrix.
  if ((before.impact !== t.impact || before.urgency !== t.urgency) && before.priority === t.priority) {
    const p = sla.priorityFor(t.impact, t.urgency);
    if (p && p !== t.priority) {
      t.priority = p;
      changes.push(`Priority: ${sla.label(before.priority)} → ${sla.label(p)} (impact × urgency)`);
    }
  }
  if (!changes.length) return t;
  if (isClosed(t) && !t.resolvedAt) t.resolvedAt = db.now();
  if (!isClosed(t)) t.resolvedAt = null;
  changes.push(...sla.onChange(t, before));
  t.updatedAt = db.now();
  addHistory(t, changes.join(' · '), actor);
  if (!quietEmail) {
    require('./ticketmail').onUpdate(t, before, changes, actor);
    require('./alerts').ticketUpdated(t, before, changes, actor);
  }
  if (before.assigneeId !== t.assigneeId) {
    notifyAssignee(t);
    if (t.assigneeId && !creating.has(t.id)) {
      require('./notify').ticketEvent('ticket.assigned', t);
      require('./alerts').ticketAssigned(t, actor);
    }
  }
  if (!skipWorkflows) require('./workflow').run('ticket.updated', t, { actor, before });
  db.save();
  return t;
}

function addComment(t, text, actor, { internal = false, fromEmail = null, emailNote = '' } = {}) {
  t.comments = t.comments || [];
  const comment = {
    id: db.uid(), at: db.now(), authorId: actor?.id || null,
    authorName: actor?.name || fromEmail || 'Unknown', text: String(text), internal,
  };
  t.comments.push(comment);
  t.updatedAt = db.now();
  if (actor && !internal) sla.responded(t, comment.at); // a reply to the requester is the first response
  db.save();
  require('./ticketmail').onComment(t, comment, actor, fromEmail, emailNote);
  require('./alerts').ticketCommented(t, comment, actor);
}

// Inbound email: a reply with [INC-1234] in the subject becomes a comment,
// anything else becomes a new ticket.
function fromEmail({ subject, text, fromEmail: email, fromName, account }) {
  const prefix = settings().ticketPrefix;
  const m = subject.match(new RegExp(`\\[(${prefix}-\\d+)\\]`, 'i'));
  const existing = m && db.all('tickets').find((t) => t.number.toUpperCase() === m[1].toUpperCase());
  if (existing) {
    const sender = fromName ? `${fromName} <${email}>` : email;
    // Reopen quietly; the reply email below mentions it, so people get one email, not two.
    const reopened = isClosed(existing);
    if (reopened) update(existing, { status: 'Open' }, { name: `${fromName || email} (email reply)`, email }, { quietEmail: true });
    addComment(existing, text, null, { fromEmail: sender, emailNote: reopened ? 'The ticket was reopened by this reply.' : '' });
    return { created: false, ticket: existing };
  }
  const form = account?.defaultFormId ? db.find('forms', account.defaultFormId) : null;
  const t = create({
    subject, description: text, requesterEmail: email, requesterName: fromName || email,
    category: form?.category, priority: form?.defaultPriority, formId: form?.id || null,
    assigneeId: account?.defaultAssigneeId || null,
  }, null, { source: 'email', skipWorkflows: true });
  require('./workflow').run('email.received', t, { account });
  require('./workflow').run('ticket.created', t, {});
  return { created: true, ticket: t };
}

function fromForm(form, values, actor) {
  const subject = values.subject || values.title || `${form.name} submission`;
  const lines = form.fields
    .filter((f) => !['subject', 'title'].includes(f.key))
    .map((f) => `${f.label}: ${Array.isArray(values[f.key]) ? values[f.key].join(', ') : (values[f.key] ?? '')}`);
  const t = create({
    subject, description: lines.join('\n'), category: form.category,
    // Forms with impact / urgency questions get their priority from the ITIL matrix.
    impact: sla.levelFrom('impact', values.impact), urgency: sla.levelFrom('urgency', values.urgency),
    priority: values.priority || ((values.impact && values.urgency) ? null : form.defaultPriority),
    requesterName: values.name || actor?.name, requesterEmail: values.email || actor?.email,
    formId: form.id, formData: values, assigneeId: form.defaultAssigneeId || null, projectId: form.projectId || null,
  }, actor, { source: actor ? 'form' : 'portal', skipWorkflows: true });
  require('./workflow').run('form.submitted', t, { form });
  require('./workflow').run('ticket.created', t, {});
  return t;
}

module.exports = { create, update, addComment, fromEmail, fromForm, workload, openTicketsFor, isClosed };
