// Chat notifications: Microsoft Teams (channel webhook / Workflows) and WhatsApp
// (Meta WhatsApp Cloud API or Twilio). Channels subscribe to ticket events and are
// also usable from workflows. Sends are asynchronous and never throw.
const db = require('./db');

const EVENTS = {
  'ticket.created': 'New ticket',
  'ticket.assigned': 'Ticket assigned',
};

const TYPES = {
  teams: 'Microsoft Teams',
  whatsapp_meta: 'WhatsApp – Meta Cloud API',
  whatsapp_twilio: 'WhatsApp – Twilio',
};

// Secret fields are never sent back to the browser.
const SECRET_FIELDS = ['webhookUrl', 'accessToken', 'authToken'];

// Fields a WhatsApp template's body placeholders {{1}}, {{2}}, … are filled with, in order.
const TEMPLATE_FIELDS = {
  event: 'Event (New ticket / Ticket assigned)', number: 'Ticket number', subject: 'Subject',
  priority: 'Priority', category: 'Category', requester: 'Requester', assignee: 'Assignee',
  status: 'Status', link: 'Link to the ticket',
};

const GRAPH_URL = () => process.env.WHATSAPP_GRAPH_URL || 'https://graph.facebook.com/v21.0';
const TWILIO_URL = () => process.env.TWILIO_API_URL || 'https://api.twilio.com/2010-04-01';

function ticketLink(t) {
  const base = String(db.state.settings.publicUrl || '').replace(/\/+$/, '');
  return base && t ? `${base}/#/tickets/${t.id}` : '';
}

function ticketFacts(t, event) {
  const assignee = db.find('users', t.assigneeId);
  return {
    event: EVENTS[event] || 'Ticket update', number: t.number, subject: t.subject, priority: t.priority,
    category: t.category, status: t.status, requester: t.requesterName || t.requesterEmail || '—',
    assignee: assignee?.name || 'Unassigned', link: ticketLink(t),
  };
}

function plainText(f, extra) {
  return [
    `${f.event}: ${f.number} – ${f.subject}`,
    `Priority: ${f.priority} · Category: ${f.category}`,
    `Requester: ${f.requester} · Assignee: ${f.assignee}`,
    extra || '',
    f.link,
  ].filter(Boolean).join('\n');
}

// Adaptive Card accepted by both classic Teams incoming webhooks and Teams "Workflows" webhooks.
function teamsCard(f, extra) {
  const color = { Critical: 'Attention', High: 'Warning' }[f.priority] || 'Accent';
  const card = {
    type: 'AdaptiveCard', $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', version: '1.4',
    body: [
      { type: 'TextBlock', text: `${f.event} · ${f.number}`, size: 'Small', weight: 'Bolder', color },
      { type: 'TextBlock', text: f.subject, size: 'Large', weight: 'Bolder', wrap: true },
      { type: 'FactSet', facts: [
        { title: 'Priority', value: f.priority }, { title: 'Category', value: f.category },
        { title: 'Status', value: f.status }, { title: 'Requester', value: f.requester },
        { title: 'Assignee', value: f.assignee },
      ] },
      ...(extra ? [{ type: 'TextBlock', text: extra, wrap: true }] : []),
    ],
    actions: f.link ? [{ type: 'Action.OpenUrl', title: 'Open ticket', url: f.link }] : [],
  };
  return { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: card }] };
}

function recipients(ch, t) {
  // One number per line, or separated by commas / semicolons; spaces inside a number are fine.
  const list = String(ch.recipients || '').split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
  if (ch.notifyAssignee && t) {
    const phone = db.find('users', t.assigneeId)?.phone;
    if (phone) list.push(phone);
  }
  return [...new Set(list.map((n) => n.replace(/[^\d+]/g, '')).filter((n) => /^\+?\d{8,15}$/.test(n)))];
}

async function post(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  return body;
}

async function sendTeams(ch, f, extra) {
  await post(ch.webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(teamsCard(f, extra)) });
  return 'posted to Teams';
}

async function sendMeta(ch, f, extra, to) {
  const url = `${GRAPH_URL()}/${encodeURIComponent(ch.phoneNumberId)}/messages`;
  const fields = String(ch.templateFields || 'number,subject,priority,assignee').split(',').map((x) => x.trim()).filter(Boolean);
  for (const n of to) {
    const message = ch.messageMode === 'text'
      ? { type: 'text', text: { body: plainText(f, extra), preview_url: false } }
      : { type: 'template', template: { name: ch.templateName, language: { code: ch.templateLanguage || 'en' },
        components: fields.length ? [{ type: 'body', parameters: fields.map((k) => ({ type: 'text', text: String(f[k] ?? '').slice(0, 1000) || '-' })) }] : [] } };
    await post(url, {
      method: 'POST', headers: { Authorization: `Bearer ${ch.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: n.replace(/^\+/, ''), ...message }),
    });
  }
  return `sent to ${to.length} WhatsApp number(s)`;
}

async function sendTwilio(ch, f, extra, to) {
  const url = `${TWILIO_URL()}/Accounts/${encodeURIComponent(ch.accountSid)}/Messages.json`;
  const auth = Buffer.from(`${ch.accountSid}:${ch.authToken}`).toString('base64');
  const fields = String(ch.templateFields || 'number,subject,priority,assignee').split(',').map((x) => x.trim()).filter(Boolean);
  const from = String(ch.fromNumber || '').replace(/^whatsapp:/, '');
  for (const n of to) {
    const form = new URLSearchParams({ From: `whatsapp:${from}`, To: `whatsapp:${n.startsWith('+') ? n : `+${n}`}` });
    if (ch.messageMode === 'text') form.set('Body', plainText(f, extra));
    else {
      form.set('ContentSid', ch.contentSid);
      form.set('ContentVariables', JSON.stringify(Object.fromEntries(fields.map((k, i) => [String(i + 1), String(f[k] ?? '') || '-']))));
    }
    await post(url, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
  }
  return `sent to ${to.length} WhatsApp number(s)`;
}

// Sends one message on one channel. Returns { ok, detail }.
async function send(ch, facts, { ticket = null, extra = '', event = 'manual' } = {}) {
  let result;
  try {
    let detail;
    if (ch.type === 'teams') detail = await sendTeams(ch, facts, extra);
    else {
      const to = recipients(ch, ticket);
      if (!to.length) throw new Error('No valid WhatsApp numbers (use international format, e.g. +919812345678)');
      detail = ch.type === 'whatsapp_twilio' ? await sendTwilio(ch, facts, extra, to) : await sendMeta(ch, facts, extra, to);
    }
    result = { ok: true, detail };
  } catch (e) {
    result = { ok: false, detail: e.name === 'TimeoutError' ? 'Timed out after 15 s' : e.message };
  }
  db.log('notifyLog', { channelId: ch.id, channel: ch.name, type: ch.type, event, ticket: ticket?.number || null, status: result.ok ? 'sent' : 'failed', detail: result.detail });
  return result;
}

function wants(ch, event, t) {
  if (!ch.enabled || !(ch.events || []).includes(event)) return false;
  return !(ch.priorities || []).length || ch.priorities.includes(t.priority);
}

// Ticket events. Called from the ticket service; fire-and-forget.
function ticketEvent(event, t) {
  for (const ch of db.all('notifyChannels')) {
    if (wants(ch, event, t)) send(ch, ticketFacts(t, event), { ticket: t, event });
  }
}

function test(ch) {
  const sample = {
    event: 'Test message', number: `${db.state.settings.ticketPrefix}-TEST`, subject: 'OpsTrack notification test',
    priority: 'High', category: 'Incident', status: 'New', requester: 'OpsTrack', assignee: 'Unassigned',
    link: String(db.state.settings.publicUrl || '').replace(/\/+$/, ''),
  };
  return send(ch, sample, { event: 'test', extra: 'If you can read this, the channel works.' });
}

function mask(ch) {
  const out = { ...ch };
  for (const k of SECRET_FIELDS) if (out[k]) out[k] = '********';
  return out;
}

module.exports = { EVENTS, TYPES, TEMPLATE_FIELDS, SECRET_FIELDS, ticketEvent, ticketFacts, send, test, mask };
