/* Reports: which engineer worked on which project, for how long, doing what. */
(() => {
  const { esc, icon, fmtMins, hours } = App;
  const state = { from: App.addDays(App.today(), -29), to: App.today(), projectId: '', userId: '', category: '', tab: 'summary' };

  App.pages.reports = {
    title: 'Reports',
    async render(el, params, alive) {
      const qs = new URLSearchParams({ from: state.from, to: state.to, projectId: state.projectId, userId: state.userId, category: state.category });
      const r = await App.get(`/api/reports/effort?${qs}`);
      if (!alive()) return;
      const total = r.entries.reduce((s, e) => s + e.minutes, 0);
      const byProject = {};
      for (const g of r.summary) (byProject[g.project] = byProject[g.project] || []).push(g);

      el.innerHTML = `<div class="toolbar">
          <label class="inline">From <input type="date" id="rf" value="${state.from}"></label>
          <label class="inline">To <input type="date" id="rt" value="${state.to}"></label>
          <select id="rp">${App.options([{ value: 'none', label: 'Support / no project' }, ...App.meta.projects.map((p) => ({ value: p.id, label: p.name }))], state.projectId, { blank: 'All projects' })}</select>
          <select id="ru">${App.userOptions(state.userId, 'All engineers')}</select>
          <select id="rc">${App.options(App.meta.settings.activityCategories, state.category, { blank: 'All activities' })}</select>
          <span class="grow"></span>
          <button class="btn ghost sm" id="csv">${icon('download', 16)} Export CSV</button>
        </div>
        <div class="summary-row"><div class="stat"><span>Total effort</span><b>${fmtMins(total)}</b></div><div class="stat"><span>Projects</span><b>${Object.keys(byProject).length}</b></div><div class="stat"><span>Engineers</span><b>${new Set(r.entries.map((e) => e.userId)).size}</b></div><div class="stat"><span>Entries</span><b>${r.entries.length}</b></div></div>
        <div class="tabs">${[['summary', 'Project × Engineer summary'], ['detail', 'Detailed log']].map(([v, l]) => `<button data-tab="${v}" class="${state.tab === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="card">${state.tab === 'summary' ? (r.summary.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>Project</th><th>Engineer</th><th class="num">Hours</th><th class="num">Minutes</th><th class="num">Days</th><th>Activities performed</th></tr></thead>
          <tbody>${Object.entries(byProject).map(([proj, rows]) => {
            const pm = rows.reduce((s, x) => s + x.minutes, 0);
            return `<tr class="group-row"><td colspan="2"><b>${esc(proj)}</b></td><td class="num"><b>${hours(pm)}</b></td><td class="num">${pm}</td><td></td><td></td></tr>${rows.map((g) => `<tr><td></td><td>${esc(g.user)}</td><td class="num">${hours(g.minutes)}</td><td class="num">${g.minutes}</td><td class="num">${g.days}</td><td>${g.activities.map((a) => `<span class="tag ghost">${esc(a.name)} · ${fmtMins(a.minutes)}</span>`).join('')}</td></tr>`).join('')}`;
          }).join('')}</tbody></table></div>` : App.empty('No data for these filters'))
        : (r.entries.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Engineer</th><th>Project</th><th>Activity type</th><th>Activity</th><th>Ticket</th><th class="num">Time</th></tr></thead><tbody>
          ${r.entries.sort((a, b) => b.date.localeCompare(a.date)).map((e) => `<tr><td>${App.fmtDate(e.date)}</td><td>${esc(e.userName)}</td><td>${esc(e.projectName || '—')}</td><td>${esc(e.category)}</td><td>${esc(e.activity)}</td><td>${esc(e.ticketNumber || '')}</td><td class="num">${fmtMins(e.minutes)}</td></tr>`).join('')}
          </tbody></table></div>` : App.empty('No data for these filters'))}</div>`;

      const set = (k) => (e) => { state[k] = e.target.value; App.render(); };
      el.querySelector('#rf').addEventListener('change', set('from'));
      el.querySelector('#rt').addEventListener('change', set('to'));
      el.querySelector('#rp').addEventListener('change', set('projectId'));
      el.querySelector('#ru').addEventListener('change', set('userId'));
      el.querySelector('#rc').addEventListener('change', set('category'));
      el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.tab; App.render(); }));
      el.querySelector('#csv').addEventListener('click', () => {
        if (state.tab === 'summary') {
          App.downloadCSV(`effort-summary-${state.from}-to-${state.to}.csv`, [['Project', 'Code', 'Engineer', 'Hours', 'Minutes', 'Days', 'Activities'],
            ...r.summary.map((g) => [g.project, g.projectCode, g.user, hours(g.minutes), g.minutes, g.days, g.activities.map((a) => `${a.name}: ${a.minutes}m`).join('; ')])]);
        } else {
          App.downloadCSV(`effort-detail-${state.from}-to-${state.to}.csv`, [['Date', 'Engineer', 'Project', 'Activity type', 'Activity', 'Customer', 'Ticket', 'Minutes', 'Billable', 'Notes'],
            ...r.entries.map((e) => [e.date, e.userName, e.projectName || '', e.category, e.activity, e.customer, e.ticketNumber || '', e.minutes, e.billable ? 'Yes' : 'No', e.notes])]);
        }
      });
    },
  };
})();
