/* Devices & remote sessions: inventory, one-click remote desktop, session log. */
(() => {
  const { esc, icon, fmtMins } = App;
  const state = { q: '', type: '', customer: '' };
  const TYPE_ICON = { Server: 'server', 'Virtual machine': 'server', 'Network device': 'flow', Firewall: 'shield', Printer: 'layout', 'Mobile device': 'phone' };

  const provider = () => App.meta.settings.remote?.provider || '';
  const modesFor = () => App.meta.remoteProviders?.[provider()]?.modes || { desktop: 'Remote session' };
  const MODE_ICON = { desktop: 'monitor', terminal: 'terminal', files: 'folder' };

  App.deviceIcon = (type) => icon(TYPE_ICON[type] || 'monitor', 18);

  // Starts a session and opens it, inside OpsTrack or in a new tab.
  App.startRemote = async (deviceId, mode = 'desktop', ticketId = null) => {
    const embed = App.meta.settings.remote?.embed !== false;
    const win = embed ? null : window.open('', '_blank'); // open now so pop-up blockers allow it
    try {
      const r = await App.post(`/api/devices/${deviceId}/sessions`, { mode, ticketId });
      if (win) { win.opener = null; win.location = r.url; }
      App.go(`remote/${r.session.id}`);
    } catch (e) {
      win?.close();
      App.fail(e);
    }
  };

  const connectButtons = (d, small = true) => {
    if (!App.can('devices', 'connect') || d.active === false) return '';
    // Compact (icon-only) in the device list, labelled on the device page.
    return Object.entries(modesFor()).map(([m, label]) => `<button class="btn ${small ? 'sm icon-only' : ''} ${m === 'desktop' ? 'primary' : ''}" data-connect="${d.id}" data-mode="${m}" title="${esc(label)}" aria-label="${esc(label)}">${icon(MODE_ICON[m] || 'monitor', 15)}${small ? '' : `<span>${esc(label)}</span>`}</button>`).join('');
  };
  const bindConnect = (el) => el.querySelectorAll('[data-connect]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    App.startRemote(b.dataset.connect, b.dataset.mode);
  }));

  function deviceModal(d = {}, types, after) {
    const p = App.meta.remoteProviders?.[provider()];
    App.modal({
      title: d.id ? `Edit device – ${d.name}` : 'Add device',
      wide: true,
      body: `<div class="form-grid">
        <label>Device name<input name="name" value="${esc(d.name || '')}" placeholder="e.g. ACME-LT-042" required></label>
        <label>Type<select name="type">${App.options(types, d.type || 'Workstation')}</select></label>
        <label>Operating system<input name="os" value="${esc(d.os || '')}" placeholder="Windows 11 Pro"></label>
        <label>Hostname / IP<input name="host" value="${esc(d.host || '')}" placeholder="10.0.4.21"></label>
        <label>Customer<input name="customer" value="${esc(d.customer || '')}"></label>
        <label>Location<input name="location" value="${esc(d.location || '')}" placeholder="Pune office, 2nd floor"></label>
        <label>Project<select name="projectId">${App.projectOptions(d.projectId)}</select></label>
        <label>Responsible engineer<select name="ownerId">${App.userOptions(d.ownerId, '— None —')}</select></label>
        <label class="span2">${esc(p?.idLabel || 'Remote ID')} <small class="muted">${provider() === 'meshcentral' ? '(MeshCentral → open the device → copy the value after <code>gotonode=</code> in the address bar, or the full <code>node//…</code> id)' : provider() === 'guacamole' ? '(Guacamole → Settings → Connections → the number in the connection’s address)' : ''}</small>
          <input name="remoteId" value="${esc(d.remoteId || '')}" autocomplete="off"></label>
        <label class="span2">Tags<input name="tags" value="${esc(d.tags || '')}" placeholder="vip, finance"></label>
        <label class="span2">Notes<textarea name="notes" rows="2">${esc(d.notes || '')}</textarea></label>
        <label class="check"><input type="checkbox" name="active" ${d.active !== false ? 'checked' : ''}> Active (uncheck when retired)</label>
      </div>`,
      onSubmit: async (f) => {
        if (d.id) await App.put(`/api/devices/${d.id}`, f); else await App.post('/api/devices', f);
        App.toast(d.id ? 'Device updated' : 'Device added');
        await App.refreshMeta();
        after?.();
      },
    });
  }

  const notConfigured = () => (!provider()
    ? `<div class="notice-bar">${icon('monitor', 18)}<span>Remote desktop is not connected to a server yet.${App.can('settings', 'edit') ? ' <a href="#/settings/remote">Set it up in Settings → Remote Desktop</a>.' : ' Ask an administrator to set it up.'}</span></div>` : '');

  async function listView(el, alive) {
    const { devices, types } = await App.get('/api/devices');
    if (!alive()) return;
    const customers = [...new Set(devices.map((d) => d.customer).filter(Boolean))].sort();
    const q = state.q.toLowerCase();
    const shown = devices.filter((d) => (!state.type || d.type === state.type) && (!state.customer || d.customer === state.customer)
      && (!q || `${d.name} ${d.host} ${d.os} ${d.customer} ${d.tags} ${d.ownerName || ''}`.toLowerCase().includes(q)))
      .sort((a, b) => (b.active !== false) - (a.active !== false) || a.name.localeCompare(b.name));
    const active = devices.flatMap((d) => d.activeSessions.map((s) => ({ ...s, device: d }))).filter((s) => s.userId === App.me.id);

    el.innerHTML = `${notConfigured()}
      ${active.length ? `<div class="card active-sessions"><header><h3>${icon('monitor', 16)} Your open remote sessions</h3></header><ul class="mini-list">${active.map((s) => `<li><i class="live-dot"></i><span><b>${esc(s.device.name)}</b><small class="muted">started ${App.ago(s.startedAt)}</small></span><a class="btn sm" href="#/remote/${s.id}">Resume</a></li>`).join('')}</ul></div>` : ''}
      <div class="toolbar">
        <div class="search">${icon('search', 16)}<input id="dq" placeholder="Search name, IP, OS, customer, tag…" value="${esc(state.q)}"></div>
        <select id="dt">${App.options(types, state.type, { blank: 'All types' })}</select>
        <select id="dc">${App.options(customers, state.customer, { blank: 'All customers' })}</select>
        <span class="muted">${shown.length} of ${devices.length} devices</span>
        <span class="grow"></span>
        ${App.can('devices', 'create') ? `<button class="btn primary" id="new">${icon('plus', 16)} Add device</button>` : ''}
      </div>
      <div class="card">${shown.length ? `<div class="table-wrap"><table class="table hover">
        <thead><tr><th>Device</th><th>Customer / project</th><th>Responsible</th><th>Open tickets</th><th>Last remote session</th><th>Connect</th><th></th></tr></thead>
        <tbody>${shown.map((d) => `<tr data-open="${d.id}" class="${d.active === false ? 'retired' : ''}">
          <td><div class="dev-name"><span class="dev-ic">${App.deviceIcon(d.type)}</span><div><b>${esc(d.name)}</b>${d.activeSessions.length ? ' <span class="pill st-in-progress">in session</span>' : ''}${d.active === false ? ' <span class="pill st-closed">retired</span>' : ''}<small class="muted">${esc([d.type, d.os, d.host].filter(Boolean).join(' · '))}</small></div></div></td>
          <td>${esc(d.customer || '—')}<small class="muted">${esc(d.projectName || '')}</small></td>
          <td>${d.ownerId ? App.userChip(App.user(d.ownerId) || { id: d.ownerId, name: d.ownerName }, { light: false }) : '<span class="muted">—</span>'}</td>
          <td>${d.openTickets ? `<span class="pill st-open">${d.openTickets}</span>` : '<span class="muted">0</span>'}</td>
          <td>${d.lastSession ? `${esc(d.lastSession.userName)}<small class="muted">${App.ago(d.lastSession.startedAt)}${d.lastSession.minutes ? ` · ${fmtMins(d.lastSession.minutes)}` : ''}</small>` : '<span class="muted">never</span>'}</td>
          <td class="nowrap">${connectButtons(d)}</td>
          <td class="row-actions">${App.can('devices', 'edit') ? `<button class="icon-btn" data-edit="${d.id}" title="Edit">${icon('edit', 16)}</button>` : ''}${App.can('devices', 'delete') ? `<button class="icon-btn" data-del="${d.id}" title="Delete">${icon('trash', 16)}</button>` : ''}</td>
        </tr>`).join('')}</tbody></table></div>` : App.empty('No devices yet', 'Add the PCs, servers and network devices your engineers support.')}</div>`;

    const dq = el.querySelector('#dq');
    dq.addEventListener('input', App.debounce(() => { state.q = dq.value; App.render().then(() => { const n = document.getElementById('dq'); n?.focus(); n?.setSelectionRange(n.value.length, n.value.length); }); }, 300));
    el.querySelector('#dt').addEventListener('change', (e) => { state.type = e.target.value; App.render(); });
    el.querySelector('#dc').addEventListener('change', (e) => { state.customer = e.target.value; App.render(); });
    el.querySelector('#new')?.addEventListener('click', () => deviceModal({}, types, App.render));
    el.querySelectorAll('[data-open]').forEach((r) => r.addEventListener('click', (e) => { if (!e.target.closest('button,a')) App.go(`devices/${r.dataset.open}`); }));
    el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); deviceModal(devices.find((d) => d.id === b.dataset.edit), types, App.render); }));
    el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const d = devices.find((x) => x.id === b.dataset.del);
      if (!await App.confirm('Delete device', `Delete ${d.name}? Its remote-session history and logged time are kept.`)) return;
      try { await App.del(`/api/devices/${d.id}`); App.toast('Device deleted'); await App.refreshMeta(); App.render(); } catch (err) { App.fail(err); }
    }));
    bindConnect(el);
  }

  async function detailView(el, id, alive) {
    const [d, { types }] = await Promise.all([App.get(`/api/devices/${id}`), App.get('/api/devices')]);
    if (!alive()) return;
    const total = d.sessions.reduce((s, x) => s + (x.minutes || 0), 0);
    el.innerHTML = `${notConfigured()}<a class="back" href="#/devices">${icon('left', 16)} All devices</a>
      <section class="card dev-hero">
        <div class="dev-hero-ic">${icon(TYPE_ICON[d.type] || 'monitor', 28)}</div>
        <div class="grow"><h2>${esc(d.name)} ${d.active === false ? '<span class="pill st-closed">retired</span>' : ''}</h2>
          <p class="muted">${esc([d.type, d.os, d.host, d.location].filter(Boolean).join(' · '))}</p>
          <p>${d.customer ? `<span class="tag">${esc(d.customer)}</span>` : ''}${d.projectName ? `<span class="tag ghost">${esc(d.projectName)}</span>` : ''}${String(d.tags || '').split(',').map((t) => t.trim()).filter(Boolean).map((t) => `<span class="tag ghost">${esc(t)}</span>`).join('')}</p>
          ${d.notes ? `<p class="muted">${esc(d.notes)}</p>` : ''}</div>
        <div class="dev-actions">${connectButtons(d, false)}${App.can('devices', 'edit') ? `<button class="btn ghost" id="edit">${icon('edit', 15)} Edit</button>` : ''}</div>
      </section>
      <div class="summary-row"><div class="stat"><span>Remote sessions</span><b>${d.sessionCount}</b></div><div class="stat"><span>Remote time</span><b>${fmtMins(total)}</b></div><div class="stat"><span>Open tickets</span><b>${d.openTickets}</b></div><div class="stat"><span>Responsible</span><b class="sm">${esc(d.ownerName || '—')}</b></div></div>
      <div class="grid12">
        <section class="card" style="--span:8"><header><h3>Remote session history</h3></header>
          ${d.sessions.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Engineer</th><th>Started</th><th>Mode</th><th class="num">Duration</th><th>Ticket</th><th>Notes</th></tr></thead><tbody>
          ${d.sessions.map((s) => `<tr><td>${App.avatar(App.user(s.userId) || { id: s.userId, name: s.userName }, 24)} ${esc(s.userName)}</td><td>${App.fmtDateTime(s.startedAt)}</td><td>${esc(modesFor()[s.mode] || s.mode)}</td>
            <td class="num">${s.endedAt ? fmtMins(s.minutes) : `<a href="#/remote/${s.id}" class="pill st-in-progress">live</a>`}</td><td>${s.ticketNumber ? `<a href="#/tickets/${s.ticketId}">${esc(s.ticketNumber)}</a>` : '—'}</td><td class="muted">${esc(s.notes || '')}</td></tr>`).join('')}
          </tbody></table></div>` : App.empty('No remote sessions yet')}</section>
        <section class="card" style="--span:4"><header><h3>Tickets for this device</h3></header>
          ${d.tickets.length ? `<ul class="mini-list">${d.tickets.map((t) => `<li><a href="#/tickets/${t.id}"><b>${esc(t.number)}</b></a><span>${esc(t.subject)}</span>${App.statusPill(t.status)}</li>`).join('')}</ul>` : '<p class="muted pad">No tickets linked.</p>'}</section>
      </div>`;
    el.querySelector('#edit')?.addEventListener('click', () => deviceModal(d, types, App.render));
    bindConnect(el);
  }

  App.pages.devices = {
    title: 'Devices & Remote',
    render: (el, params, alive) => (params[0] ? detailView(el, params[0], alive) : listView(el, alive)),
  };

  // ---------- live session page ----------
  let tick = null;
  let beaconFor = null;
  window.addEventListener('pagehide', () => {
    // Closing the browser ends the session so the time is still logged.
    if (beaconFor) navigator.sendBeacon(`/api/remote-sessions/${beaconFor}/end`, new Blob([JSON.stringify({})], { type: 'application/json' }));
  });
  window.addEventListener('hashchange', () => { clearInterval(tick); beaconFor = null; });

  App.pages.remote = {
    title: 'Remote session',
    async render(el, params, alive) {
      const r = await App.get(`/api/remote-sessions/${params[0]}`);
      if (!alive()) return;
      const s = r.session; const d = r.device || { name: s.deviceName };
      const mine = s.userId === App.me.id;
      const live = !s.endedAt;
      let ticketOpts = '';
      if (App.can('tickets')) {
        const ts = await App.get('/api/tickets?status=open').catch(() => []);
        ticketOpts = App.options(ts.map((t) => ({ value: t.id, label: `${t.number} · ${t.subject}` })), s.ticketId, { blank: 'No ticket' });
      }
      document.getElementById('page-title').textContent = `Remote · ${d.name}`;
      el.innerHTML = `<section class="card remote-bar">
          <div class="rb-dev"><span class="dev-ic">${App.deviceIcon(d.type)}</span><div><b>${esc(d.name)}</b><small class="muted">${esc([modesFor()[s.mode] || s.mode, d.customer, d.host].filter(Boolean).join(' · '))}</small></div></div>
          <div class="rb-timer ${live ? 'live' : ''}"><i class="live-dot"></i><b id="timer">${live ? '00:00' : fmtMins(s.minutes)}</b><small>${live ? `started ${App.fmtDateTime(s.startedAt)}` : `ended ${App.fmtDateTime(s.endedAt)}`}</small></div>
          ${ticketOpts ? `<label class="rb-ticket">Ticket<select id="rs-ticket" ${live && mine ? '' : 'disabled'}>${ticketOpts}</select></label>` : ''}
          <div class="rb-actions">
            ${live && r.url ? `<a class="btn sm ghost" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${icon('link', 15)} Open in new tab</a>` : ''}
            ${live && r.url && r.embed ? `<button class="btn sm ghost" id="fs">${icon('layout', 15)} Full screen</button>` : ''}
            ${live && mine ? `<button class="btn sm danger" id="end">End session &amp; log time</button>` : ''}
            ${d.id ? `<a class="btn sm ghost" href="#/devices/${d.id}">Device</a>` : ''}
          </div>
          <textarea id="rs-notes" rows="1" placeholder="Session notes – what you did on the device (saved to the Daily Tracker)" ${live && mine ? '' : 'disabled'}>${esc(s.notes || '')}</textarea>
        </section>
        ${live && r.url && r.embed ? `<div class="remote-frame" id="frame-wrap"><iframe src="${esc(r.url)}" title="Remote session to ${esc(d.name)}" allow="clipboard-read; clipboard-write; fullscreen; microphone; camera" referrerpolicy="no-referrer"></iframe></div>
          <p class="hint">Blank or refused? Sign in to the remote desktop server in another tab once, and make sure it allows embedding (see the README). Or use <b>Open in new tab</b>.</p>`
        : live ? `<div class="card pad-lg">${r.url ? `The session opened in a new browser tab. Keep this page open – the timer runs here, and <b>End session</b> logs the time to your Daily Tracker.` : 'This session belongs to another engineer.'}</div>`
          : `<div class="card pad-lg">Session ended. ${s.minutes ? `<b>${fmtMins(s.minutes)}</b> ${s.timesheetId ? 'was logged to the Daily Tracker.' : 'recorded.'}` : ''} ${d.id && App.can('devices', 'connect') ? `<button class="btn sm primary" data-connect="${d.id}" data-mode="${s.mode}">Start a new session</button>` : ''}</div>`}`;

      bindConnect(el);
      if (!live) return;
      const t0 = new Date(s.startedAt).getTime();
      const draw = () => {
        const sec = Math.max(0, Math.floor((Date.now() - t0) / 1000));
        const h = Math.floor(sec / 3600); const m = Math.floor(sec / 60) % 60; const ss = sec % 60;
        const tEl = document.getElementById('timer');
        if (tEl) tEl.textContent = `${h ? `${h}:` : ''}${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
      };
      draw();
      clearInterval(tick);
      tick = setInterval(draw, 1000);
      if (!mine) return;
      beaconFor = s.id;
      const save = App.debounce(() => App.put(`/api/remote-sessions/${s.id}`, { notes: el.querySelector('#rs-notes').value, ticketId: el.querySelector('#rs-ticket')?.value || null }).catch(App.fail), 600);
      el.querySelector('#rs-notes').addEventListener('input', save);
      el.querySelector('#rs-ticket')?.addEventListener('change', save);
      el.querySelector('#fs')?.addEventListener('click', () => el.querySelector('#frame-wrap').requestFullscreen?.());
      el.querySelector('#end').addEventListener('click', async () => {
        try {
          const x = await App.post(`/api/remote-sessions/${s.id}/end`, { notes: el.querySelector('#rs-notes').value, ticketId: el.querySelector('#rs-ticket')?.value || null });
          beaconFor = null;
          clearInterval(tick);
          App.toast(x.timesheetId ? `Session ended – ${fmtMins(x.minutes)} logged to your Daily Tracker` : `Session ended (${fmtMins(x.minutes)})`);
          App.render();
        } catch (e) { App.fail(e); }
      });
    },
  };
})();
