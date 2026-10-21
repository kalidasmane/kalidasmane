// Workflow automation engine.
// A workflow = trigger + conditions + ordered actions. Triggers fire from ticket
// events, form submissions, inbound email, or a schedule (automatic ticket creation).
const db = require('./db');

const TRIGGERS = {
  'ticket.created': 'Ticket is created (any channel)',
  'ticket.updated': 'Ticket is updated',
  'form.submitted': 'Form is submitted',
  'email.received': 'Email received on an inbound channel',
  schedule: 'On a schedule (automatic ticket creation)',
};

const OPERATORS = {
  equals: 'equals', not_equals: 'does not equal', contains: 'contains',
  not_contains: 'does not contain', starts_with: 'starts with',
  is_empty: 'is empty', is_not_empty: 'is not empty', changed: 'has changed',
};

const ACTIONS = {
  assign_user: 'Assign to a specific user',
  assign_round_robin: 'Assign round-robin within a group',
  assign_least_loaded: 'Assign to the least-loaded user (workload based)',
  set_priority: 'Set priority',
  set_status: 'Set status',
  set_category: 'Set category',
  set_project: 'Link to project',
  add_comment: 'Add a note / comment',
  send_email: 'Send an email',
  notify_channel: 'Send a Teams / Slack / WhatsApp message',
  create_ticket: 'Create a ticket',
};

function fieldValue(t, field) {
  if (field.startsWith('formData.')) return t.formData?.[field.slice(9)];
  return t[field];
}

function test(cond, t, before) {
  const raw = fieldValue(t, cond.field);
  const v = Array.isArray(raw) ? raw.join(', ') : String(raw ?? '');
  const want = String(cond.value ?? '');
  const a = v.toLowerCase(); const b = want.toLowerCase();
  switch (cond.op) {
    case 'equals': return a === b;
    case 'not_equals': return a !== b;
    case 'contains': return b.split(',').map((x) => x.trim()).filter(Boolean).some((x) => a.includes(x));
    case 'not_contains': return !b.split(',').map((x) => x.trim()).filter(Boolean).some((x) => a.includes(x));
    case 'starts_with': return a.startsWith(b);
    case 'is_empty': return !v;
    case 'is_not_empty': return !!v;
    case 'changed': return !!before && String(fieldValue(before, cond.field) ?? '') !== v;
    default: return false;
  }
}

function matches(wf, t, before) {
  const conds = (wf.conditions || []).filter((c) => c.field && c.op);
  if (wf.formId && t.formId !== wf.formId) return false;
  if (!conds.length) return true;
  return wf.matchType === 'any' ? conds.some((c) => test(c, t, before)) : conds.every((c) => test(c, t, before));
}

function render(tpl, t) {
  const assignee = t && db.find('users', t.assigneeId);
  const vars = {
    'ticket.number': t?.number, 'ticket.subject': t?.subject, 'ticket.priority': t?.priority,
    'ticket.status': t?.status, 'ticket.category': t?.category, 'ticket.description': t?.description,
    'ticket.requesterName': t?.requesterName, 'ticket.requesterEmail': t?.requesterEmail,
    'assignee.name': assignee?.name || 'Unassigned', date: new Date().toISOString().slice(0, 10),
  };
  return String(tpl || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => vars[k] ?? '');
}

function candidates(a) {
  const { isOnline } = require('./auth');
  let users = db.where('users', (u) => u.active);
  if (a.profileId) users = users.filter((u) => u.profileId === a.profileId);
  if (a.userIds?.length) users = users.filter((u) => a.userIds.includes(u.id));
  if (a.onlineOnly) {
    const online = users.filter(isOnline);
    if (online.length) users = online; // fall back to everyone if nobody is online
  }
  return users;
}

function execute(wf, a, t, notes) {
  const tickets = require('./tickets');
  const actor = { name: `Workflow: ${wf.name}` };
  const opts = { skipWorkflows: true };
  if (!t && !['create_ticket', 'send_email', 'notify_channel'].includes(a.type)) return null; // needs a ticket
  switch (a.type) {
    case 'assign_user':
      if (a.userId) { tickets.update(t, { assigneeId: a.userId }, actor, opts); notes.push(`assigned to ${db.find('users', a.userId)?.name}`); }
      break;
    case 'assign_round_robin': {
      const users = candidates(a);
      if (!users.length) break;
      wf.rrIndex = ((wf.rrIndex ?? -1) + 1) % users.length;
      tickets.update(t, { assigneeId: users[wf.rrIndex].id }, actor, opts);
      notes.push(`round-robin → ${users[wf.rrIndex].name}`);
      break;
    }
    case 'assign_least_loaded': {
      const users = candidates(a);
      if (!users.length) break;
      users.sort((x, y) => tickets.workload(x.id).count - tickets.workload(y.id).count);
      tickets.update(t, { assigneeId: users[0].id }, actor, opts);
      notes.push(`least-loaded → ${users[0].name}`);
      break;
    }
    case 'set_priority': tickets.update(t, { priority: a.value }, actor, opts); notes.push(`priority ${a.value}`); break;
    case 'set_status': tickets.update(t, { status: a.value }, actor, opts); notes.push(`status ${a.value}`); break;
    case 'set_category': tickets.update(t, { category: a.value }, actor, opts); notes.push(`category ${a.value}`); break;
    case 'set_project': tickets.update(t, { projectId: a.projectId }, actor, opts); notes.push('project linked'); break;
    case 'add_comment':
      t.comments.push({ id: db.uid(), at: db.now(), authorName: actor.name, text: render(a.text, t), internal: a.internal !== false });
      notes.push('comment added');
      break;
    case 'notify_channel': {
      const ch = db.find('notifyChannels', a.channelId);
      if (!ch) break;
      const notify = require('./notify');
      const facts = t ? notify.ticketFacts(t, 'workflow') : { event: wf.name, number: '', subject: wf.name, priority: '', category: '', status: '', requester: '', assignee: '', link: '' };
      facts.event = wf.name;
      notify.send(ch, facts, { ticket: t, extra: render(a.text, t), event: 'workflow' });
      notes.push(`notified ${ch.name}`);
      break;
    }
    case 'send_email': {
      let to = a.address;
      if (a.to === 'requester') to = t?.requesterEmail;
      if (a.to === 'assignee') to = db.find('users', t?.assigneeId)?.email;
      if (a.to === 'manager') {
        const u = db.find('users', t?.assigneeId);
        to = u && db.find('users', u.managerId)?.email;
      }
      if (to) {
        require('./email').sendMail({ to, subject: render(a.subject, t), text: render(a.body, t) });
        notes.push(`email → ${to}`);
      }
      break;
    }
    case 'create_ticket': {
      const nt = tickets.create({
        subject: render(a.subject, t), description: render(a.description, t), priority: a.priority,
        category: a.category, assigneeId: a.assigneeId || null, projectId: a.projectId || null,
        requesterName: 'Automation',
      }, { name: `Workflow: ${wf.name}` }, { source: 'automation' });
      notes.push(`created ${nt.number}`);
      return nt;
    }
    default: break;
  }
  return null;
}

function runOne(wf, t, ctx = {}) {
  const notes = [];
  try {
    let target = t;
    for (const a of wf.actions || []) {
      const created = execute(wf, a, target, notes);
      if (created && !target) target = created;
    }
    wf.lastRunAt = db.now();
    wf.runCount = (wf.runCount || 0) + 1;
    db.log('workflowLogs', { workflowId: wf.id, workflow: wf.name, trigger: ctx.trigger || wf.trigger, ticket: target?.number || null, status: 'success', detail: notes.join('; ') || 'no changes' });
  } catch (e) {
    db.log('workflowLogs', { workflowId: wf.id, workflow: wf.name, trigger: ctx.trigger || wf.trigger, ticket: t?.number || null, status: 'error', detail: e.message });
  }
  db.save();
}

function run(trigger, t, ctx = {}) {
  const list = db.where('workflows', (w) => w.enabled && w.trigger === trigger)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  for (const wf of list) {
    if (trigger === 'email.received' && wf.emailAccountId && wf.emailAccountId !== ctx.account?.id) continue;
    if (matches(wf, t, ctx.before)) runOne(wf, t, { trigger });
  }
}

// Scheduler: checks scheduled workflows once a minute.
function due(wf, d) {
  const s = wf.schedule || {};
  const [hh, mm] = String(s.time || '09:00').split(':').map(Number);
  const key = d.toISOString().slice(0, 16);
  if (wf.lastScheduleKey === key) return false;
  switch (s.frequency) {
    case 'hourly': return d.getMinutes() === (mm || 0);
    case 'weekly': return d.getDay() === Number(s.weekday ?? 1) && d.getHours() === hh && d.getMinutes() === mm;
    case 'monthly': return d.getDate() === Number(s.monthDay || 1) && d.getHours() === hh && d.getMinutes() === mm;
    case 'daily':
    default: {
      const days = s.weekdays?.length ? s.weekdays.map(Number) : [0, 1, 2, 3, 4, 5, 6];
      return days.includes(d.getDay()) && d.getHours() === hh && d.getMinutes() === mm;
    }
  }
}

function startScheduler() {
  setInterval(() => {
    const d = new Date();
    for (const wf of db.where('workflows', (w) => w.enabled && w.trigger === 'schedule')) {
      if (due(wf, d)) {
        wf.lastScheduleKey = d.toISOString().slice(0, 16);
        runOne(wf, null, { trigger: 'schedule' });
      }
    }
  }, 20000);
}

module.exports = { TRIGGERS, OPERATORS, ACTIONS, run, runOne, startScheduler };
