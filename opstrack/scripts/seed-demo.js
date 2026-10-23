// Populate the database with demo roles, team members, projects, ticket types,
// tickets, devices, remote sessions, daily tracker entries and workflows so every screen has realistic data.
// Run with:  npm run demo   (works with the JSON file or DATABASE_URL)
const db = require('../lib/db');
const { hashPassword } = require('../lib/auth');
const { seed } = require('../lib/seed');

const DEMO_PASSWORD = 'Welcome@123';

// ---------- ticket types (12) ----------
const TICKET_TYPES = [
  'Incident', 'Service Request', 'Problem', 'Change Request', 'Access Request', 'Hardware',
  'Software Installation', 'Network', 'Security', 'Email & Collaboration', 'Password Reset', 'Query',
];

// ---------- roles / profiles (9 added to the 4 built-in = 13) ----------
const ROLES = [
  { key: 'pm', name: 'Project Manager', color: '#8b5cf6', description: 'Owns projects, budgets and effort reporting.',
    permissions: { dashboard: ['view'], timesheet: ['view', 'create', 'edit', 'delete', 'viewAll'], tickets: ['view', 'create', 'edit', 'viewAll'], projects: ['view', 'create', 'edit', 'delete'], reports: ['view'], users: ['view'] } },
  { key: 'lead', name: 'Team Lead', color: '#06b6d4', description: 'Leads a squad, assigns tickets and reviews the team’s daily entries.',
    permissions: { dashboard: ['view'], timesheet: ['view', 'create', 'edit', 'delete'], tickets: ['view', 'create', 'edit', 'viewAll', 'assign'], projects: ['view'], reports: ['view'], users: ['view'] } },
  { key: 'l2', name: 'L2 Support Engineer', color: '#f97316', description: 'Handles escalated incidents and problems.',
    permissions: { dashboard: ['view'], timesheet: ['view', 'create', 'edit', 'delete'], tickets: ['view', 'create', 'edit', 'viewAll', 'assign'], projects: ['view'] } },
  { key: 'network', name: 'Network Engineer', color: '#eab308', description: 'Network, firewall and VPN work plus related tickets.',
    permissions: { dashboard: ['view'], timesheet: ['view', 'create', 'edit', 'delete'], tickets: ['view', 'create', 'edit'], projects: ['view'] } },
  { key: 'cloud', name: 'Cloud / DevOps Engineer', color: '#3b82f6', description: 'Cloud platforms, CI/CD and infrastructure projects.',
    permissions: { dashboard: ['view'], timesheet: ['view', 'create', 'edit', 'delete'], tickets: ['view', 'create', 'edit'], projects: ['view'] } },
  { key: 'security', name: 'Security Analyst', color: '#dc2626', description: 'Security incidents, hardening and compliance projects.',
    permissions: { dashboard: ['view'], timesheet: ['view', 'create', 'edit', 'delete'], tickets: ['view', 'create', 'edit', 'viewAll'], projects: ['view'], reports: ['view'] } },
  { key: 'auditor', name: 'Auditor (read-only)', color: '#64748b', description: 'Read-only access to dashboards, reports and all data.',
    permissions: { dashboard: ['view'], timesheet: ['view', 'viewAll'], tickets: ['view', 'viewAll'], projects: ['view'], reports: ['view'], users: ['view'], profiles: ['view'], workflows: ['view'], settings: ['view'] } },
  { key: 'intern', name: 'Intern', color: '#a3a3a3', description: 'Logs daily work and views own tickets only.',
    permissions: { dashboard: ['view'], timesheet: ['view', 'create', 'edit'], tickets: ['view'], projects: ['view'] } },
  { key: 'csm', name: 'Customer Success', color: '#ec4899', description: 'Raises tickets for customers and follows them up.',
    permissions: { dashboard: ['view'], timesheet: ['view', 'create', 'edit', 'delete'], tickets: ['view', 'create', 'edit', 'viewAll'], projects: ['view'], forms: ['view'] } },
];

// ---------- team members (15) ----------
// [username, name, role key, manager username, designation, department]
const PEOPLE = [
  ['priya', 'Priya Sharma', 'manager', 'admin', 'Engineering Manager', 'Engineering'],
  ['rahul', 'Rahul Verma', 'manager', 'admin', 'Service Desk Manager', 'Service Desk'],
  ['anjali', 'Anjali Desai', 'pm', 'admin', 'Project Manager', 'PMO'],
  ['karan', 'Karan Singh', 'lead', 'priya', 'Cloud Team Lead', 'Engineering'],
  ['meera', 'Meera Iyer', 'lead', 'rahul', 'Service Desk Team Lead', 'Service Desk'],
  ['amit', 'Amit Patil', 'engineer', 'karan', 'Senior Systems Engineer', 'Engineering'],
  ['sneha', 'Sneha Kulkarni', 'cloud', 'karan', 'Cloud Engineer', 'Engineering'],
  ['sameer', 'Sameer Khan', 'cloud', 'karan', 'DevOps Engineer', 'Engineering'],
  ['vikram', 'Vikram Rao', 'network', 'priya', 'Network Engineer', 'Engineering'],
  ['rohan', 'Rohan Gupta', 'security', 'priya', 'Security Analyst', 'Security'],
  ['pooja', 'Pooja Nair', 'l2', 'meera', 'L2 Support Engineer', 'Service Desk'],
  ['neha', 'Neha Joshi', 'support', 'meera', 'L1 Support Agent', 'Service Desk'],
  ['arjun', 'Arjun Mehta', 'support', 'meera', 'L1 Support Agent', 'Service Desk'],
  ['fatima', 'Fatima Shaikh', 'intern', 'amit', 'IT Intern', 'Engineering'],
  ['lakshmi', 'Lakshmi Rao', 'auditor', 'admin', 'Compliance Auditor', 'Governance'],
];

// ---------- projects (13) ----------
// [code, name, client, keywords, colour, budget hours, status, PM username, member usernames]
const PROJECTS = [
  ['CLD', 'Cloud Migration', 'Acme Corp', 'migration, azure, aws', '#6366f1', 400, 'Active', 'anjali', ['karan', 'sneha', 'sameer', 'amit']],
  ['ERP', 'ERP Upgrade', 'Globex', 'sap, erp', '#10b981', 300, 'Active', 'anjali', ['amit', 'pooja', 'fatima']],
  ['NOC', 'Network Refresh', 'Initech', 'firewall, switch, network refresh', '#f59e0b', 200, 'Active', 'priya', ['vikram', 'amit']],
  ['SEC', 'Security Hardening', 'Umbrella Corp', 'patching, hardening, vapt', '#ef4444', 160, 'Active', 'priya', ['rohan', 'vikram']],
  ['M365', 'Microsoft 365 Rollout', 'Stark Industries', 'teams, intune, exchange online', '#0ea5e9', 220, 'Active', 'anjali', ['pooja', 'neha', 'sneha']],
  ['DRS', 'Disaster Recovery Setup', 'Wayne Enterprises', 'disaster recovery, failover, dr drill', '#14b8a6', 180, 'Active', 'priya', ['sameer', 'amit']],
  ['WAN', 'SD-WAN Deployment', 'Cyberdyne Systems', 'sd-wan, sdwan, branch office', '#84cc16', 150, 'Active', 'priya', ['vikram']],
  ['ITAM', 'IT Asset Management', 'Internal IT', 'asset register, cmdb, inventory', '#a855f7', 90, 'Active', 'rahul', ['meera', 'arjun', 'fatima']],
  ['VDI', 'Virtual Desktop Rollout', 'Hooli', 'vdi, citrix, avd', '#f43f5e', 140, 'Active', 'anjali', ['sneha', 'pooja']],
  ['SIEM', 'SIEM Implementation', 'Umbrella Corp', 'siem, sentinel, splunk', '#e11d48', 120, 'Planned', 'priya', ['rohan']],
  ['BKP', 'Backup Modernisation', 'Globex', 'veeam, backup job, retention', '#22c55e', 100, 'On Hold', 'anjali', ['sameer']],
  ['K8S', 'Kubernetes Platform', 'Initech', 'kubernetes, aks, helm', '#2563eb', 260, 'Active', 'karan', ['sameer', 'sneha', 'karan']],
  ['CRM', 'CRM Integration', 'Soylent Corp', 'crm, dynamics, salesforce', '#d946ef', 80, 'Completed', 'anjali', ['amit']],
];

// ---------- devices (12) ----------
// [name, type, os, host, customer, location, project code|null, responsible username, tags]
const DEVICES = [
  ['ACME-LT-042', 'Laptop', 'Windows 11 Pro', '10.10.4.42', 'Acme Corp', 'Pune office', 'CLD', 'sneha', 'vip'],
  ['ACME-WS-017', 'Workstation', 'Windows 10 Enterprise', '10.10.4.17', 'Acme Corp', 'Pune office', null, 'neha', ''],
  ['GLOBEX-SAP-APP01', 'Server', 'Windows Server 2022', '172.16.1.21', 'Globex', 'Mumbai DC', 'ERP', 'amit', 'production, sap'],
  ['GLOBEX-SQL-02', 'Server', 'Windows Server 2019', '172.16.1.32', 'Globex', 'Mumbai DC', null, 'amit', 'production, database'],
  ['INITECH-FW-01', 'Firewall', 'FortiOS 7.4', '192.168.0.1', 'Initech', 'Bengaluru branch', 'NOC', 'vikram', 'network'],
  ['INITECH-CORE-SW1', 'Network device', 'Cisco IOS-XE 17', '192.168.0.2', 'Initech', 'Bengaluru branch', 'NOC', 'vikram', 'network'],
  ['UMB-WEB-01', 'Virtual machine', 'Ubuntu 22.04 LTS', '10.20.0.11', 'Umbrella Corp', 'Azure Central India', 'SEC', 'rohan', 'production, web'],
  ['STARK-LT-108', 'Laptop', 'Windows 11 Pro', 'stark-lt-108', 'Stark Industries', 'Remote worker', 'M365', 'pooja', ''],
  ['HOOLI-VDI-HOST1', 'Server', 'Windows Server 2022', '10.30.2.5', 'Hooli', 'Hyderabad DC', 'VDI', 'sneha', 'vdi'],
  ['INITECH-K8S-NODE3', 'Virtual machine', 'Ubuntu 24.04 LTS', '10.40.0.13', 'Initech', 'AWS ap-south-1', 'K8S', 'sameer', 'kubernetes'],
  ['IT-PRN-FL2', 'Printer', 'HP firmware 5.6', '10.0.2.50', 'Internal IT', 'Head office, 2nd floor', 'ITAM', 'arjun', ''],
  ['IT-LT-OLD-003', 'Laptop', 'Windows 10 Pro', '', 'Internal IT', 'Store room', 'ITAM', 'meera', 'retired'],
];

// ---------- tickets (15) ----------
// [subject, type, priority, status, assignee username|null, source, requester, project code|null]
const TICKETS = [
  ['Production web server down after patching', 'Incident', 'Critical', 'In Progress', 'pooja', 'email', 'John Doe', 'SEC'],
  ['VPN not connecting from home office', 'Network', 'High', 'Open', 'vikram', 'portal', 'Mary Smith', null],
  ['New laptop for joiner in Finance', 'Hardware', 'Medium', 'New', 'neha', 'form', 'Li Wei', null],
  ['Grant access to the HR SharePoint site', 'Access Request', 'Medium', 'Open', 'neha', 'web', 'Fatima Khan', 'M365'],
  ['Install Visio and Power BI Desktop', 'Software Installation', 'Low', 'Resolved', 'arjun', 'portal', 'Carlos Gomez', null],
  ['Outlook keeps asking for a password', 'Email & Collaboration', 'Medium', 'In Progress', 'neha', 'email', 'Aisha Bello', 'M365'],
  ['Reset MFA and password for a locked account', 'Password Reset', 'High', 'Resolved', 'arjun', 'web', 'Tom Becker', null],
  ['Phishing email reported by several users', 'Security', 'Critical', 'Open', 'rohan', 'email', 'Security Mailbox', 'SEC'],
  ['Recurring disk-full alerts on the SQL cluster', 'Problem', 'High', 'On Hold', 'amit', 'automation', 'Monitoring', null],
  ['Firewall rule change for the new payment API', 'Change Request', 'High', 'New', 'vikram', 'form', 'Dev Team', 'NOC'],
  ['Azure VM not reachable after resize', 'Incident', 'High', 'Open', 'sneha', 'web', 'Acme Corp', 'CLD'],
  ['SAP login error after the ERP upgrade', 'Incident', 'Critical', 'In Progress', 'amit', 'email', 'Globex Finance', 'ERP'],
  ['Shared drive quota increase for Marketing', 'Service Request', 'Low', 'Closed', 'meera', 'portal', 'Nina Patel', null],
  ['How do I book a Teams room?', 'Query', 'Low', 'Open', 'neha', 'portal', 'Peter Novak', 'M365'],
  ['Kubernetes pods restarting in the staging namespace', 'Incident', 'Medium', 'New', null, 'automation', 'Monitoring', 'K8S'],
];

// SLA timeline per ticket (same order as TICKETS): hours since it was raised, minutes to the
// first response (null = not yet), hours to resolution — so the demo shows every SLA state.
const TIMELINE = [
  [3.3, 12, null], [11, null, null], [2, null, null], [30, 45, null], [50, 25, 20], [6, 25, null], [26, 20, 5], [0.3, null, null],
  [20, 10, null], [0.4, null, null], [5, 20, null], [6, 20, null], [120, 90, 30], [1, null, null], [0.5, null, null],
];
const RESOLUTION = {
  'Install Visio and Power BI Desktop': ['Fixed', 'Installed Visio Plan 2 and Power BI Desktop from Company Portal; licence assigned.'],
  'Reset MFA and password for a locked account': ['Fixed', 'Identity verified by phone, MFA methods reset and a temporary password issued.'],
  'Shared drive quota increase for Marketing': ['Fixed', 'Quota raised from 500 GB to 1 TB after manager approval.'],
};

async function main() {
  await db.load();
  seed();

  if (db.all('projects').length || db.all('users').length > 1) {
    console.log('Demo data skipped: the database already contains projects or extra users.');
    await db.close();
    return;
  }

  const settings = db.state.settings;
  settings.ticketCategories = TICKET_TYPES;
  settings.activityCategories = ['Project Work', 'Customer Support', 'Meeting', 'Training', 'Documentation', 'Internal', 'Leave'];

  for (const r of ROLES) db.insert('profiles', r);
  const profileId = (key) => db.all('profiles').find((p) => p.key === key).id;

  const admin = db.all('users').find((u) => u.username === 'admin');
  const byUser = { admin };
  for (const [username, name, role, mgr, designation, department] of PEOPLE) {
    byUser[username] = db.insert('users', {
      username, name, email: `${username}@example.com`, passwordHash: hashPassword(DEMO_PASSWORD),
      profileId: profileId(role), managerId: byUser[mgr].id, designation, department,
      phone: '', active: true, lastSeen: null,
    });
  }
  const uid = (username) => byUser[username]?.id || null;

  const byCode = {};
  for (const [code, name, client, keywords, color, budgetHours, status, pm, members] of PROJECTS) {
    byCode[code] = db.insert('projects', {
      code, name, client, keywords, color, budgetHours, status, description: `${name} for ${client}.`,
      managerId: uid(pm), memberIds: members.map(uid), startDate: '2026-08-01',
      endDate: status === 'Completed' ? '2026-09-30' : '2026-12-31',
    });
  }

  // ---------- daily tracker entries for the last 3 weeks ----------
  const projActs = ['Design review', 'Implementation', 'Testing and validation', 'Documentation', 'Client status call', 'Deployment', 'Troubleshooting', 'Runbook update'];
  const supportActs = ['Customer query: password reset', 'Customer query: VPN not connecting', 'Customer query: email sync issue',
    'Remote session for printer issue', 'Customer query: license request', 'Customer query: Teams audio problem', 'Walk-in desk support'];
  let seedN = 7;
  const rnd = () => { seedN = (seedN * 9301 + 49297) % 233280; return seedN / 233280; };
  const pickR = (a) => a[Math.floor(rnd() * a.length)];
  const projectsFor = (username) => {
    const mine = PROJECTS.filter((p) => p[6] === 'Active' && (p[8].includes(username) || p[7] === username)).map((p) => byCode[p[0]]);
    return mine.length ? mine : PROJECTS.filter((p) => p[6] === 'Active').map((p) => byCode[p[0]]);
  };

  const today = new Date();
  for (let back = 20; back >= 0; back--) {
    const d = new Date(today); d.setDate(d.getDate() - back);
    if ([0, 6].includes(d.getDay())) continue;
    const date = d.toISOString().slice(0, 10);
    for (const [username, , , , , department] of PEOPLE) {
      if (username === 'lakshmi') continue; // the auditor does not log time
      if (back === 0 && rnd() < 0.3) continue; // some people have not logged today yet
      const u = byUser[username];
      const supportShare = department === 'Service Desk' ? 0.7 : 0.2;
      const mine = projectsFor(username);
      let left = username === 'fatima' ? 360 : 480;
      while (left > 30) {
        const minutes = Math.min(left, [30, 45, 60, 90, 120, 150][Math.floor(rnd() * 6)]);
        const support = rnd() < supportShare;
        const meeting = !support && rnd() < 0.12;
        const training = !support && !meeting && username === 'fatima' && rnd() < 0.4;
        const p = pickR(mine);
        const category = support ? 'Customer Support' : meeting ? 'Meeting' : training ? 'Training' : 'Project Work';
        db.insert('timesheets', {
          userId: u.id, date, minutes, billable: category === 'Project Work',
          projectId: category === 'Project Work' ? p.id : null, autoDetected: false, category,
          activity: support ? pickR(supportActs) : meeting ? 'Team stand-up and planning' : training ? 'Onboarding training' : `${pickR(projActs)} – ${p.name}`,
          notes: '', ticketId: null, startTime: '', endTime: '',
          customer: support ? pickR(['Acme Corp', 'Globex', 'Initech', 'Hooli', 'Stark Industries']) : '',
        });
        left -= minutes;
      }
    }
  }

  // ---------- devices ----------
  const byDevice = {};
  DEVICES.forEach(([name, type, os, host, customer, location, code, owner, tags], i) => {
    byDevice[name] = db.insert('devices', {
      name, type, os, host, customer, location, projectId: code ? byCode[code].id : null, ownerId: uid(owner),
      remoteId: `demo-node-${String(i + 1).padStart(2, '0')}`, tags, notes: '', active: tags !== 'retired',
    });
  });
  // A few past remote sessions, each with its Daily Tracker entry.
  const pastSessions = [
    ['GLOBEX-SAP-APP01', 'amit', 'desktop', 2, 50, 'Restarted SAP services after the upgrade'],
    ['INITECH-FW-01', 'vikram', 'terminal', 1, 35, 'Added NAT rule for the payment API'],
    ['ACME-LT-042', 'neha', 'desktop', 1, 20, 'Fixed Outlook profile'],
    ['UMB-WEB-01', 'rohan', 'terminal', 3, 45, 'Applied security patches'],
    ['STARK-LT-108', 'pooja', 'desktop', 0, 25, 'Re-enrolled the laptop in Intune'],
    ['IT-PRN-FL2', 'arjun', 'files', 4, 15, 'Updated printer firmware'],
  ];
  for (const [name, user, mode, daysAgo, minutes, notes] of pastSessions) {
    const d = byDevice[name];
    const start = new Date(today); start.setDate(start.getDate() - daysAgo); start.setHours(11, 0, 0, 0);
    const end = new Date(start.getTime() + minutes * 60000);
    const session = db.insert('remoteSessions', {
      deviceId: d.id, userId: uid(user), ticketId: null, mode, startedAt: start.toISOString(), endedAt: end.toISOString(), minutes, notes,
    });
    const entry = db.insert('timesheets', {
      userId: uid(user), date: start.toISOString().slice(0, 10), minutes, projectId: d.projectId, autoDetected: false,
      category: 'Customer Support', activity: `${{ desktop: 'Remote desktop', terminal: 'Terminal', files: 'Files' }[mode]} – ${name}`,
      notes, ticketId: null, startTime: '', endTime: '', billable: false, customer: d.customer, remoteSessionId: session.id,
    });
    session.timesheetId = entry.id;
  }
  const ticketDevice = {
    'VPN not connecting from home office': 'STARK-LT-108', 'Outlook keeps asking for a password': 'ACME-LT-042',
    'SAP login error after the ERP upgrade': 'GLOBEX-SAP-APP01', 'Recurring disk-full alerts on the SQL cluster': 'GLOBEX-SQL-02',
    'Production web server down after patching': 'UMB-WEB-01', 'Firewall rule change for the new payment API': 'INITECH-FW-01',
    'Kubernetes pods restarting in the staging namespace': 'INITECH-K8S-NODE3',
  };

  // ---------- tickets ----------
  const tickets = require('../lib/tickets');
  const sla = require('../lib/sla');
  for (const [i, [subject, category, priority, status, assignee, source, requester, code]] of TICKETS.entries()) {
    const [ageH, respMin, resolveH] = TIMELINE[i];
    const created = Date.now() - ageH * 3600000;
    const t = tickets.create({
      subject, description: `${subject}. Reported by ${requester}.`, category, priority,
      assigneeId: uid(assignee), requesterName: requester,
      requesterEmail: `${requester.toLowerCase().replace(/[^a-z]+/g, '.')}@customer.example`,
      projectId: code ? byCode[code].id : null,
      deviceId: ticketDevice[subject] ? byDevice[ticketDevice[subject]].id : null,
    }, admin, { source, skipWorkflows: true, createdAt: new Date(created).toISOString() });
    const [resCode, resNotes] = RESOLUTION[subject] || [];
    if (status !== 'New') {
      tickets.update(t, { status, ...(resCode ? { resolutionCode: resCode, resolutionNotes: resNotes } : {}), ...(status === 'On Hold' ? { holdReason: 'Awaiting third party / vendor' } : {}) }, admin, { skipWorkflows: true, quietEmail: true });
    }
    t.firstResponseAt = respMin == null ? null : new Date(created + respMin * 60000).toISOString();
    if (resolveH) t.resolvedAt = new Date(created + resolveH * 3600000).toISOString();
    if (t.slaPausedAt) t.slaPausedAt = new Date(created + 3 * 3600000).toISOString();
    sla.markCurrent(t); // don't send warnings for the demo's history
    // Log some time against tickets that are being worked on.
    if (t.assigneeId && ['In Progress', 'Resolved', 'Closed'].includes(status)) {
      db.insert('timesheets', {
        userId: t.assigneeId, date: today.toISOString().slice(0, 10), minutes: [30, 45, 60, 90][Math.floor(rnd() * 4)],
        billable: false, projectId: t.projectId, autoDetected: false, category: 'Customer Support',
        activity: `${t.number}: ${subject}`, notes: '', ticketId: t.id, startTime: '', endTime: '', customer: requester,
      });
    }
  }

  // ---------- workflows ----------
  const l1l2 = ['pooja', 'neha', 'arjun'].map(uid);
  db.insert('workflows', {
    name: 'Auto-assign critical incidents', description: 'Critical tickets go to the least-loaded online support engineer and the manager is emailed.',
    enabled: true, trigger: 'ticket.created', matchType: 'all', order: 1, runCount: 0,
    conditions: [{ field: 'priority', op: 'equals', value: 'Critical' }],
    actions: [{ type: 'assign_least_loaded', userIds: l1l2, onlineOnly: true },
      { type: 'send_email', to: 'manager', subject: 'Critical ticket {{ticket.number}}', body: '{{ticket.subject}} was assigned to {{assignee.name}}.' }],
  });
  db.insert('workflows', {
    name: 'Route VPN / network queries', description: 'Anything mentioning VPN, firewall or Wi-Fi goes to the network engineer.',
    enabled: true, trigger: 'ticket.created', matchType: 'any', order: 2, runCount: 0,
    conditions: [{ field: 'subject', op: 'contains', value: 'vpn, firewall, wi-fi' }],
    actions: [{ type: 'assign_user', userId: uid('vikram') }, { type: 'set_category', value: 'Network' }],
  });
  db.insert('workflows', {
    name: 'Route security reports', description: 'Phishing and malware reports go to the security analyst as Critical.',
    enabled: true, trigger: 'ticket.created', matchType: 'any', order: 3, runCount: 0,
    conditions: [{ field: 'subject', op: 'contains', value: 'phishing, malware, virus, ransomware' }],
    actions: [{ type: 'assign_user', userId: uid('rohan') }, { type: 'set_category', value: 'Security' }, { type: 'set_priority', value: 'Critical' }],
  });
  db.insert('workflows', {
    name: 'Escalate breached P1 / P2 tickets', description: 'ITIL functional escalation: a breached Critical or High ticket goes to the team lead and the manager is emailed.',
    enabled: true, trigger: 'sla.breached', matchType: 'any', order: 5, runCount: 0,
    conditions: [{ field: 'priority', op: 'equals', value: 'Critical' }, { field: 'priority', op: 'equals', value: 'High' }],
    actions: [{ type: 'add_comment', text: 'Escalated by SLA policy: {{ticket.priority}} target missed.' },
      { type: 'send_email', to: 'manager', subject: 'SLA breached on {{ticket.number}}', body: '{{ticket.subject}} ({{ticket.priority}}) has missed its SLA. Assignee: {{assignee.name}}.' }],
  });
  db.insert('workflows', {
    name: 'Daily server health check ticket', description: 'Creates a health-check ticket every weekday at 09:00.',
    enabled: true, trigger: 'schedule', schedule: { frequency: 'daily', time: '09:00', weekdays: [1, 2, 3, 4, 5] }, order: 4, runCount: 0,
    conditions: [], actions: [{ type: 'create_ticket', subject: 'Daily server health check – {{date}}', description: 'Review monitoring dashboards and backups.', priority: 'Low', category: 'Service Request' },
      { type: 'assign_round_robin', userIds: ['amit', 'sneha', 'sameer'].map(uid) }],
  });

  await db.close();
  console.log(`Demo data loaded: ${PEOPLE.length} team members, ${db.all('profiles').length} roles, ${PROJECTS.length} projects, `
    + `${TICKET_TYPES.length} ticket types, ${TICKETS.length} tickets, ${DEVICES.length} devices, ${db.all('timesheets').length} tracker entries.`);
  console.log(`Demo users (password ${DEMO_PASSWORD}): ${PEOPLE.map((p) => p[0]).join(', ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
