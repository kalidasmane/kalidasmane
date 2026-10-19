// Populate the database with demo roles, team members, projects, ticket types,
// tickets, daily tracker entries and workflows so every screen has realistic data.
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

  // ---------- tickets ----------
  const tickets = require('../lib/tickets');
  for (const [subject, category, priority, status, assignee, source, requester, code] of TICKETS) {
    const t = tickets.create({
      subject, description: `${subject}. Reported by ${requester}.`, category, priority,
      assigneeId: uid(assignee), requesterName: requester,
      requesterEmail: `${requester.toLowerCase().replace(/[^a-z]+/g, '.')}@customer.example`,
      projectId: code ? byCode[code].id : null,
    }, admin, { source, skipWorkflows: true });
    if (status !== 'New') tickets.update(t, { status }, admin, { skipWorkflows: true });
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
    name: 'Daily server health check ticket', description: 'Creates a health-check ticket every weekday at 09:00.',
    enabled: true, trigger: 'schedule', schedule: { frequency: 'daily', time: '09:00', weekdays: [1, 2, 3, 4, 5] }, order: 4, runCount: 0,
    conditions: [], actions: [{ type: 'create_ticket', subject: 'Daily server health check – {{date}}', description: 'Review monitoring dashboards and backups.', priority: 'Low', category: 'Service Request' },
      { type: 'assign_round_robin', userIds: ['amit', 'sneha', 'sameer'].map(uid) }],
  });

  await db.close();
  console.log(`Demo data loaded: ${PEOPLE.length} team members, ${db.all('profiles').length} roles, ${PROJECTS.length} projects, `
    + `${TICKET_TYPES.length} ticket types, ${TICKETS.length} tickets, ${db.all('timesheets').length} tracker entries.`);
  console.log(`Demo users (password ${DEMO_PASSWORD}): ${PEOPLE.map((p) => p[0]).join(', ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
