// Who is told about what. One set of personal preferences decides which ticket
// events reach each user; every alert appears in the in-app bell and is also sent
// as a push notification to any devices the user has turned push on for.
const db = require('./db');

const DEFAULT_PREFS = { assigned: true, updates: true, comments: true, mentions: true, sla: true, approvals: true, newTickets: 'none' }; // newTickets: none | critical | high | all
const PRIORITY_RANK = { critical: ['Critical'], high: ['High', 'Critical'] };

function prefsFor(user) {
  return { ...DEFAULT_PREFS, ...(user.pushPrefs || {}) };
}

const ticketPerms = (u) => db.find('profiles', u.profileId)?.permissions?.tickets || [];
const canSeeAll = (u) => ticketPerms(u).includes('viewAll') || ticketPerms(u).includes('assign');

// Mirrors the ticket visibility rule in server.js, so nobody is sent a link they can't open.
function canSee(u, t) {
  if (!ticketPerms(u).includes('view')) return false;
  if (ticketPerms(u).includes('viewAll') || t.assigneeId === u.id || t.createdById === u.id) return true;
  return require('./auth').reportees(u.id).has(t.assigneeId);
}

function deliver(userIds, t, { title, body, kind, urgent }) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  require('./inbox').add(ids, { title, body, kind, url: `/#/tickets/${t.id}`, ticketId: t.id });
  require('./push').sendToUsers(ids, { title, body, url: `/#/tickets/${t.id}`, tag: t.number, number: t.number, urgent: !!urgent }, kind);
}

function ticketCreated(t, actor) {
  const ids = db.where('users', (u) => u.active && u.id !== actor?.id && u.id !== t.assigneeId && canSeeAll(u))
    .filter((u) => {
      const p = prefsFor(u).newTickets;
      return p === 'all' || (PRIORITY_RANK[p] || []).includes(t.priority);
    }).map((u) => u.id);
  deliver(ids, t, { title: `New ${require('./sla').label(t.priority)} ticket ${t.number}`, body: t.subject, kind: 'ticket.created', urgent: t.priority === 'Critical' });
  if (t.assigneeId) ticketAssigned(t, actor);
}

function ticketAssigned(t, actor) {
  const u = db.find('users', t.assigneeId);
  if (!u || !u.active || u.id === actor?.id || !prefsFor(u).assigned) return;
  deliver([u.id], t, { title: `${t.number} assigned to you`, body: `${t.subject} · ${require('./sla').label(t.priority)}`, kind: 'ticket.assigned', urgent: t.priority === 'Critical' });
}

function ticketUpdated(t, before, changes, actor) {
  const u = db.find('users', t.assigneeId);
  if (!u || !u.active || u.id === actor?.id || before.assigneeId !== t.assigneeId || !prefsFor(u).updates) return;
  deliver([u.id], t, { title: `${t.number} updated by ${actor?.name || 'OpsTrack'}`, body: changes.slice(0, 3).join(' · ') || t.subject, kind: 'ticket.updated' });
}

// @username in a comment notifies that user (if they can see the ticket).
function mentionedUsers(text) {
  const names = new Set([...String(text).matchAll(/(^|[^\w@.])@([A-Za-z0-9][\w.-]{0,40})/g)].map((m) => m[2].replace(/[.-]+$/, '').toLowerCase()));
  return db.where('users', (u) => u.active && names.has(u.username.toLowerCase()));
}

function ticketCommented(t, comment, actor) {
  const who = actor?.name || comment.authorName || 'Someone';
  const snippet = String(comment.text).slice(0, 140);
  const mentioned = mentionedUsers(comment.text).filter((u) => u.id !== actor?.id && canSee(u, t) && prefsFor(u).mentions);
  deliver(mentioned.map((u) => u.id), t, { title: `${who} mentioned you on ${t.number}`, body: snippet, kind: 'mention' });
  const a = db.find('users', t.assigneeId);
  if (!a || !a.active || (actor && a.id === actor.id) || !prefsFor(a).comments || mentioned.some((u) => u.id === a.id)) return;
  deliver([a.id], t, { title: `${who} ${comment.internal ? 'added a note on' : 'replied on'} ${t.number}`, body: snippet, kind: 'comment' });
}

// SLA warnings go to the assignee. Breaches are escalated (ITIL hierarchical escalation):
// the assignee and their reporting manager, or the people who assign tickets if nobody owns it.
function slaEvent(t, kind, target, text) {
  const a = db.find('users', t.assigneeId);
  const ids = [];
  if (a?.active) ids.push(a.id);
  if (kind === 'breached') {
    const sla = require('./sla').cfg();
    if (a && sla.escalateToManager && a.managerId) ids.push(a.managerId);
    if (!a) ids.push(...db.where('users', (u) => u.active && ticketPerms(u).includes('assign')).map((u) => u.id));
  }
  const users = ids.map((id) => db.find('users', id)).filter((u) => u?.active && canSee(u, t) && prefsFor(u).sla);
  deliver(users.map((u) => u.id), t, { title: `${t.number}: ${text}`, body: t.subject, kind: `sla.${kind}`, urgent: kind === 'breached' });
}

// ---------- problems and changes ----------
const RECORD = { problem: { path: 'problems', perm: 'problems' }, change: { path: 'changes', perm: 'changes' } };
const canView = (u, kind) => (db.find('profiles', u.profileId)?.permissions?.[RECORD[kind].perm] || []).includes('view');

function deliverRecord(userIds, rec, kind, { title, body, alertKind, urgent }) {
  const ids = [...new Set(userIds.filter(Boolean))].filter((id) => { const u = db.find('users', id); return u?.active && canView(u, kind); });
  if (!ids.length) return;
  const url = `/#/${RECORD[kind].path}/${rec.id}`;
  require('./inbox').add(ids, { title, body, kind: alertKind, url });
  require('./push').sendToUsers(ids, { title, body, url, tag: rec.number, number: rec.number, urgent: !!urgent }, alertKind);
}

function recordAssigned(rec, actor, kind) {
  const u = db.find('users', rec.assigneeId);
  if (!u || u.id === actor?.id || !prefsFor(u).assigned) return;
  deliverRecord([u.id], rec, kind, { title: `${rec.number} assigned to you`, body: rec.title, alertKind: `${kind}.assigned` });
}

function recordNotice(rec, kind, title, body, actor) {
  const ids = [rec.assigneeId, rec.createdById || rec.requestedById].filter((id) => id && id !== actor?.id && prefsFor(db.find('users', id) || {}).updates);
  deliverRecord(ids, rec, kind, { title, body, alertKind: `${kind}.updated` });
}

// CAB members are asked to approve (bell, push and email).
function changeApprovalRequested(c, actor) {
  const ids = (c.approverIds || []).filter((id) => id !== actor?.id && prefsFor(db.find('users', id) || {}).approvals);
  deliverRecord(ids, c, 'change', {
    title: `Approval needed: ${c.number}${c.type === 'emergency' ? ' (emergency)' : ''}`, body: `${c.title} · risk ${c.risk}`,
    alertKind: 'change.approval', urgent: c.type === 'emergency',
  });
  const link = String(db.state.settings.publicUrl || '').replace(/\/+$/, '');
  for (const u of (c.approverIds || []).map((id) => db.find('users', id)).filter((u) => u?.email && u.id !== actor?.id)) {
    require('./email').sendMail({
      to: u.email,
      subject: `[${c.number}] Approval needed: ${c.title}`,
      text: `Hello ${u.name},\n\n${actor?.name || 'Someone'} asks you to approve ${c.type} change ${c.number}.\n\nTitle: ${c.title}\nRisk: ${c.risk} · Impact: ${c.impact}\n`
        + `Planned: ${c.plannedStart || '—'} → ${c.plannedEnd || '—'} (UTC)\n\nReason:\n${c.reason || '—'}\n\nBackout plan:\n${c.backoutPlan || '—'}\n`
        + `${link ? `\nApprove or reject: ${link}/#/changes/${c.id}\n` : ''}\n— ${db.state.settings.companyName}`,
    });
  }
}

function changeDecision(c, actor, decision) {
  const ids = [c.requestedById, c.assigneeId].filter((id) => id && id !== actor?.id && prefsFor(db.find('users', id) || {}).approvals);
  deliverRecord(ids, c, 'change', { title: `${c.number} ${decision}`, body: c.title, alertKind: `change.${decision}` });
}

module.exports = {
  DEFAULT_PREFS, prefsFor, ticketCreated, ticketAssigned, ticketUpdated, ticketCommented, mentionedUsers, slaEvent,
  recordAssigned, recordNotice, changeApprovalRequested, changeDecision,
};
