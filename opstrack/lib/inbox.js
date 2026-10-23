// In-app notifications ("the bell"): stored per user, delivered live to open
// browser tabs over Server-Sent Events, and capped so the list stays small.
const db = require('./db');

const MAX_PER_USER = 200;
const clients = new Map(); // userId -> Set of open SSE responses

function unreadCount(userId) {
  return db.where('inbox', (n) => n.userId === userId && !n.read).length;
}

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// Stores one notification for each user and pushes it to their open tabs.
function add(userIds, item) {
  const ids = [...new Set(userIds.filter(Boolean))];
  for (const userId of ids) {
    const n = db.insert('inbox', {
      userId, read: false, kind: item.kind || 'info', title: String(item.title).slice(0, 200),
      body: String(item.body || '').slice(0, 300), url: item.url || '', ticketId: item.ticketId || null,
    });
    const mine = db.all('inbox').filter((x) => x.userId === userId);
    if (mine.length > MAX_PER_USER) {
      const drop = new Set(mine.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(MAX_PER_USER).map((x) => x.id));
      db.state.inbox = db.all('inbox').filter((x) => !drop.has(x.id));
    }
    for (const res of clients.get(userId) || []) send(res, 'notification', { item: n, unread: unreadCount(userId) });
  }
  db.save();
}

function list(userId, limit = 50) {
  return db.where('inbox', (n) => n.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

function markRead(userId, ids) {
  const all = ids === 'all';
  const set = new Set(Array.isArray(ids) ? ids : []);
  let changed = 0;
  for (const n of db.all('inbox')) {
    if (n.userId === userId && !n.read && (all || set.has(n.id))) { n.read = true; changed++; }
  }
  if (changed) {
    db.save();
    const unread = unreadCount(userId);
    for (const res of clients.get(userId) || []) send(res, 'read', { unread }); // sync other tabs
  }
  return unreadCount(userId);
}

// Express handler for GET /api/notifications/stream
function stream(req, res) {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const uid = req.user.id;
  if (!clients.has(uid)) clients.set(uid, new Set());
  clients.get(uid).add(res);
  send(res, 'hello', { unread: unreadCount(uid) });
  // Comment lines keep proxies (Render, nginx, Caddy) from closing an idle connection.
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    clients.get(uid)?.delete(res);
  });
}

function disconnectUser(userId) {
  for (const res of clients.get(userId) || []) res.end();
  clients.delete(userId);
}

module.exports = { add, list, markRead, unreadCount, stream, disconnectUser };
