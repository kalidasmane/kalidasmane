// Populate the database with demo engineers, projects, daily entries and tickets
// so the dashboards have something to show. Run with:  npm run demo
const db = require('../lib/db');
const { hashPassword } = require('../lib/auth');
const { seed } = require('../lib/seed');

db.load();
seed();

if (db.all('projects').length || db.all('users').length > 1) {
  console.log('Demo data skipped: the database already contains projects or extra users.');
  process.exit(0);
}

const prof = (key) => db.all('profiles').find((p) => p.key === key).id;
const admin = db.all('users').find((u) => u.username === 'admin');
const mk = (username, name, profile, managerId, designation, department) => db.insert('users', {
  username, name, email: `${username}@example.com`, passwordHash: hashPassword('Welcome@123'),
  profileId: prof(profile), managerId, designation, department, phone: '', active: true, lastSeen: null,
});

const priya = mk('priya', 'Priya Sharma', 'manager', admin.id, 'Engineering Manager', 'Engineering');
const rahul = mk('rahul', 'Rahul Verma', 'manager', admin.id, 'Support Manager', 'Service Desk');
const team = [
  mk('amit', 'Amit Patil', 'engineer', priya.id, 'Senior Engineer', 'Engineering'),
  mk('sneha', 'Sneha Kulkarni', 'engineer', priya.id, 'Cloud Engineer', 'Engineering'),
  mk('vikram', 'Vikram Rao', 'engineer', priya.id, 'Network Engineer', 'Engineering'),
  mk('neha', 'Neha Joshi', 'support', rahul.id, 'Support Engineer', 'Service Desk'),
  mk('arjun', 'Arjun Mehta', 'support', rahul.id, 'Support Engineer', 'Service Desk'),
];

const projects = [
  ['CLD', 'Cloud Migration', 'Acme Corp', 'migration, azure, aws', '#6366f1', 400],
  ['ERP', 'ERP Upgrade', 'Globex', 'sap, erp', '#10b981', 300],
  ['NOC', 'Network Refresh', 'Initech', 'firewall, switch, network refresh', '#f59e0b', 200],
  ['SEC', 'Security Hardening', 'Umbrella', 'patching, hardening, vapt', '#ef4444', 160],
  ['M365', 'Microsoft 365 Rollout', 'Stark Industries', 'teams, intune, exchange online', '#0ea5e9', 220],
].map(([code, name, client, keywords, color, budgetHours]) => db.insert('projects', {
  code, name, client, keywords, color, budgetHours, status: 'Active', description: `${name} for ${client}.`,
  managerId: priya.id, memberIds: team.map((u) => u.id), startDate: '2026-09-01', endDate: '2026-12-31',
}));

const projActs = ['Design review', 'Implementation', 'Testing and validation', 'Documentation', 'Client status call', 'Deployment', 'Troubleshooting'];
const supportActs = ['Customer query: password reset', 'Customer query: VPN not connecting', 'Customer query: email sync issue', 'Remote session for printer issue', 'Customer query: license request'];
let seedN = 7;
const rnd = () => { seedN = (seedN * 9301 + 49297) % 233280; return seedN / 233280; };
const pickR = (a) => a[Math.floor(rnd() * a.length)];

const today = new Date();
for (let back = 20; back >= 0; back--) {
  const d = new Date(today); d.setDate(d.getDate() - back);
  if ([0, 6].includes(d.getDay())) continue;
  const date = d.toISOString().slice(0, 10);
  for (const u of [...team, priya, rahul]) {
    if (back === 0 && rnd() < 0.3) continue; // some people have not logged today yet
    let left = 480;
    const isSupport = u.department === 'Service Desk';
    while (left > 30) {
      const minutes = Math.min(left, [30, 45, 60, 90, 120, 150][Math.floor(rnd() * 6)]);
      const support = rnd() < (isSupport ? 0.7 : 0.25);
      const meeting = !support && rnd() < 0.12;
      const p = pickR(projects);
      db.insert('timesheets', {
        userId: u.id, date, minutes, billable: !support,
        projectId: support || meeting ? null : p.id, autoDetected: false,
        category: support ? 'Customer Support' : meeting ? 'Meeting' : 'Project Work',
        activity: support ? pickR(supportActs) : meeting ? 'Team stand-up and planning' : `${pickR(projActs)} – ${p.name}`,
        notes: '', ticketId: null, startTime: '', endTime: '', customer: support ? pickR(['Acme Corp', 'Globex', 'Initech']) : '',
      });
      left -= minutes;
    }
  }
}

const tickets = require('../lib/tickets');
const subjects = ['VPN not connecting from home', 'Outlook keeps asking for password', 'New laptop request', 'Printer offline on 3rd floor',
  'Access to SharePoint site', 'Server CPU high alert', 'Teams calls dropping', 'Reset MFA device', 'Install Visio', 'Shared drive is full',
  'Firewall rule change request', 'Azure VM not reachable', 'SAP login error', 'Phishing email reported', 'Wi-Fi slow in meeting room'];
const staff = [...team, null, null];
subjects.forEach((s, i) => {
  const assignee = staff[i % staff.length];
  const t = tickets.create({
    subject: s, description: `${s}. Reported by user.`, priority: pickR(['Low', 'Medium', 'Medium', 'High', 'Critical']),
    category: pickR(['Incident', 'Service Request', 'Query']), assigneeId: assignee?.id || null,
    requesterName: pickR(['John Doe', 'Mary Smith', 'Li Wei', 'Fatima Khan']), requesterEmail: 'user@customer.com',
    projectId: rnd() < 0.3 ? pickR(projects).id : null,
  }, admin, { source: pickR(['web', 'email', 'portal']), skipWorkflows: true });
  if (i % 4 === 0) tickets.update(t, { status: 'Resolved' }, admin, { skipWorkflows: true });
  else if (i % 3 === 0) tickets.update(t, { status: 'In Progress' }, admin, { skipWorkflows: true });
});

db.insert('workflows', {
  name: 'Auto-assign critical incidents', description: 'Critical tickets go to the least-loaded online engineer and the manager is emailed.',
  enabled: true, trigger: 'ticket.created', matchType: 'all', order: 1, runCount: 0,
  conditions: [{ field: 'priority', op: 'equals', value: 'Critical' }],
  actions: [{ type: 'assign_least_loaded', userIds: team.map((u) => u.id), onlineOnly: true },
    { type: 'send_email', to: 'manager', subject: 'Critical ticket {{ticket.number}}', body: '{{ticket.subject}} was assigned to {{assignee.name}}.' }],
});
db.insert('workflows', {
  name: 'Route VPN / network queries', description: 'Anything mentioning VPN or firewall goes to the network engineer.',
  enabled: true, trigger: 'ticket.created', matchType: 'any', order: 2, runCount: 0,
  conditions: [{ field: 'subject', op: 'contains', value: 'vpn, firewall, wi-fi' }],
  actions: [{ type: 'assign_user', userId: team[2].id }, { type: 'set_category', value: 'Incident' }],
});
db.insert('workflows', {
  name: 'Daily server health check ticket', description: 'Creates a health-check ticket every weekday at 09:00.',
  enabled: true, trigger: 'schedule', schedule: { frequency: 'daily', time: '09:00', weekdays: [1, 2, 3, 4, 5] }, order: 3, runCount: 0,
  conditions: [], actions: [{ type: 'create_ticket', subject: 'Daily server health check – {{date}}', description: 'Review monitoring dashboards and backups.', priority: 'Low', category: 'Service Request' },
    { type: 'assign_round_robin', userIds: team.slice(0, 3).map((u) => u.id) }],
});

db.flush();
console.log('Demo data loaded. Demo users (password Welcome@123): priya, rahul, amit, sneha, vikram, neha, arjun');
