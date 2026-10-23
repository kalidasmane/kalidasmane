/* In-app notifications: the bell in the top bar, kept live over Server-Sent Events. */
(() => {
  const { esc, icon } = App;
  let es = null;
  let items = [];
  const KIND_ICON = { 'ticket.assigned': 'ticket', 'ticket.created': 'plus', 'ticket.updated': 'edit', comment: 'chat', mention: 'users', 'sla.warning': 'clock', 'sla.breached': 'clock', 'problem.assigned': 'alert', 'problem.updated': 'alert', 'change.assigned': 'change', 'change.approval': 'change', 'change.approved': 'change', 'change.rejected': 'change' };

  App.bellHtml = () => `<div class="bell" id="bell">
      <button class="icon-btn" id="bell-btn" aria-label="Notifications" title="Notifications">${icon('bell')}<span class="bell-badge" hidden></span></button>
      <div class="bell-drop" role="dialog" aria-label="Notifications">
        <header><b>Notifications</b><span class="grow"></span><button class="btn sm ghost" id="bell-all">Mark all as read</button></header>
        <div class="bell-list"></div>
        <footer><button class="btn sm ghost" id="bell-settings">${icon('sliders', 14)} Notification settings</button></footer>
      </div>
    </div>`;

  function setUnread(n) {
    App.unread = n;
    const b = document.querySelector('.bell-badge');
    if (b) { b.hidden = !n; b.textContent = n > 99 ? '99+' : String(n); }
    document.title = (n ? `(${n}) ` : '') + document.title.replace(/^\(\d+\+?\) /, '');
  }
  App.applyUnreadTitle = () => setUnread(App.unread || 0);

  function drawList() {
    const box = document.querySelector('.bell-list');
    if (!box) return;
    box.innerHTML = items.length ? items.map((n) => `<button class="bell-item ${n.read ? '' : 'unread'}" data-id="${esc(n.id)}" data-url="${esc(n.url)}">
        <span class="bell-ic">${icon(KIND_ICON[n.kind] || 'bell', 16)}</span>
        <span class="bell-txt"><b>${esc(n.title)}</b>${n.body ? `<small>${esc(n.body)}</small>` : ''}<small class="muted">${App.ago(n.createdAt)}</small></span>
        ${n.read ? '' : '<i class="dot"></i>'}</button>`).join('')
      : `<div class="empty small">${icon('bell', 28)}<p>You're all caught up.</p></div>`;
    box.querySelectorAll('.bell-item').forEach((el) => el.addEventListener('click', async () => {
      const n = items.find((x) => x.id === el.dataset.id);
      document.getElementById('bell').classList.remove('open');
      if (n && !n.read) {
        n.read = true;
        App.post('/api/notifications/read', { ids: [n.id] }).then((r) => setUnread(r.unread)).catch(() => {});
      }
      if (el.dataset.url) location.hash = el.dataset.url.replace(/^\/?#/, '#');
    }));
  }

  async function refresh() {
    const r = await App.get('/api/notifications?limit=50');
    items = r.items;
    setUnread(r.unread);
    drawList();
  }

  function connect() {
    if (!('EventSource' in window)) return;
    es?.close();
    es = new EventSource('/api/notifications/stream');
    es.addEventListener('hello', (e) => setUnread(JSON.parse(e.data).unread));
    es.addEventListener('read', (e) => { setUnread(JSON.parse(e.data).unread); refresh().catch(() => {}); });
    es.addEventListener('notification', (e) => {
      const { item, unread } = JSON.parse(e.data);
      items = [item, ...items.filter((x) => x.id !== item.id)].slice(0, 50);
      setUnread(unread);
      drawList();
      App.toast(item.title, 'info');
    });
    // EventSource reconnects by itself; if the session has expired, the next API call shows the login page.
  }

  App.initInbox = () => {
    const bell = document.getElementById('bell');
    if (!bell) return;
    document.getElementById('bell-btn').addEventListener('click', () => {
      bell.classList.toggle('open');
      if (bell.classList.contains('open')) refresh().catch(App.fail);
    });
    document.addEventListener('mousedown', (e) => { if (!e.target.closest('#bell')) bell.classList.remove('open'); });
    document.getElementById('bell-all').addEventListener('click', async () => {
      try { const r = await App.post('/api/notifications/read', { all: true }); items.forEach((n) => { n.read = true; }); setUnread(r.unread); drawList(); } catch (err) { App.fail(err); }
    });
    document.getElementById('bell-settings').addEventListener('click', () => { bell.classList.remove('open'); App.openPushSettings().catch(App.fail); });
    refresh().catch(() => {});
    connect();
  };

  App.stopInbox = () => { es?.close(); es = null; items = []; App.unread = 0; };
})();
