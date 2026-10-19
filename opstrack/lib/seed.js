// First-run bootstrap: default profiles, admin account and settings.
const db = require('./db');
const { MODULES, hashPassword } = require('./auth');

function allPerms() {
  const p = {};
  for (const [k, m] of Object.entries(MODULES)) p[k] = [...m.actions];
  return p;
}

const DEFAULT_PROFILES = [
  {
    key: 'admin', name: 'Administrator', system: true, color: '#7c3aed',
    description: 'Full access to every module and setting.',
    permissions: allPerms(),
  },
  {
    key: 'manager', name: 'Manager', color: '#0ea5e9',
    description: 'Manages team effort, projects and ticket assignment.',
    permissions: {
      dashboard: ['view'], timesheet: ['view', 'create', 'edit', 'delete', 'viewAll'],
      tickets: ['view', 'create', 'edit', 'viewAll', 'assign'], projects: ['view', 'create', 'edit'],
      reports: ['view'], users: ['view'], forms: ['view'], workflows: ['view'],
      devices: ['view', 'create', 'edit', 'connect'],
    },
  },
  {
    key: 'engineer', name: 'Engineer', color: '#10b981',
    description: 'Logs daily effort and works on assigned tickets.',
    permissions: {
      dashboard: ['view'], timesheet: ['view', 'create', 'edit', 'delete'],
      tickets: ['view', 'create', 'edit'], projects: ['view'], devices: ['view', 'connect'],
    },
  },
  {
    key: 'support', name: 'Support Agent', color: '#f59e0b',
    description: 'Handles customer queries and the service desk queue.',
    permissions: {
      dashboard: ['view'], timesheet: ['view', 'create', 'edit', 'delete'],
      tickets: ['view', 'create', 'edit', 'viewAll', 'assign'], projects: ['view'], devices: ['view', 'connect'],
    },
  },
];

const DEFAULT_SETTINGS = {
  companyName: 'OpsTrack',
  ticketPrefix: 'INC',
  workloadGreenMax: 3, // 1..greenMax open tickets = available (green); above = busy (red)
  dailyTargetHours: 8,
  activityCategories: ['Project Work', 'Customer Support', 'Meeting', 'Training', 'Internal', 'Leave'],
  ticketCategories: ['Incident', 'Service Request', 'Problem', 'Change', 'Query'],
  ticketPriorities: ['Low', 'Medium', 'High', 'Critical'],
  ticketStatuses: ['New', 'Open', 'In Progress', 'On Hold', 'Resolved', 'Closed'],
  closedStatuses: ['Resolved', 'Closed'],
  slaHours: { Low: 72, Medium: 24, High: 8, Critical: 4 },
  notifyOnAssign: true,
  notifyRequesterOnCreate: true,
  remote: {
    provider: '', // meshcentral | guacamole | custom
    serverUrl: '',
    embed: true, // open sessions inside OpsTrack (iframe) instead of a new tab
    guacDataSource: 'mysql',
    urlTemplate: '',
    logToTracker: true,
    trackerCategory: 'Customer Support',
  },
};

function seed() {
  const s = db.state;
  s.settings = { ...DEFAULT_SETTINGS, ...s.settings };
  s.settings.remote = { ...DEFAULT_SETTINGS.remote, ...s.settings.remote };
  if (!db.all('profiles').length) {
    for (const p of DEFAULT_PROFILES) db.insert('profiles', p);
  }
  // The Administrator profile always has every permission, including modules added later.
  for (const p of db.all('profiles')) if (p.system) p.permissions = allPerms();
  if (!db.all('users').length) {
    const admin = db.all('profiles').find((p) => p.key === 'admin');
    db.insert('users', {
      username: 'admin', name: 'Administrator', email: 'admin@example.com',
      passwordHash: hashPassword(process.env.ADMIN_PASSWORD || 'admin'), profileId: admin.id, managerId: null,
      department: 'IT', designation: 'System Administrator', phone: '', active: true,
      lastSeen: null, mustChangePassword: false,
    });
    console.log(`Created default login  ->  username: admin   password: ${process.env.ADMIN_PASSWORD ? '(from ADMIN_PASSWORD)' : 'admin'}`);
  }
  if (!db.all('forms').length) {
    db.insert('forms', {
      name: 'IT Support Request', description: 'Raise an issue or request help from the service desk.',
      public: true, category: 'Service Request', defaultPriority: 'Medium', active: true,
      fields: [
        { key: 'name', label: 'Your name', type: 'text', required: true },
        { key: 'email', label: 'Your email', type: 'email', required: true },
        { key: 'subject', label: 'Subject', type: 'text', required: true },
        { key: 'impact', label: 'Impact', type: 'select', required: true, options: ['Single user', 'Team', 'Whole company'] },
        { key: 'description', label: 'Describe the problem', type: 'textarea', required: true },
      ],
    });
  }
  db.flush();
}

module.exports = { seed, DEFAULT_SETTINGS, allPerms };
