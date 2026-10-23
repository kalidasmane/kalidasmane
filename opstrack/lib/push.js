// Browser push notifications (Web Push + VAPID) – delivery only; lib/alerts.js decides who
// is notified. Each user enables push per device;
// the browser's push service (Google, Mozilla, Apple, Microsoft) delivers the alert
// even when OpsTrack isn't open. The VAPID key pair is generated once and kept in the
// database outside "settings", because settings are sent to every signed-in browser.
const db = require('./db');

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

module.exports = { publicKey, subscribe, unsubscribe, sendToUsers, validEndpoint };
