/* App shell: login, layout, navigation, heartbeat. */
(() => {
  const { esc, icon } = App;
  const root = document.getElementById('app');

  const NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', perm: 'dashboard' },
    { id: 'tracker', label: 'Daily Tracker', icon: 'clock', perm: 'timesheet' },
    { id: 'tickets', label: 'Tickets', icon: 'ticket', perm: 'tickets' },
    { id: 'projects', label: 'Projects', icon: 'folder', perm: 'projects' },
    { id: 'devices', label: 'Devices & Remote', icon: 'monitor', perm: 'devices' },
    { id: 'reports', label: 'Reports', icon: 'chart', perm: 'reports' },
    { id: 'team', label: 'Team', icon: 'users', perm: null },
  ];
  const SETTINGS_PERMS = ['users', 'profiles', 'forms', 'email', 'workflows', 'settings'];

  // ---------- theme ----------
  const applyTheme = (t) => { document.documentElement.dataset.theme = t; try { localStorage.setItem('tm-theme', t); } catch { /* ignore */ } };
  let theme = 'light';
  try { theme = localStorage.getItem('tm-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch { /* ignore */ }
  applyTheme(theme);

  // ---------- login ----------
  App.showLogin = () => {
    stopHeartbeat();
    document.title = 'Sign in · OpsTrack';
    root.innerHTML = `<div class="login">
      <section class="login-hero">
        <div class="brand big"><span class="logo">${icon('clock', 22)}</span><span>Ops<em>Track</em></span></div>
        <h1>Know where every hour goes.<br>Resolve every request.</h1>
        <p>Daily effort tracking, project time intelligence, service-desk ticketing, email-to-ticket and workflow automation — in one workspace.</p>
        <ul class="hero-points">
          <li>${icon('clock')} Engineers log daily work against projects &amp; customer queries</li>
          <li>${icon('dashboard')} Live dashboards with widgets for managers</li>
          <li>${icon('flow')} Automatic ticket creation and smart assignment</li>
          <li>${icon('users')} Workload lights &amp; online presence for every engineer</li>
        </ul>
      </section>
      <section class="login-panel">
        <form class="login-card" id="login-form">
          <h2>Sign in</h2>
          <p class="muted">Use your workspace credentials.</p>
          <label>Username<input name="username" autocomplete="username" required autofocus></label>
          <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
          <div class="login-err" id="login-err"></div>
          <button class="btn primary block" type="submit">Sign in</button>
          <p class="hint">First time? Default administrator: <code>admin</code> / <code>admin</code></p>
        </form>
      </section>
    </div>`;
    root.querySelector('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = App.formData(e.target);
      const err = root.querySelector('#login-err');
      err.textContent = '';
      try {
        await App.post('/api/auth/login', f);
        await boot();
      } catch (ex) { err.textContent = ex.message; }
    });
  };

  // ---------- shell ----------
  function shell() {
    const me = App.me;
    const nav = NAV.filter((n) => !n.perm || App.can(n.perm));
    const showSettings = SETTINGS_PERMS.some((p) => App.can(p));
    root.innerHTML = `<div class="shell">
      <aside class="sidebar" id="sidebar">
        <div class="brand"><span class="logo">${icon('clock', 18)}</span><span>${esc(App.meta.settings.companyName)}</span></div>
        <nav>${nav.map((n) => `<a href="#/${n.id}" data-nav="${n.id}">${icon(n.icon)}<span>${n.label}</span></a>`).join('')}
          ${showSettings ? `<div class="nav-sep">Administration</div><a href="#/settings" data-nav="settings">${icon('settings')}<span>Settings</span></a>` : ''}
        </nav>
        <div class="sidebar-foot"><span class="dot-live"></span><span><b id="online-count">${App.meta.users.filter((u) => u.online).length}</b> people online</span></div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="icon-btn mobile-only" id="menu-btn" aria-label="Menu">${icon('menu')}</button>
          <h1 id="page-title"></h1>
          <div class="topbar-actions">
            ${App.can('timesheet', 'create') ? `<button class="btn primary sm" id="quick-log">${icon('plus', 16)}<span>Log time</span></button>` : ''}
            ${App.can('tickets', 'create') ? `<button class="btn sm" id="quick-ticket">${icon('ticket', 16)}<span>New ticket</span></button>` : ''}
            <button class="icon-btn" id="theme-btn" title="Toggle theme" aria-label="Toggle theme">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
            ${showSettings ? `<a class="icon-btn" href="#/settings" title="Settings" aria-label="Settings">${icon('settings')}</a>` : ''}
            <div class="me" id="me-menu">
              <button class="me-btn">${App.avatar({ ...me, online: true }, 34)}<span class="me-name"><b>${esc(me.name)}</b><small>${esc(me.profileName)}</small></span></button>
              <div class="me-drop">
                <div class="me-head"><b>${esc(me.name)}</b><small>${esc(me.email || me.username)}</small><span class="ok">● Online</span></div>
                <button data-act="push">${icon('chat', 16)} Push notifications</button>
                <button data-act="password">${icon('key', 16)} Change password</button>
                <button data-act="logout">${icon('logout', 16)} Sign out</button>
              </div>
            </div>
          </div>
        </header>
        <main id="page" class="page"></main>
      </div>
    </div>`;

    root.querySelector('#theme-btn').addEventListener('click', (e) => {
      applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
      e.currentTarget.innerHTML = icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon');
      render();
    });
    root.querySelector('#menu-btn').addEventListener('click', () => root.querySelector('#sidebar').classList.toggle('open'));
    root.querySelector('#quick-log')?.addEventListener('click', () => App.openEntryModal({}, render));
    root.querySelector('#quick-ticket')?.addEventListener('click', () => App.openNewTicket());
    const meMenu = root.querySelector('#me-menu');
    meMenu.querySelector('.me-btn').addEventListener('click', () => meMenu.classList.toggle('open'));
    document.addEventListener('mousedown', (e) => { if (!e.target.closest('#me-menu')) meMenu.classList.remove('open'); });
    meMenu.querySelector('[data-act=logout]').addEventListener('click', async () => {
      await App.post('/api/auth/logout').catch(() => {});
      App.showLogin();
    });
    meMenu.querySelector('[data-act=password]').addEventListener('click', () => { meMenu.classList.remove('open'); changePassword(); });
    meMenu.querySelector('[data-act=push]').addEventListener('click', () => { meMenu.classList.remove('open'); App.openPushSettings().catch(App.fail); });
  }

  function changePassword(forced = false) {
    App.modal({
      title: forced ? 'Set a new password' : 'Change password',
      body: `${forced ? '<p class="notice">Please choose a new password before continuing.</p>' : ''}
        <label>Current password<input type="password" name="current" required></label>
        <label>New password<input type="password" name="next" required minlength="5"></label>
        <label>Confirm new password<input type="password" name="confirm" required></label>`,
      submitLabel: 'Update password',
      onSubmit: async (f) => {
        if (f.next !== f.confirm) throw new Error('Passwords do not match');
        await App.post('/api/auth/change-password', f);
        App.toast('Password updated');
      },
    });
  }

  // ---------- rendering ----------
  let renderSeq = 0;
  async function render() {
    if (!App.me) return;
    const { name, params } = App.route();
    const page = App.pages[name] || App.pages.dashboard;
    const el = document.getElementById('page');
    if (!el) return;
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === (App.pages[name] ? name : 'dashboard')));
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('page-title').textContent = page.title;
    document.title = `${page.title} · ${App.meta.settings.companyName}`;
    App.destroyCharts?.();
    const seq = ++renderSeq;
    el.innerHTML = '<div class="loading"><span class="spinner"></span></div>';
    try {
      await page.render(el, params, () => seq === renderSeq);
    } catch (e) {
      if (seq === renderSeq) el.innerHTML = App.empty('Something went wrong', e.message);
    }
  }
  App.render = render;

  App.refreshMeta = async () => { App.meta = await App.get('/api/meta'); };

  // ---------- heartbeat / presence ----------
  let hb = null;
  function startHeartbeat() {
    clearInterval(hb);
    hb = setInterval(async () => {
      try {
        await App.post('/api/auth/heartbeat');
        App.applyPresence(await App.get('/api/presence'));
      } catch { /* handled by api() */ }
    }, 30000);
  }
  function stopHeartbeat() { clearInterval(hb); hb = null; App.me = null; }

  async function boot() {
    try {
      const me = await App.get('/api/auth/me');
      App.me = me.user; App.perms = me.permissions;
      await App.refreshMeta();
      shell();
      startHeartbeat();
      App.registerServiceWorker();
      if (!location.hash) location.hash = '#/dashboard';
      await render();
      if (me.mustChangePassword) changePassword(true);
    } catch {
      App.showLogin();
    }
  }

  window.addEventListener('hashchange', render);
  document.addEventListener('DOMContentLoaded', boot);
})();
