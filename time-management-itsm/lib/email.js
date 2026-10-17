// Email channels: outbound (SMTP) notifications and inbound (IMAP) email-to-ticket.
// Works with any cloud or on-premises mail system that speaks SMTP / IMAP.
const db = require('./db');

const PROVIDERS = {
  m365: {
    label: 'Microsoft 365 / Exchange Online (Cloud)',
    smtp: { host: 'smtp.office365.com', port: 587, secure: false },
    imap: { host: 'outlook.office365.com', port: 993, secure: true },
  },
  google: {
    label: 'Google Workspace / Gmail (Cloud)',
    smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
    imap: { host: 'imap.gmail.com', port: 993, secure: true },
  },
  zoho: {
    label: 'Zoho Mail (Cloud)',
    smtp: { host: 'smtp.zoho.com', port: 465, secure: true },
    imap: { host: 'imap.zoho.com', port: 993, secure: true },
  },
  ses: {
    label: 'Amazon SES (Cloud, outbound)',
    smtp: { host: 'email-smtp.us-east-1.amazonaws.com', port: 587, secure: false },
    imap: null,
  },
  sendgrid: {
    label: 'SendGrid (Cloud, outbound)',
    smtp: { host: 'smtp.sendgrid.net', port: 587, secure: false },
    imap: null,
  },
  exchange: {
    label: 'Microsoft Exchange Server (On-Premises)',
    smtp: { host: 'mail.yourcompany.local', port: 587, secure: false },
    imap: { host: 'mail.yourcompany.local', port: 993, secure: true },
  },
  custom: {
    label: 'Other SMTP / IMAP server (Cloud or On-Premises)',
    smtp: { host: '', port: 587, secure: false },
    imap: { host: '', port: 993, secure: true },
  },
};

function transportFor(acc) {
  const nodemailer = require('nodemailer');
  const auth = acc.authType === 'oauth2'
    ? { type: 'OAuth2', user: acc.username, accessToken: acc.password }
    : (acc.username ? { user: acc.username, pass: acc.password } : undefined);
  return nodemailer.createTransport({
    host: acc.host, port: Number(acc.port), secure: !!acc.secure, auth,
    tls: { rejectUnauthorized: !acc.allowSelfSigned },
    connectionTimeout: 15000,
  });
}

function imapClientFor(acc) {
  const { ImapFlow } = require('imapflow');
  const auth = acc.authType === 'oauth2'
    ? { user: acc.username, accessToken: acc.password }
    : { user: acc.username, pass: acc.password };
  return new ImapFlow({
    host: acc.host, port: Number(acc.port), secure: !!acc.secure, auth, logger: false,
    tls: { rejectUnauthorized: !acc.allowSelfSigned },
  });
}

function defaultOutbound() {
  return db.all('emailAccounts').find((a) => a.direction === 'outbound' && a.enabled && a.isDefault)
    || db.all('emailAccounts').find((a) => a.direction === 'outbound' && a.enabled);
}

// Send an email through the default (or given) outbound channel.
// Always recorded in the email log; never throws.
async function sendMail({ to, subject, text, accountId }) {
  const acc = accountId ? db.find('emailAccounts', accountId) : defaultOutbound();
  const entry = { direction: 'out', to, subject, account: acc ? acc.name : null };
  if (!to) return;
  if (!acc) {
    db.log('emailLog', { ...entry, status: 'skipped', detail: 'No outbound email channel configured' });
    return;
  }
  try {
    await transportFor(acc).sendMail({
      from: acc.fromName ? `"${acc.fromName}" <${acc.fromAddress || acc.username}>` : (acc.fromAddress || acc.username),
      to, subject, text,
    });
    db.log('emailLog', { ...entry, status: 'sent' });
  } catch (e) {
    db.log('emailLog', { ...entry, status: 'failed', detail: e.message });
  }
}

async function testAccount(acc) {
  if (acc.direction === 'outbound') {
    await transportFor(acc).verify();
    return 'SMTP connection and authentication succeeded.';
  }
  const client = imapClientFor(acc);
  await client.connect();
  const box = await client.mailboxOpen(acc.folder || 'INBOX');
  await client.logout();
  return `IMAP connected. ${box.exists} message(s) in ${acc.folder || 'INBOX'}.`;
}

// Fetch unseen messages and turn them into tickets (or comments on existing tickets).
async function pollInbound(acc) {
  const { simpleParser } = require('mailparser');
  const tickets = require('./tickets');
  const client = imapClientFor(acc);
  let created = 0; let updated = 0;
  await client.connect();
  const lock = await client.getMailboxLock(acc.folder || 'INBOX');
  try {
    const uids = await client.search({ seen: false }, { uid: true });
    for (const uidNum of uids || []) {
      const msg = await client.fetchOne(uidNum, { source: true }, { uid: true });
      const mail = await simpleParser(msg.source);
      const from = mail.from?.value?.[0] || {};
      const res = tickets.fromEmail({
        subject: mail.subject || '(no subject)', text: (mail.text || '').trim(),
        fromEmail: from.address, fromName: from.name, account: acc,
      });
      res.created ? created++ : updated++;
      await client.messageFlagsAdd(uidNum, ['\\Seen'], { uid: true });
    }
  } finally {
    lock.release();
    await client.logout();
  }
  db.update('emailAccounts', acc.id, { lastPolledAt: db.now(), lastError: null });
  db.log('emailLog', { direction: 'in', account: acc.name, status: 'polled', detail: `${created} new ticket(s), ${updated} reply(ies)` });
  return { created, updated };
}

let pollTimer = null;
const polling = new Set();
function startInboundPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    const t = Date.now();
    for (const acc of db.all('emailAccounts')) {
      if (acc.direction !== 'inbound' || !acc.enabled || polling.has(acc.id)) continue;
      const every = Math.max(1, Number(acc.pollMinutes) || 5) * 60000;
      if (acc.lastPolledAt && t - new Date(acc.lastPolledAt).getTime() < every) continue;
      polling.add(acc.id);
      pollInbound(acc)
        .catch((e) => {
          db.update('emailAccounts', acc.id, { lastPolledAt: db.now(), lastError: e.message });
          db.log('emailLog', { direction: 'in', account: acc.name, status: 'failed', detail: e.message });
        })
        .finally(() => polling.delete(acc.id));
    }
  }, 30000);
}

module.exports = { PROVIDERS, sendMail, testAccount, pollInbound, startInboundPolling };
