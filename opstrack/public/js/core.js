/* Core: API client, helpers, shared UI components, router. */
window.App = (() => {
  const App = { pages: {}, meta: null, me: null, perms: {} };

  // ---------- API ----------
  App.api = async (method, url, body) => {
    const res = await fetch(url, {
      method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty */ }
    if (res.status === 401 && !url.includes('/auth/login')) { App.showLogin(); throw new Error('Session expired'); }
    if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
    return data;
  };
  App.get = (u) => App.api('GET', u);
  App.post = (u, b) => App.api('POST', u, b || {});
  App.put = (u, b) => App.api('PUT', u, b || {});
  App.del = (u) => App.api('DELETE', u);

  // ---------- helpers ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  App.esc = esc;
  App.can = (mod, act = 'view') => (App.perms[mod] || []).includes(act);
  App.fmtMins = (m) => {
    m = Math.round(m || 0);
    const h = Math.floor(m / 60); const r = m % 60;
    return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
  };
  App.hours = (m) => (Math.round((m || 0) / 6) / 10).toLocaleString();
  App.today = () => App.dateStr(new Date());
  App.dateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  App.addDays = (ds, n) => { const d = new Date(`${ds}T12:00:00`); d.setDate(d.getDate() + n); return App.dateStr(d); };
  App.fmtDate = (ds) => (ds ? new Date(ds.length === 10 ? `${ds}T12:00:00` : ds).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  App.fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  App.ago = (iso) => {
    if (!iso) return 'never';
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };
  App.initials = (n) => String(n || '?').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
  App.user = (id) => App.meta?.users.find((u) => u.id === id);
  App.project = (id) => App.meta?.projects.find((p) => p.id === id);
  App.options = (list, sel, { blank } = {}) => (blank !== undefined ? `<option value="">${esc(blank)}</option>` : '')
    + list.map((o) => {
      const v = typeof o === 'object' ? o.value : o; const l = typeof o === 'object' ? o.label : o;
      return `<option value="${esc(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${esc(l)}</option>`;
    }).join('');
  App.userOptions = (sel, blank) => App.options(App.meta.users.map((u) => ({ value: u.id, label: u.name })), sel, { blank });
  App.projectOptions = (sel, blank = 'No project') => App.options(App.meta.projects.map((p) => ({ value: p.id, label: `${p.code ? `${p.code} · ` : ''}${p.name}` })), sel, { blank });
  App.debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  App.formData = (form) => {
    const o = {};
    for (const el of form.elements) {
      if (!el.name || el.disabled) continue;
      if (el.type === 'checkbox') o[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; } else o[el.name] = el.value;
    }
    return o;
  };
  App.downloadCSV = (name, rows) => {
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv' }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // ---------- icons (inline SVG, stroke style) ----------
  const ICONS = {
    dashboard: 'M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z',
    clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
    ticket: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4zM13 5v2M13 11v2M13 17v2',
    folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    chart: 'M3 3v18h18M7 15l4-4 3 3 5-6',
    users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
    plus: 'M12 5v14M5 12h14',
    edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z',
    trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
    logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
    moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
    sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
    mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6',
    form: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
    flow: 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9',
    shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
    list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    left: 'M15 18l-6-6 6-6', right: 'M9 18l6-6-6-6', x: 'M18 6L6 18M6 6l12 12',
    download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
    play: 'M5 3l14 9-14 9z', copy: 'M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
    link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
    menu: 'M3 12h18M3 6h18M3 18h18', search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
    key: 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zM15.5 7.5l3 3L22 7l-3-3',
    org: 'M12 2v6M5 14v-3h14v3M5 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM19 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 14v4M12 8a2 2 0 1 0 0 0z',
    layout: 'M3 3h18v18H3zM3 9h18M9 21V9',
    monitor: 'M3 4h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 21h8M12 17v4',
    terminal: 'M4 17l6-6-6-6M12 19h8',
    server: 'M4 3h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM4 13h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1zM7 7h.01M7 17h.01',
    bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
    chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    phone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2',
  };
  App.icon = (name, size = 18) => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name] || ''}"/></svg>`;

  // ---------- small components ----------
  App.avatar = (u, size = 32) => {
    if (!u) return `<span class="avatar" style="--s:${size}px">?</span>`;
    const hue = [...String(u.id || u.name)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
    return `<span class="avatar" style="--s:${size}px;--h:${hue}">${esc(App.initials(u.name))}<i class="presence ${u.online ? 'on' : ''}" data-presence="${esc(u.id)}" title="${u.online ? 'Online' : 'Offline'}"></i></span>`;
  };
  App.light = (u) => {
    const w = u?.workload || { count: 0, level: 'free' };
    return `<span class="light light-${w.level}" data-wl-user="${esc(u?.id)}" data-wl="${esc(u?.id)}"><b></b>${w.count}</span>`;
  };
  App.userChip = (u, { light = true } = {}) => (u
    ? `<span class="user-chip">${App.avatar(u, 26)}<span>${esc(u.name)}</span>${light ? App.light(u) : ''}</span>`
    : '<span class="muted">Unassigned</span>');
  App.pill = (text, kind = '') => `<span class="pill ${kind}">${esc(text)}</span>`;
  App.priorityPill = (p) => App.pill(p, `prio-${String(p).toLowerCase()}`);
  App.statusPill = (s) => App.pill(s, `st-${String(s).toLowerCase().replace(/\s+/g, '-')}`);
  App.empty = (title, sub = '', action = '') => `<div class="empty"><div class="empty-art">${App.icon('layout', 40)}</div><h3>${esc(title)}</h3><p>${esc(sub)}</p>${action}</div>`;

  // ---------- toast ----------
  App.toast = (msg, type = 'ok') => {
    const wrap = document.getElementById('toasts');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => t.classList.add('out'), 3200);
    setTimeout(() => t.remove(), 3600);
  };
  App.fail = (e) => App.toast(e.message || String(e), 'err');

  // ---------- modal ----------
  App.modal = ({ title, body, submitLabel = 'Save', onSubmit, wide = false, footer, onOpen, danger = false }) => {
    const root = document.getElementById('modal-root');
    const el = document.createElement('div');
    el.className = 'modal-backdrop';
    el.innerHTML = `<form class="modal ${wide ? 'wide' : ''}" novalidate>
      <header><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${App.icon('x')}</button></header>
      <div class="modal-body">${body}</div>
      <footer>${footer ?? `<button type="button" class="btn ghost" data-close>Cancel</button>${onSubmit ? `<button class="btn ${danger ? 'danger' : 'primary'}" type="submit">${esc(submitLabel)}</button>` : ''}`}</footer>
    </form>`;
    root.appendChild(el);
    const form = el.querySelector('form');
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 150); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });
    el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!onSubmit) return close();
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        const r = await onSubmit(App.formData(form), form);
        if (r !== false) close();
      } catch (err) { App.fail(err); } finally { btn.disabled = false; }
    });
    App.enhance(el);
    onOpen?.(form, close);
    setTimeout(() => form.querySelector('input:not([type=hidden]),select,textarea')?.focus(), 30);
    return { el: form, close };
  };
  App.confirm = (title, text, label = 'Delete') => new Promise((resolve) => {
    let ok = false;
    const m = App.modal({ title, body: `<p>${esc(text)}</p>`, submitLabel: label, danger: true, onSubmit: () => { ok = true; } });
    const obs = new MutationObserver(() => { if (!m.el.isConnected) { obs.disconnect(); resolve(ok); } });
    obs.observe(document.getElementById('modal-root'), { childList: true });
  });

  // ---------- user picker with workload lights + online dot ----------
  // Renders a dropdown listing users with their open-ticket workload so the
  // person assigning can see who is free (white), available (green) or busy (red).
  App.userPicker = (name, selected, { placeholder = 'Unassigned', allowNone = true } = {}) => {
    const users = [...App.meta.users].sort((a, b) => (b.online - a.online) || a.workload.count - b.workload.count);
    const sel = App.user(selected);
    return `<div class="picker" data-picker>
      <input type="hidden" name="${esc(name)}" value="${esc(selected || '')}">
      <button type="button" class="picker-btn">${sel ? App.userChip(sel) : `<span class="muted">${esc(placeholder)}</span>`}<span class="caret"></span></button>
      <div class="picker-menu">
        <input type="search" class="picker-search" placeholder="Search people…">
        <div class="picker-legend"><span class="light light-free"><b></b>Free</span><span class="light light-available"><b></b>Available</span><span class="light light-busy"><b></b>Busy</span></div>
        <div class="picker-list">
          ${allowNone ? `<button type="button" class="picker-item" data-value=""><span class="muted">${esc(placeholder)}</span></button>` : ''}
          ${users.map((u) => `<button type="button" class="picker-item" data-value="${esc(u.id)}" data-search="${esc(`${u.name} ${u.designation || ''}`.toLowerCase())}">
            ${App.avatar(u, 28)}<span class="pi-name"><b>${esc(u.name)}</b><small>${esc(u.designation || '')}${u.online ? ' · <em class="ok">online</em>' : ''}</small></span>${App.light(u)}</button>`).join('')}
        </div>
      </div>
    </div>`;
  };

  App.enhance = (root) => {
    root.querySelectorAll('[data-picker]').forEach((p) => {
      if (p.dataset.ready) return;
      p.dataset.ready = '1';
      const input = p.querySelector('input[type=hidden]');
      const btn = p.querySelector('.picker-btn');
      const search = p.querySelector('.picker-search');
      btn.addEventListener('click', () => {
        document.querySelectorAll('.picker.open').forEach((x) => x !== p && x.classList.remove('open'));
        p.classList.toggle('open');
        if (p.classList.contains('open')) search.focus();
      });
      search.addEventListener('input', () => {
        const q = search.value.toLowerCase();
        p.querySelectorAll('.picker-item[data-search]').forEach((i) => { i.hidden = !i.dataset.search.includes(q); });
      });
      p.querySelectorAll('.picker-item').forEach((i) => i.addEventListener('click', () => {
        input.value = i.dataset.value;
        const u = App.user(i.dataset.value);
        btn.innerHTML = `${u ? App.userChip(u) : '<span class="muted">Unassigned</span>'}<span class="caret"></span>`;
        p.classList.remove('open');
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }));
    });
  };
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.picker')) document.querySelectorAll('.picker.open').forEach((x) => x.classList.remove('open'));
  });

  // ---------- workload hover card ----------
  const card = document.createElement('div');
  card.className = 'hovercard';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(card));
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest('[data-wl-user]');
    if (!t) { card.classList.remove('show'); return; }
    const u = App.user(t.dataset.wlUser);
    if (!u) return;
    const w = u.workload;
    const label = { free: 'Free – no open tickets', available: 'Available for new tickets', busy: 'Busy – multiple tickets assigned' }[w.level];
    const rows = (obj) => Object.entries(obj).map(([k, v]) => `<div class="hc-row"><span>${esc(k)}</span><b>${v}</b></div>`).join('') || '<div class="muted">—</div>';
    card.innerHTML = `<div class="hc-head">${App.avatar(u, 36)}<div><b>${esc(u.name)}</b><small>${u.online ? '<span class="ok">● Online</span>' : 'Offline'} · ${esc(u.designation || '')}</small></div></div>
      <div class="hc-big light-${w.level}"><b></b><span><strong>${w.count}</strong> open ticket${w.count === 1 ? '' : 's'}</span></div>
      <div class="hc-sub">${label}</div>
      <div class="hc-cols"><div><h5>By priority</h5>${rows(w.byPriority)}</div><div><h5>By status</h5>${rows(w.byStatus)}</div></div>`;
    const r = t.getBoundingClientRect();
    card.classList.add('show');
    const cw = card.offsetWidth; const ch = card.offsetHeight;
    let left = r.left + r.width / 2 - cw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - cw - 8));
    let top = r.bottom + 8;
    if (top + ch > window.innerHeight - 8) top = r.top - ch - 8;
    card.style.left = `${left}px`; card.style.top = `${top}px`;
  });

  // ---------- presence refresh ----------
  App.applyPresence = (list) => {
    for (const p of list) {
      const u = App.user(p.id);
      if (u) { u.online = p.online; u.workload = p.workload; }
      document.querySelectorAll(`[data-presence="${p.id}"]`).forEach((el) => { el.classList.toggle('on', p.online); el.title = p.online ? 'Online' : 'Offline'; });
      document.querySelectorAll(`[data-wl="${p.id}"]`).forEach((el) => { el.className = `light light-${p.workload.level}`; el.innerHTML = `<b></b>${p.workload.count}`; });
    }
    const n = list.filter((p) => p.online).length;
    const el = document.getElementById('online-count');
    if (el) el.textContent = n;
  };

  // ---------- router ----------
  App.route = () => {
    const [name, ...rest] = (location.hash.slice(2) || 'dashboard').split('/');
    return { name, params: rest.map(decodeURIComponent) };
  };
  App.go = (path) => { location.hash = `#/${path}`; };

  return App;
})();
