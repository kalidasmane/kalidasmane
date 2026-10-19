// Remote desktop integration: builds the URL that opens a device in the
// configured remote-management server (MeshCentral, Apache Guacamole or any
// tool reachable by URL) and turns finished sessions into tracker entries.
const db = require('./db');

const PROVIDERS = {
  meshcentral: {
    label: 'MeshCentral (self-hosted, free – desktop, terminal and files)',
    modes: { desktop: 'Remote desktop', terminal: 'Terminal', files: 'Files' },
    idLabel: 'MeshCentral node ID',
  },
  guacamole: {
    label: 'Apache Guacamole (self-hosted, free – RDP, VNC and SSH in the browser)',
    modes: { desktop: 'Remote session' },
    idLabel: 'Guacamole connection ID',
  },
  custom: {
    label: 'Other tool (URL template)',
    modes: { desktop: 'Remote session' },
    idLabel: 'Remote ID',
  },
};

const MESH_VIEWMODE = { desktop: 11, terminal: 12, files: 13 };

const settings = () => db.state.settings.remote || {};

function cleanBase(url) {
  const u = String(url || '').trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(u) ? u : '';
}

// Returns { url } or { error } for a device and mode.
function connectUrl(device, mode = 'desktop') {
  const s = settings();
  const provider = PROVIDERS[s.provider] ? s.provider : null;
  if (!provider) return { error: 'Remote desktop is not configured. An administrator can set it up under Settings → Remote Desktop.' };
  if (!device.remoteId) return { error: `This device has no ${PROVIDERS[provider].idLabel}. Edit the device to add it.` };
  const base = cleanBase(s.serverUrl);
  if (provider !== 'custom' && !base) return { error: 'The remote desktop server address is missing or invalid in Settings → Remote Desktop.' };
  const id = String(device.remoteId).trim();

  if (provider === 'meshcentral') {
    // MeshCentral accepts the short node id (the part after "node/<domain>/").
    const short = id.replace(/^node\/[^/]*\//, '');
    const q = new URLSearchParams({ gotonode: short, viewmode: String(MESH_VIEWMODE[mode] || 11), hide: s.embed === false ? '0' : '31' });
    return { url: `${base}/?${q}` };
  }
  if (provider === 'guacamole') {
    const token = Buffer.from(`${id}\0c\0${s.guacDataSource || 'mysql'}`).toString('base64');
    return { url: `${base}/#/client/${encodeURIComponent(token)}` };
  }
  const tpl = String(s.urlTemplate || '');
  const url = tpl
    .replace(/\{id\}/g, encodeURIComponent(id))
    .replace(/\{host\}/g, encodeURIComponent(device.host || ''))
    .replace(/\{name\}/g, encodeURIComponent(device.name || ''))
    .replace(/\{mode\}/g, encodeURIComponent(mode));
  if (!/^https?:\/\//i.test(url)) return { error: 'The custom URL template must start with http:// or https:// (Settings → Remote Desktop).' };
  return { url };
}

// Ends a session and, if enabled, records the time in the Daily Tracker.
function endSession(session, notes) {
  if (session.endedAt) return session;
  const ended = new Date();
  session.endedAt = ended.toISOString();
  session.minutes = Math.max(1, Math.round((ended - new Date(session.startedAt)) / 60000));
  if (notes !== undefined) session.notes = String(notes || '').slice(0, 2000);
  const s = settings();
  if (s.logToTracker !== false) {
    const device = db.find('devices', session.deviceId);
    const ticket = session.ticketId ? db.find('tickets', session.ticketId) : null;
    const modeLabel = (PROVIDERS[s.provider]?.modes || PROVIDERS.meshcentral.modes)[session.mode] || 'Remote session';
    const entry = db.insert('timesheets', {
      userId: session.userId,
      date: `${ended.getFullYear()}-${String(ended.getMonth() + 1).padStart(2, '0')}-${String(ended.getDate()).padStart(2, '0')}`,
      minutes: session.minutes,
      projectId: device?.projectId || ticket?.projectId || null,
      autoDetected: false,
      category: s.trackerCategory || 'Customer Support',
      activity: `${modeLabel} – ${device?.name || 'device'}${ticket ? ` (${ticket.number})` : ''}`,
      notes: session.notes || '',
      ticketId: ticket?.id || null,
      startTime: '', endTime: '',
      billable: false,
      customer: device?.customer || '',
      remoteSessionId: session.id,
    });
    session.timesheetId = entry.id;
  }
  db.save();
  return session;
}

module.exports = { PROVIDERS, connectUrl, endSession };
