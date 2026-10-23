// Who is told about what. One set of personal preferences decides which ticket
// events reach each user; every alert appears in the in-app bell and is also sent
// as a push notification to any devices the user has turned push on for.
const db = require('./db');

const DEFAULT_PREFS = { assigned: true, updates: true, comments: true, mentions: true, newTickets: 'none' }; // newTickets: none | critical | high | all
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
  deliver(ids, t, { title: `New ${t.priority} ticket ${t.number}`, body: t.subject, kind: 'ticket.created', urgent: t.priority === 'Critical' });
  if (t.assigneeId) ticketAssigned(t, actor);
}

function ticketAssigned(t, actor) {
  const u = db.find('users', t.assigneeId);
  if (!u || !u.active || u.id === actor?.id || !prefsFor(u).assigned) return;
  deliver([u.id], t, { title: `${t.number} assigned to you`, body: `${t.subject} · ${t.priority}`, kind: 'ticket.assigned', urgent: t.priority === 'Critical' });
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

module.exports = { DEFAULT_PREFS, prefsFor, ticketCreated, ticketAssigned, ticketUpdated, ticketCommented, mentionedUsers };
