// Browser push notifications (Web Push + VAPID). Each user enables push per device;
// the browser's push service (Google, Mozilla, Apple, Microsoft) delivers the alert
// even when OpsTrack isn't open. The VAPID key pair is generated once and kept in the
// database outside "settings", because settings are sent to every signed-in browser.
const db = require('./db');

const DEFAULT_PREFS = { assigned: true, updates: true, comments: true, newTickets: 'none' }; // newTickets: none | critical | high | all

// Only real push services may be used as endpoints, so a client can't make the
// server send requests to arbitrary (e.g. internal) addresses.
// Chrome currently uses fcm.googleapis.com or *.google.com (e.g. jmt17.google.com/fcm/send/…).
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)google\.com$/, /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];

let webpush = null;
function client() {
  if (!webpush) webpush = require('web-push');
  const st = db.state;
  if (st.settings.vapid) { st.vapid = st.vapid || st.settings.vapid; delete st.settings.vapid; db.save(); }
  if (!st.vapid?.publicKey) {
    st.vapid = webpush.generateVAPIDKeys();
    db.save();
  }
  const url = st.settings.publicUrl;
  const contact = url && /^https:\/\//.test(url) ? url : 'mailto:admin@example.com';
  webpush.setVapidDetails(contact, st.vapid.publicKey, st.vapid.privateKey);
  return webpush;
}

function publicKey() {
  client();
  return db.state.vapid.publicKey;
}

function validEndpoint(url) {
  try {
    const u = new URL(url);
    if (process.env.PUSH_ALLOW_ANY_ENDPOINT === '1') return /^https?:$/.test(u.protocol); // tests only
    return u.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch { return false; }
}

function prefsFor(user) {
  return { ...DEFAULT_PREFS, ...(user.pushPrefs || {}) };
}

function subscribe(user, sub, userAgent) {
  if (!sub || !validEndpoint(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return { error: 'Invalid push subscription' };
  const existing = db.all('pushSubs').find((x) => x.endpoint === sub.endpoint);
  if (existing) db.update('pushSubs', existing.id, { userId: user.id, keys: sub.keys, userAgent });
  else db.insert('pushSubs', { userId: user.id, endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, userAgent: String(userAgent || '').slice(0, 300) });
  return { ok: true };
}

function unsubscribe(user, endpoint) {
  const s = db.all('pushSubs').find((x) => x.endpoint === endpoint && x.userId === user.id);
  if (s) db.remove('pushSubs', s.id);
}

// Sends one notification to every device of the given users. Never throws.
async function sendToUsers(userIds, payload, event = 'push') {
  const ids = new Set(userIds.filter(Boolean));
  const subs = db.where('pushSubs', (x) => ids.has(x.userId));
  if (!subs.length) return { sent: 0, failed: 0 };
  const wp = client();
  let sent = 0; let failed = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await wp.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), {
        // Honour a corporate outbound proxy if one is configured.
        proxy: process.env.HTTPS_PROXY || process.env.https_proxy || undefined,
        TTL: 3600, urgency: payload.urgent ? 'high' : 'normal', topic: payload.tag ? payload.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) : undefined,
      });
      s.lastUsedAt = db.now();
      sent++;
    } catch (e) {
      failed++;
      // 404 / 410: the browser unsubscribed or the subscription expired – forget it.
      if (e.statusCode === 404 || e.statusCode === 410) db.remove('pushSubs', s.id);
      db.log('notifyLog', { channel: 'Browser push', type: 'push', event, ticket: payload.number || null, status: 'failed', detail: `${db.find('users', s.userId)?.name || 'user'}: ${e.statusCode || ''} ${e.body || e.message}`.trim().slice(0, 300) });
    }
  }));
  if (sent) db.log('notifyLog', { channel: 'Browser push', type: 'push', event, ticket: payload.number || null, status: 'sent', detail: `${sent} device(s)` });
  db.save();
  return { sent, failed };
}

function ticketPayload(t, title, body, urgent) {
  return { title, body, url: `/#/tickets/${t.id}`, tag: t.number, number: t.number, urgent: !!urgent };
}

const canSeeAll = (u) => {
  const p = db.find('profiles', u.profileId)?.permissions?.tickets || [];
  return p.includes('viewAll') || p.includes('assign');
};
const PRIORITY_RANK = { critical: ['Critical'], high: ['High', 'Critical'] };

// ---- ticket events (called from the ticket service) ----
function ticketCreated(t, actor) {
  const users = db.where('users', (u) => u.active && u.id !== actor?.id && u.id !== t.assigneeId && canSeeAll(u));
  const ids = users.filter((u) => {
    const p = prefsFor(u).newTickets;
    return p === 'all' || (PRIORITY_RANK[p] || []).includes(t.priority);
  }).map((u) => u.id);
  if (ids.length) sendToUsers(ids, ticketPayload(t, `New ${t.priority} ticket ${t.number}`, t.subject, t.priority === 'Critical'), 'ticket.created');
  if (t.assigneeId) ticketAssigned(t, actor);
}

function ticketAssigned(t, actor) {
  const u = db.find('users', t.assigneeId);
  if (!u || u.id === actor?.id || !prefsFor(u).assigned) return;
  sendToUsers([u.id], ticketPayload(t, `${t.number} assigned to you`, `${t.subject} · ${t.priority}`, t.priority === 'Critical'), 'ticket.assigned');
}

function ticketUpdated(t, before, changes, actor) {
  const u = db.find('users', t.assigneeId);
  if (!u || u.id === actor?.id || before.assigneeId !== t.assigneeId || !prefsFor(u).updates) return;
  sendToUsers([u.id], ticketPayload(t, `${t.number} updated by ${actor?.name || 'OpsTrack'}`, changes.slice(0, 3).join(' · ') || t.subject), false);
}

function ticketCommented(t, comment, actor) {
  const u = db.find('users', t.assigneeId);
  if (!u || (actor && u.id === actor.id) || !prefsFor(u).comments) return;
  const who = actor?.name || comment.authorName || 'Someone';
  sendToUsers([u.id], ticketPayload(t, `${who} ${comment.internal ? 'added a note on' : 'replied on'} ${t.number}`, String(comment.text).slice(0, 140)), false);
}

module.exports = { DEFAULT_PREFS, publicKey, subscribe, unsubscribe, sendToUsers, prefsFor, ticketCreated, ticketAssigned, ticketUpdated, ticketCommented, validEndpoint };
