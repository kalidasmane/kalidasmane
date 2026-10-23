/* Browser push notifications: per-device opt-in and per-user preferences. */
(() => {
  const { esc, icon } = App;
  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  App.registerServiceWorker = () => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return null;
    return navigator.serviceWorker.register('/sw.js').catch(() => null);
  };

  const keyBytes = (b64) => {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  };

  async function currentSub() {
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }

  function deviceName(ua) {
    const s = String(ua || '');
    const browser = /Edg\//.test(s) ? 'Edge' : /OPR\//.test(s) ? 'Opera' : /Firefox\//.test(s) ? 'Firefox' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'Browser';
    const os = /Android/.test(s) ? 'Android' : /iPhone|iPad/.test(s) ? 'iOS' : /Windows/.test(s) ? 'Windows' : /Mac OS X/.test(s) ? 'macOS' : /Linux/.test(s) ? 'Linux' : '';
    return `${browser}${os ? ` on ${os}` : ''}`;
  }

  App.openPushSettings = async () => {
    const info = await App.get('/api/push');
    const canSupport = supported() && window.isSecureContext;
    const sub = canSupport ? await currentSub().catch(() => null) : null;
    const here = sub && info.devices.some((d) => d.endpoint === sub.endpoint);
    const p = info.prefs;
    const seesAll = App.can('tickets', 'viewAll') || App.can('tickets', 'assign');
    let status;
    if (!window.isSecureContext) status = '<p class="notice">Push notifications need OpsTrack to be opened over <b>https://</b>.</p>';
    else if (!supported()) {
      status = isIOS() && !standalone()
        ? '<p class="notice">On iPhone / iPad: tap <b>Share → Add to Home Screen</b>, open OpsTrack from the new icon, then come back here (iOS 16.4 or later).</p>'
        : '<p class="notice">This browser does not support push notifications.</p>';
    } else if (Notification.permission === 'denied') status = '<p class="notice">Notifications are blocked for this site. Allow them in the browser’s site settings (the padlock icon next to the address), then try again.</p>';
    else status = here ? `<p class="ok-line">${icon('form', 16)} Push is <b>on</b> for this device.</p>` : '<p class="muted">Push is off for this device.</p>';

    const m = App.modal({
      title: 'Notifications',
      body: `<p class="muted">These choices apply to the bell in OpsTrack and to push notifications on your devices.</p>
        <h4>Push on this device</h4>
        ${status}
        <div class="row" style="margin:8px 0 16px">
          ${canSupport && Notification.permission !== 'denied' ? (here ? '<button type="button" class="btn" id="pdisable">Turn off on this device</button>' : '<button type="button" class="btn primary" id="penable">Turn on for this device</button>') : ''}
          ${info.devices.length ? '<button type="button" class="btn ghost" id="ptest">Send a test</button>' : ''}
        </div>
        <h4>Notify me when</h4>
        <div class="checks">
          <label class="check"><input type="checkbox" name="assigned" ${p.assigned ? 'checked' : ''}> A ticket is assigned to me</label>
          <label class="check"><input type="checkbox" name="updates" ${p.updates ? 'checked' : ''}> Someone else changes a ticket assigned to me</label>
          <label class="check"><input type="checkbox" name="comments" ${p.comments ? 'checked' : ''}> Someone comments on a ticket assigned to me (including requester emails)</label>
          <label class="check"><input type="checkbox" name="mentions" ${p.mentions ? 'checked' : ''}> Someone @mentions me in a comment</label>
          ${seesAll ? `<label>New tickets<select name="newTickets">${App.options([{ value: 'none', label: 'Don’t notify me' }, { value: 'critical', label: 'Critical only' }, { value: 'high', label: 'High and Critical' }, { value: 'all', label: 'All new tickets' }], p.newTickets)}</select></label>` : ''}
        </div>
        <h4>My devices</h4>
        ${info.devices.length ? `<ul class="mini-list">${info.devices.map((d) => `<li>${icon('monitor', 16)}<span>${esc(deviceName(d.userAgent))}${sub && d.endpoint === sub.endpoint ? ' <span class="tag">this device</span>' : ''}<small class="muted">added ${App.fmtDate(d.createdAt)}${d.lastUsedAt ? ` · last alert ${App.ago(d.lastUsedAt)}` : ''}</small></span></li>`).join('')}</ul>` : '<p class="muted">No devices yet.</p>'}`,
      submitLabel: 'Save preferences',
      onSubmit: async (f) => {
        await App.put('/api/push/prefs', f);
        App.toast('Notification preferences saved');
      },
    });
    const form = m.el;
    form.querySelector('#penable')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        if (await Notification.requestPermission() !== 'granted') throw new Error('Notifications were not allowed');
        await App.registerServiceWorker();
        const reg = await navigator.serviceWorker.ready;
        e.target.textContent = 'Connecting…';
        // The browser contacts its push service here; don't leave the button hanging if it can't.
        const s = await Promise.race([
          reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(info.publicKey) }),
          new Promise((_, no) => setTimeout(() => no(new Error('The browser could not reach its push service. Check the internet connection or firewall and try again.')), 20000)),
        ]);
        await App.post('/api/push/subscribe', { subscription: s.toJSON() });
        App.toast('Push notifications are on for this device');
        m.close(); App.openPushSettings();
      } catch (err) { App.fail(err); e.target.disabled = false; e.target.textContent = 'Turn on for this device'; }
    });
    form.querySelector('#pdisable')?.addEventListener('click', async () => {
      try {
        const s = await currentSub();
        if (s) { await App.post('/api/push/unsubscribe', { endpoint: s.endpoint }); await s.unsubscribe(); }
        App.toast('Push notifications are off for this device');
        m.close(); App.openPushSettings();
      } catch (err) { App.fail(err); }
    });
    form.querySelector('#ptest')?.addEventListener('click', async () => {
      try { const r = await App.post('/api/push/test'); App.toast(r.message); } catch (err) { App.fail(err); }
    });
  };
})();
