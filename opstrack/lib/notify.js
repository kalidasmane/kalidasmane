// Notifications: Microsoft Teams (channel webhook / Workflows), Slack (incoming webhook), WhatsApp and SMS
// (Meta WhatsApp Cloud API or Twilio). Channels subscribe to ticket events and are
// also usable from workflows. Sends are asynchronous and never throw.
const db = require('./db');

const EVENTS = {
  'ticket.created': 'New ticket',
  'ticket.assigned': 'Ticket assigned',
  'sla.warning': 'SLA at risk',
  'sla.breached': 'SLA breached',
};

const TYPES = {
  teams: 'Microsoft Teams',
  slack: 'Slack',
  whatsapp_meta: 'WhatsApp – Meta Cloud API',
  whatsapp_twilio: 'WhatsApp – Twilio',
  sms_twilio: 'SMS – Twilio',
  sms_vonage: 'SMS – Vonage (Nexmo)',
  sms_http: 'SMS – other gateway (HTTP API)',
};

// Secret fields are never sent back to the browser.
const SECRET_FIELDS = ['webhookUrl', 'accessToken', 'authToken', 'apiSecret', 'gatewayUrl', 'gatewayHeader'];

// Fields a WhatsApp template's body placeholders {{1}}, {{2}}, … are filled with, in order.
const TEMPLATE_FIELDS = {
  event: 'Event (New ticket / Ticket assigned / SLA)', number: 'Ticket number', subject: 'Subject',
  priority: 'Priority', category: 'Category', requester: 'Requester', assignee: 'Assignee',
  status: 'Status', link: 'Link to the ticket',
};

const GRAPH_URL = () => process.env.WHATSAPP_GRAPH_URL || 'https://graph.facebook.com/v21.0';
const TWILIO_URL = () => process.env.TWILIO_API_URL || 'https://api.twilio.com/2010-04-01';
const VONAGE_URL = () => process.env.VONAGE_API_URL || 'https://rest.nexmo.com';

function ticketLink(t) {
  const base = String(db.state.settings.publicUrl || '').replace(/\/+$/, '');
  return base && t ? `${base}/#/tickets/${t.id}` : '';
}

function ticketFacts(t, event) {
  const assignee = db.find('users', t.assigneeId);
  return {
    event: EVENTS[event] || 'Ticket update', number: t.number, subject: t.subject,
    priority: require('./sla').label(t.priority), priorityName: t.priority,
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
  const color = { Critical: 'Attention', High: 'Warning' }[f.priorityName || f.priority] || 'Accent';
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

// Slack incoming-webhook message using Block Kit, with a plain-text fallback for notifications.
function slackEscape(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function slackMessage(ch, f, extra) {
  const critical = (f.priorityName || f.priority) === 'Critical';
  const mention = ch.mentionCritical && critical ? '<!here> ' : '';
  const field = (title, value) => ({ type: 'mrkdwn', text: `*${title}*\n${slackEscape(value || '—')}` });
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `${f.event}: ${f.number}`.slice(0, 150), emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: `${mention}*${slackEscape(f.subject)}*` } },
    { type: 'section', fields: [field('Priority', f.priority), field('Category', f.category), field('Status', f.status), field('Requester', f.requester), field('Assignee', f.assignee)] },
  ];
  if (extra) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: slackEscape(extra).slice(0, 2900) } });
  if (f.link) {
    blocks.push({ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open ticket' }, url: f.link, ...(critical ? { style: 'danger' } : { style: 'primary' }) }] });
  }
  return { text: `${mention}${slackEscape(`${f.event}: ${f.number} – ${f.subject} (${f.priority})`)}`, blocks };
}

async function sendSlack(ch, f, extra) {
  await post(ch.webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(slackMessage(ch, f, extra)) });
  return 'posted to Slack';
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

// ---------- SMS ----------
// One short message: up to 3 SMS segments, link last so it is never cut off.
function smsText(f, extra) {
  const brand = db.state.settings.companyName || 'OpsTrack';
  const subject = f.subject.length > 80 ? `${f.subject.slice(0, 77)}...` : f.subject;
  let text = `[${brand}] ${f.event} ${f.number} (${f.priority}): ${subject}. Assignee: ${f.assignee}.${extra ? ` ${extra}` : ''}`;
  const room = 450 - (f.link ? f.link.length + 1 : 0);
  if (text.length > room) text = `${text.slice(0, room - 3)}...`;
  return f.link ? `${text} ${f.link}` : text;
}

async function sendSmsTwilio(ch, f, extra, to) {
  const url = `${TWILIO_URL()}/Accounts/${encodeURIComponent(ch.accountSid)}/Messages.json`;
  const auth = Buffer.from(`${ch.accountSid}:${ch.authToken}`).toString('base64');
  for (const n of to) {
    const form = new URLSearchParams({ To: n.startsWith('+') ? n : `+${n}`, Body: smsText(f, extra) });
    // A Messaging Service SID (MG…) lets Twilio pick the sender; otherwise a phone number / sender ID.
    if (/^MG\w{32}$/.test(ch.fromNumber || '')) form.set('MessagingServiceSid', ch.fromNumber); else form.set('From', ch.fromNumber);
    await post(url, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
  }
  return `sent to ${to.length} phone number(s)`;
}

async function sendSmsVonage(ch, f, extra, to) {
  for (const n of to) {
    const form = new URLSearchParams({ api_key: ch.apiKey, api_secret: ch.apiSecret, from: ch.fromNumber, to: n.replace(/^\+/, ''), text: smsText(f, extra) });
    const body = await post(`${VONAGE_URL()}/sms/json`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
    // Vonage answers HTTP 200 even when a message is rejected; the status is per message.
    let msg = null;
    try { msg = JSON.parse(body).messages?.[0]; } catch { /* not JSON */ }
    if (!msg || String(msg.status) !== '0') throw new Error(`Vonage: ${msg?.['error-text'] || body.slice(0, 200)}`);
  }
  return `sent to ${to.length} phone number(s)`;
}

// Any HTTP SMS gateway: placeholders {to} (+countrycode…), {to_digits} and {message}.
async function sendSmsHttp(ch, f, extra, to) {
  const method = ch.gatewayMethod === 'GET' ? 'GET' : 'POST';
  const json = ch.gatewayContentType === 'json';
  const headers = {};
  for (const line of String(ch.gatewayHeader || '').split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  for (const n of to) {
    const vals = { to: n.startsWith('+') ? n : `+${n}`, to_digits: n.replace(/^\+/, ''), message: smsText(f, extra) };
    const fill = (tpl, enc) => String(tpl || '').replace(/\{(to|to_digits|message)\}/g, (_, k) => enc(vals[k]));
    const url = fill(ch.gatewayUrl, encodeURIComponent);
    const init = { method, headers: { ...headers } };
    if (method === 'POST') {
      init.headers['Content-Type'] = json ? 'application/json' : 'application/x-www-form-urlencoded';
      init.body = fill(ch.gatewayBody, json ? (v) => JSON.stringify(String(v)).slice(1, -1) : encodeURIComponent);
    }
    await post(url, init);
  }
  return `sent to ${to.length} phone number(s)`;
}

// Sends one message on one channel. Returns { ok, detail }.
async function send(ch, facts, { ticket = null, extra = '', event = 'manual' } = {}) {
  let result;
  try {
    let detail;
    if (ch.type === 'teams') detail = await sendTeams(ch, facts, extra);
    else if (ch.type === 'slack') detail = await sendSlack(ch, facts, extra);
    else {
      const to = recipients(ch, ticket);
      if (!to.length) throw new Error('No valid phone numbers (use international format, e.g. +919812345678)');
      const senders = { whatsapp_twilio: sendTwilio, whatsapp_meta: sendMeta, sms_twilio: sendSmsTwilio, sms_vonage: sendSmsVonage, sms_http: sendSmsHttp };
      detail = await senders[ch.type](ch, facts, extra, to);
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
