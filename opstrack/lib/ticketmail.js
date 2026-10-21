// Email notifications for ticket updates and comments.
// Recipients: the requester (status changes, staff replies), the assignee
// (changes and comments by others) and the ticket's CC list ("watchers").
// The person who made the change is never emailed about it, and internal
// notes only ever go to the assignee.
const db = require('./db');

const DEFAULTS = {
  requesterOnStatus: true,
  requesterStatuses: ['In Progress', 'On Hold', 'Resolved', 'Closed'],
  requesterOnReply: true,
  assigneeOnUpdate: true,
  assigneeOnComment: true,
  watchersOnUpdate: true,
};

const cfg = () => ({ ...DEFAULTS, ...(db.state.settings.emailNotify || {}) });
const norm = (e) => String(e || '').trim().toLowerCase();
const validEmail = (e) => /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(String(e || '').trim());

function parseEmails(list) {
  return [...new Set(String(list || '').split(/[\s,;]+/).map((x) => x.trim()).filter(validEmail).map(norm))];
}

// Email address of whoever made the change (user, or "Name <addr>" from an inbound email).
function actorEmail(actor, fromEmail) {
  if (actor?.email) return norm(actor.email);
  const m = String(fromEmail || '').match(/<([^>]+)>/);
  return norm(m ? m[1] : fromEmail);
}

function ticketLink(t) {
  const base = String(db.state.settings.publicUrl || '').replace(/\/+$/, '');
  return base ? `${base}/#/tickets/${t.id}` : '';
}

// The OpsTrack link is only useful to staff; requesters and CCs reply by email instead.
function summary(t, staff) {
  const assignee = db.find('users', t.assigneeId)?.name || 'Unassigned';
  const link = staff ? ticketLink(t) : '';
  return [
    `Ticket: ${t.number} – ${t.subject}`,
    `Status: ${t.status} · Priority: ${t.priority} · Assignee: ${assignee}`,
    link ? `Open: ${link}` : '',
  ].filter(Boolean).join('\n');
}

function footer(t) {
  return `\n\nReply to this email to add a comment (keep [${t.number}] in the subject).\n— ${db.state.settings.companyName}`;
}

// Sends one email per recipient, skipping the actor and duplicates.
function sendAll(list, actorAddr, build) {
  const email = require('./email');
  const seen = new Set();
  for (const r of list) {
    const addr = norm(r.email);
    if (!validEmail(addr) || addr === actorAddr || seen.has(addr)) continue;
    seen.add(addr);
    const { subject, text } = build(r);
    email.sendMail({ to: r.email, subject, text });
  }
}

const requester = (t) => (t.requesterEmail ? [{ email: t.requesterEmail, name: t.requesterName || '', role: 'requester' }] : []);
const assignee = (t) => {
  const u = db.find('users', t.assigneeId);
  return u?.email ? [{ email: u.email, name: u.name, role: 'assignee' }] : [];
};
const watchers = (t) => parseEmails(t.watchers).map((e) => ({ email: e, name: '', role: 'watcher' }));

// Called after a ticket's fields changed. `changes` are the human-readable lines from the history.
function onUpdate(t, before, changes, actor) {
  const c = cfg();
  const statusChanged = before.status !== t.status;
  const reassigned = before.assigneeId !== t.assigneeId;
  const by = actor?.name || 'OpsTrack';
  const list = [];
  if (c.requesterOnStatus && statusChanged && (c.requesterStatuses || []).includes(t.status)) list.push(...requester(t));
  // Assignment emails are sent separately (Settings → General), so skip the assignee here when reassigned.
  if (c.assigneeOnUpdate && !reassigned) list.push(...assignee(t));
  if (c.watchersOnUpdate && (statusChanged || reassigned || before.priority !== t.priority)) list.push(...watchers(t));
  if (!list.length) return;
  sendAll(list, actorEmail(actor), (r) => {
    const internalView = r.role === 'assignee';
    const lines = internalView ? changes : changes.filter((l) => /^(Status|Priority|Assignee|Subject)/.test(l));
    const subject = statusChanged ? `[${t.number}] Status changed to ${t.status}: ${t.subject}` : `[${t.number}] Ticket updated: ${t.subject}`;
    const hello = r.name ? `Hello ${r.name},\n\n` : 'Hello,\n\n';
    const text = `${hello}${by} updated ticket ${t.number}.\n\n${lines.length ? `Changes:\n${lines.map((l) => ` - ${l}`).join('\n')}\n\n` : ''}${summary(t, internalView)}${footer(t)}`;
    return { subject, text };
  });
}

// Called after a comment was added (by staff, or by email from the requester / anyone).
function onComment(t, comment, actor, fromEmail, note = '') {
  const c = cfg();
  const list = [];
  if (!comment.internal) {
    // Staff replies go to the requester and CCs; email replies from outside go to the assignee.
    if (actor && c.requesterOnReply) list.push(...requester(t), ...(c.watchersOnUpdate ? watchers(t) : []));
    if (c.assigneeOnComment) list.push(...assignee(t));
    if (!actor && c.watchersOnUpdate) list.push(...watchers(t));
  } else if (c.assigneeOnComment) {
    list.push(...assignee(t)); // internal notes stay internal
  }
  if (!list.length) return;
  const by = actor?.name || fromEmail || 'Someone';
  sendAll(list, actorEmail(actor, fromEmail), (r) => {
    const hello = r.name ? `Hello ${r.name},\n\n` : 'Hello,\n\n';
    const kind = comment.internal ? 'added an internal note to' : 'replied on';
    return {
      subject: `Re: [${t.number}] ${t.subject}`,
      text: `${hello}${by} ${kind} ticket ${t.number}:\n\n${comment.text}\n\n${note ? `${note}\n\n` : ''}${summary(t, r.role === 'assignee')}${footer(t)}`,
    };
  });
}

module.exports = { DEFAULTS, onUpdate, onComment, parseEmails };
