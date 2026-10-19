// Ticket service: creation from any channel (web, form, email, automation),
// updates with history, workload calculation and notifications.
const db = require('./db');

const settings = () => db.state.settings;

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

function dueDate(priority, from = new Date()) {
  const h = Number(settings().slaHours?.[priority]) || 24;
  return new Date(from.getTime() + h * 3600 * 1000).toISOString();
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
    text: `Hi ${u.name},\n\nTicket ${t.number} has been assigned to you.\n\nSubject: ${t.subject}\nPriority: ${t.priority}\nRequester: ${t.requesterName || ''} <${t.requesterEmail || ''}>\n\n${t.description || ''}\n`,
  });
}

function create(data, actor, { source = 'web', skipWorkflows = false } = {}) {
  const s = settings();
  const priority = s.ticketPriorities.includes(data.priority) ? data.priority : 'Medium';
  const t = db.insert('tickets', {
    number: `${s.ticketPrefix}-${db.nextNumber('ticket')}`,
    subject: String(data.subject || '(no subject)').slice(0, 300),
    description: String(data.description || ''),
    category: data.category || s.ticketCategories[0],
    priority,
    status: data.status && s.ticketStatuses.includes(data.status) ? data.status : 'New',
    assigneeId: data.assigneeId || null,
    projectId: data.projectId || null,
    requesterName: data.requesterName || actor?.name || '',
    requesterEmail: data.requesterEmail || actor?.email || '',
    formId: data.formId || null,
    formData: data.formData || null,
    source,
    createdById: actor?.id || null,
    dueAt: dueDate(priority),
    resolvedAt: null,
    comments: [],
  });
  addHistory(t, `Ticket created via ${source}${t.assigneeId ? ` and assigned to ${userName(t.assigneeId)}` : ''}.`, actor);
  if (!skipWorkflows) require('./workflow').run('ticket.created', t, { actor });
  if (t.assigneeId) notifyAssignee(t);
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

const TRACKED = ['subject', 'description', 'category', 'priority', 'status', 'assigneeId', 'projectId'];

function update(t, patch, actor, { skipWorkflows = false } = {}) {
  const s = settings();
  const changes = [];
  const before = { ...t };
  for (const k of TRACKED) {
    if (!(k in patch) || patch[k] === undefined) continue;
    let v = patch[k] === '' ? null : patch[k];
    if (k === 'priority' && !s.ticketPriorities.includes(v)) continue;
    if (k === 'status' && !s.ticketStatuses.includes(v)) continue;
    if (t[k] === v) continue;
    t[k] = v;
    if (k === 'assigneeId') changes.push(`Assignee: ${userName(before.assigneeId)} → ${userName(v)}`);
    else if (k === 'projectId') changes.push(`Project: ${db.find('projects', v)?.name || 'None'}`);
    else if (k !== 'description') changes.push(`${k[0].toUpperCase() + k.slice(1)}: ${before[k] ?? '—'} → ${v}`);
    else changes.push('Description updated');
  }
  if (!changes.length) return t;
  if (before.priority !== t.priority) t.dueAt = dueDate(t.priority, new Date(t.createdAt));
  if (isClosed(t) && !t.resolvedAt) t.resolvedAt = db.now();
  if (!isClosed(t)) t.resolvedAt = null;
  t.updatedAt = db.now();
  addHistory(t, changes.join(' · '), actor);
  if (before.assigneeId !== t.assigneeId) notifyAssignee(t);
  if (!skipWorkflows) require('./workflow').run('ticket.updated', t, { actor, before });
  db.save();
  return t;
}

function addComment(t, text, actor, { internal = false, fromEmail = null } = {}) {
  t.comments = t.comments || [];
  t.comments.push({
    id: db.uid(), at: db.now(), authorId: actor?.id || null,
    authorName: actor?.name || fromEmail || 'Unknown', text: String(text), internal,
  });
  t.updatedAt = db.now();
  db.save();
  // Reply to requester by email for public comments made by staff
  if (!internal && actor && t.requesterEmail && t.source !== 'web') {
    require('./email').sendMail({
      to: t.requesterEmail,
      subject: `Re: [${t.number}] ${t.subject}`,
      text: `${text}\n\n— ${actor.name}, ${settings().companyName}`,
    });
  }
}

// Inbound email: a reply with [INC-1234] in the subject becomes a comment,
// anything else becomes a new ticket.
function fromEmail({ subject, text, fromEmail: email, fromName, account }) {
  const prefix = settings().ticketPrefix;
  const m = subject.match(new RegExp(`\\[(${prefix}-\\d+)\\]`, 'i'));
  const existing = m && db.all('tickets').find((t) => t.number.toUpperCase() === m[1].toUpperCase());
  if (existing) {
    addComment(existing, text, null, { fromEmail: fromName ? `${fromName} <${email}>` : email });
    if (isClosed(existing)) update(existing, { status: 'Open' }, { name: 'Email' });
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
    subject, description: lines.join('\n'), category: form.category, priority: values.priority || form.defaultPriority,
    requesterName: values.name || actor?.name, requesterEmail: values.email || actor?.email,
    formId: form.id, formData: values, assigneeId: form.defaultAssigneeId || null, projectId: form.projectId || null,
  }, actor, { source: actor ? 'form' : 'portal', skipWorkflows: true });
  require('./workflow').run('form.submitted', t, { form });
  require('./workflow').run('ticket.created', t, {});
  return t;
}

module.exports = { create, update, addComment, fromEmail, fromForm, workload, openTicketsFor, isClosed };
