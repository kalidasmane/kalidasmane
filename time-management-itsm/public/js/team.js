/* Team directory: presence, workload lights and reporting-manager org chart. */
(() => {
  const { esc, icon } = App;
  let view = 'cards';

  App.pages.team = {
    title: 'Team',
    async render(el) {
      await App.refreshMeta();
      const users = [...App.meta.users].sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name));
      const online = users.filter((u) => u.online).length;
      const tree = (parentId, depth = 0) => users.filter((u) => (u.managerId || null) === parentId || (depth === 0 && parentId === null && u.managerId && !App.user(u.managerId)))
        .map((u) => `<li><div class="org-node">${App.avatar(u, 30)}<div><b>${esc(u.name)}</b><small class="muted">${esc(u.designation || '')}</small></div>${App.light(u)}</div>
          ${users.some((x) => x.managerId === u.id) ? `<ul>${tree(u.id, depth + 1)}</ul>` : ''}</li>`).join('');

      el.innerHTML = `<div class="toolbar">
          <div class="seg"><button data-v="cards" class="${view === 'cards' ? 'on' : ''}">${icon('users', 15)} Directory</button><button data-v="org" class="${view === 'org' ? 'on' : ''}">${icon('org', 15)} Reporting structure</button></div>
          <span class="grow"></span>
          <div class="legend-row"><span><i class="presence on inline"></i> Online (${online})</span><span class="light light-free"><b></b>Free</span><span class="light light-available"><b></b>Available</span><span class="light light-busy"><b></b>Busy (&gt;${App.meta.settings.workloadGreenMax} open)</span></div>
        </div>
        ${view === 'cards' ? `<div class="people-grid">${users.map((u) => `<article class="card person">
          ${App.avatar(u, 52)}<h3>${esc(u.name)}</h3><p class="muted">${esc(u.designation || '—')}</p>
          <div class="person-meta"><span>${u.online ? '<span class="ok">● Online</span>' : '<span class="muted">○ Offline</span>'}</span>${App.light(u)}</div>
          <small class="muted">Reports to: ${esc(App.user(u.managerId)?.name || '—')}</small>
          ${u.email ? `<a class="muted small" href="mailto:${esc(u.email)}">${esc(u.email)}</a>` : ''}
        </article>`).join('')}</div>`
        : `<div class="card org"><ul class="org-tree">${tree(null)}</ul></div>`}`;
      el.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { view = b.dataset.v; App.render(); }));
    },
  };
})();
