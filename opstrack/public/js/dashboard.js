/* Dashboard: configurable widgets over tracker + ticket data. */
(() => {
  const { esc, icon, fmtMins, hours } = App;
  let charts = [];
  App.destroyCharts = () => { charts.forEach((c) => c.destroy()); charts = []; };

  const PALETTE = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#ec4899', '#84cc16', '#64748b'];
  const CAT_COLORS = { 'Project Work': '#4f46e5', 'Customer Support': '#f59e0b', Meeting: '#0ea5e9', Training: '#10b981', Internal: '#8b5cf6', Leave: '#94a3b8' };
  App.catColor = (c, i = 0) => CAT_COLORS[c] || PALETTE[i % PALETTE.length];
  App.palette = PALETTE;

  App.chart = (canvas, config) => {
    const css = getComputedStyle(document.documentElement);
    Chart.defaults.color = css.getPropertyValue('--text-2').trim();
    Chart.defaults.borderColor = css.getPropertyValue('--line').trim();
    Chart.defaults.font.family = css.getPropertyValue('--font').trim();
    const c = new Chart(canvas, config);
    charts.push(c);
    return c;
  };

  const WIDGETS = [
    { id: 'kpis', title: 'Key metrics', span: 12 },
    { id: 'trend', title: 'Daily effort trend', span: 8 },
    { id: 'mix', title: 'Activity mix', span: 4 },
    { id: 'projects', title: 'Effort by project', span: 6 },
    { id: 'matrix', title: 'Who worked on which project', span: 6 },
    { id: 'engineers', title: 'Engineer effort & availability', span: 12 },
    { id: 'tstatus', title: 'Open tickets by status', span: 4 },
    { id: 'tprio', title: 'Open tickets by priority', span: 4 },
    { id: 'workload', title: 'Team workload', span: 4 },
    { id: 'sla', title: 'SLA performance by priority', span: 12 },
    { id: 'problems', title: 'Problems', span: 6 },
    { id: 'changes', title: 'Changes', span: 6 },
    { id: 'recent', title: 'Latest tracker updates', span: 8 },
    { id: 'compliance', title: 'Not logged today', span: 4 },
  ];

  const prefKey = () => `tm-dash-${App.me.id}`;
  const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(prefKey())) || {}; } catch { return {}; } };
  const savePrefs = (p) => { try { localStorage.setItem(prefKey(), JSON.stringify(p)); } catch { /* ignore */ } };

  const state = { range: '14', from: '', to: '', userId: '', projectId: '' };

  function rangeDates() {
    const t = App.today();
    switch (state.range) {
      case 'today': return [t, t];
      case '7': return [App.addDays(t, -6), t];
      case '30': return [App.addDays(t, -29), t];
      case 'month': return [`${t.slice(0, 8)}01`, t];
      case 'custom': return [state.from || App.addDays(t, -13), state.to || t];
      default: return [App.addDays(t, -13), t];
    }
  }

  function kpi(label, value, sub, ic, tone = '') {
    return `<div class="kpi ${tone}"><div class="kpi-ic">${icon(ic)}</div><div><span>${esc(label)}</span><strong>${value}</strong><small>${sub}</small></div></div>`;
  }

  App.pages.dashboard = {
    title: 'Dashboard',
    async render(el, params, alive) {
      const [from, to] = rangeDates();
      const qs = new URLSearchParams({ from, to, userId: state.userId, projectId: state.projectId });
      const d = await App.get(`/api/dashboard?${qs}`);
      if (!alive()) return;
      const prefs = loadPrefs();
      const hidden = new Set(prefs.hidden || []);
      const k = d.kpis;
      const days = d.daily.length;

      el.innerHTML = `
        <div class="toolbar">
          <div class="seg" id="range">
            ${[['today', 'Today'], ['7', '7 days'], ['14', '14 days'], ['30', '30 days'], ['month', 'This month'], ['custom', 'Custom']].map(([v, l]) => `<button data-v="${v}" class="${state.range === v ? 'on' : ''}">${l}</button>`).join('')}
          </div>
          <div class="custom-range ${state.range === 'custom' ? '' : 'hide'}"><input type="date" id="f-from" value="${from}"><span>to</span><input type="date" id="f-to" value="${to}"></div>
          <select id="f-user">${App.userOptions(state.userId, 'All engineers')}</select>
          <select id="f-project">${App.projectOptions(state.projectId, 'All projects')}</select>
          <span class="grow"></span>
          <button class="btn sm ghost" id="customize">${icon('sliders', 16)} Customize widgets</button>
        </div>
        <div class="grid12" id="widgets">
          ${WIDGETS.filter((w) => !hidden.has(w.id)).map((w) => `<section class="card widget" style="--span:${w.span}" data-w="${w.id}">${w.id === 'kpis' ? '' : `<header><h3>${w.title}</h3><span class="w-sub" data-sub="${w.id}"></span></header>`}<div class="w-body" data-body="${w.id}"></div></section>`).join('')}
        </div>`;

      const body = (id) => el.querySelector(`[data-body="${id}"]`);
      const sub = (id, t) => { const s = el.querySelector(`[data-sub="${id}"]`); if (s) s.textContent = t; };

      if (body('kpis')) {
        const target = d.dailyTargetMinutes;
        body('kpis').innerHTML = `<div class="kpis">
          ${kpi('Hours logged', hours(k.totalMinutes), `${k.entries} entries · ${App.fmtDate(from)} – ${App.fmtDate(to)}`, 'clock')}
          ${kpi('Today', hours(k.todayMinutes), `team target ${hours(target * Math.max(1, k.totalUsers))}h`, 'sun')}
          ${kpi('Project work', hours(k.projectMinutes), `${k.totalMinutes ? Math.round(k.projectMinutes / k.totalMinutes * 100) : 0}% of effort`, 'folder', 'indigo')}
          ${kpi('Customer support', hours(k.supportMinutes), `${k.totalMinutes ? Math.round(k.supportMinutes / k.totalMinutes * 100) : 0}% of effort`, 'mail', 'amber')}
          ${kpi('Open tickets', k.openTickets, `<span class="${k.overdueTickets ? 'bad' : ''}">${k.overdueTickets} SLA breached</span> · ${k.createdTickets} new`, 'ticket', k.overdueTickets ? 'red' : '')}
          ${kpi('SLA compliance', k.slaCompliance == null ? '—' : `${k.slaCompliance}%`, 'response & resolution targets met in range', 'clock', k.slaCompliance == null || k.slaCompliance >= 90 ? 'green' : k.slaCompliance >= 75 ? 'amber' : 'red')}
          ${kpi('Resolved', k.resolvedTickets, `avg ${k.avgResolutionHours}h to resolve`, 'form', 'green')}
          ${kpi('Online now', `${k.onlineUsers}<em>/${k.totalUsers}</em>`, `${k.activeProjects} active projects`, 'users', 'green')}
        </div>`;
      }

      if (body('trend')) {
        sub('trend', `${hours(k.totalMinutes)}h over ${days} day(s)`);
        body('trend').innerHTML = '<div class="chart-box"><canvas></canvas></div>';
        const cats = [...new Set(d.daily.flatMap((x) => Object.keys(x.categories)))];
        App.chart(body('trend').querySelector('canvas'), {
          type: 'bar',
          data: {
            labels: d.daily.map((x) => new Date(`${x.date}T12:00:00`).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })),
            datasets: cats.map((c, i) => ({ label: c, data: d.daily.map((x) => +((x.categories[c] || 0) / 60).toFixed(1)), backgroundColor: App.catColor(c, i), borderRadius: 4, stack: 's' })),
          },
          options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.raw}h` } } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, title: { display: true, text: 'Hours' } } } },
        });
      }

      if (body('mix')) {
        if (!d.byCategory.length) body('mix').innerHTML = App.empty('No entries', 'Nothing logged in this range');
        else {
          body('mix').innerHTML = '<div class="chart-box"><canvas></canvas></div>';
          App.chart(body('mix').querySelector('canvas'), {
            type: 'doughnut',
            data: { labels: d.byCategory.map((c) => c.name), datasets: [{ data: d.byCategory.map((c) => +(c.minutes / 60).toFixed(1)), backgroundColor: d.byCategory.map((c, i) => App.catColor(c.name, i)), borderWidth: 0 }] },
            options: { maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: (c) => `${c.label}: ${c.raw}h` } } } },
          });
        }
      }

      if (body('projects')) {
        const list = d.byProject.slice(0, 8);
        const max = Math.max(1, ...list.map((p) => p.minutes));
        body('projects').innerHTML = list.length ? `<div class="bars">${list.map((p, i) => `<div class="bar-row"><span class="bar-label" title="${esc(p.name)}">${esc(p.name)}</span><div class="bar"><i style="width:${p.minutes / max * 100}%;background:${p.id === '__none' ? '#94a3b8' : App.palette[i % 10]}"></i></div><b>${hours(p.minutes)}h</b></div>`).join('')}</div>` : App.empty('No project effort yet');
      }

      if (body('matrix')) {
        body('matrix').innerHTML = d.matrix.length ? `<div class="matrix">${d.matrix.map((m) => `<div class="mx-proj"><div class="mx-head"><b>${esc(m.project)}</b><span>${fmtMins(m.total)}</span></div>
          <div class="mx-stack">${m.engineers.map((e, i) => `<i style="flex:${e.minutes};background:${App.palette[i % 10]}" title="${esc(e.name)}: ${fmtMins(e.minutes)}"></i>`).join('')}</div>
          <div class="mx-legend">${m.engineers.slice(0, 5).map((e, i) => `<span><b style="background:${App.palette[i % 10]}"></b>${esc(e.name)} · ${fmtMins(e.minutes)}</span>`).join('')}</div></div>`).join('')}</div>` : App.empty('No project effort yet', 'Engineers’ project time will show here');
      }

      if (body('engineers')) {
        const target = d.dailyTargetMinutes;
        body('engineers').innerHTML = d.byUser.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>Engineer</th><th class="num">Logged</th><th>Project vs support</th><th>Today vs target</th><th>Tickets</th></tr></thead>
          <tbody>${d.byUser.map((u) => {
            const mu = App.user(u.id) || { ...u };
            const pct = u.minutes ? Math.round(u.projectMinutes / u.minutes * 100) : 0;
            const spct = u.minutes ? Math.round(u.supportMinutes / u.minutes * 100) : 0;
            const tp = Math.min(100, Math.round(u.todayMinutes / target * 100));
            return `<tr><td>${App.avatar(mu, 28)} <b>${esc(u.name)}</b></td><td class="num"><b>${fmtMins(u.minutes)}</b></td>
              <td><div class="split"><i class="p" style="width:${pct}%"></i><i class="s" style="width:${spct}%"></i></div><small class="muted">${pct}% project · ${spct}% support</small></td>
              <td><div class="progress ${tp >= 100 ? 'done' : ''}"><i style="width:${tp}%"></i></div><small class="muted">${fmtMins(u.todayMinutes)} / ${fmtMins(target)}</small></td>
              <td>${App.light(mu)}</td></tr>`;
          }).join('')}</tbody></table></div>` : App.empty('No engineers in scope');
      }

      const barChart = (id, obj, colors) => {
        const entries = Object.entries(obj);
        if (!entries.length) { body(id).innerHTML = App.empty('No open tickets', 'All clear 🎉'); return; }
        body(id).innerHTML = '<div class="chart-box sm"><canvas></canvas></div>';
        App.chart(body(id).querySelector('canvas'), {
          type: id === 'tprio' ? 'doughnut' : 'bar',
          data: { labels: entries.map((e) => e[0]), datasets: [{ data: entries.map((e) => e[1]), backgroundColor: entries.map((e, i) => colors[e[0]] || App.palette[i % 10]), borderRadius: 6, borderWidth: 0 }] },
          options: { maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: id === 'tprio', position: 'bottom', labels: { boxWidth: 10 } } }, ...(id === 'tprio' ? { cutout: '60%' } : { scales: { x: { ticks: { precision: 0 } }, y: { grid: { display: false } } } }) },
        });
      };
      if (body('tstatus')) barChart('tstatus', d.ticketsByStatus, { New: '#0ea5e9', Open: '#4f46e5', 'In Progress': '#f59e0b', 'On Hold': '#94a3b8' });
      if (body('tprio')) barChart('tprio', d.ticketsByPriority, Object.fromEntries(Object.entries({ Low: '#10b981', Medium: '#0ea5e9', High: '#f59e0b', Critical: '#ef4444' }).map(([p, c]) => [App.prioLabel(p), c])));

      if (body('problems')) {
        const pr = d.itsm?.problems;
        body('problems').innerHTML = !pr ? App.empty('No access', 'Problem Management is not part of your role') : `<div class="mini-kpis">
            <a href="#/problems"><strong>${pr.open}</strong><span>open problems</span></a>
            <a href="#/problems" data-kedb><strong>${pr.knownErrors}</strong><span>known errors</span></a>
            <a href="#/problems"><strong>${pr.incidentsLinked}</strong><span>open incidents linked</span></a>
            <a href="#/problems" class="${pr.unassigned ? 'bad' : ''}"><strong>${pr.unassigned}</strong><span>without an owner</span></a></div>
          ${pr.top.length ? `<ul class="mini-list">${pr.top.map((p) => `<li><a href="#/problems/${p.id}"><b>${esc(p.number)}</b></a><span>${esc(p.title)}</span><small class="muted">${p.incidents} incident(s)</small>${App.statusPill(p.status)}</li>`).join('')}</ul>` : ''}`;
        body('problems').querySelector('[data-kedb]')?.addEventListener('click', () => App.setProblemFilter?.('known'));
      }
      if (body('changes')) {
        const ch = d.itsm?.changes;
        body('changes').innerHTML = !ch ? App.empty('No access', 'Change Management is not part of your role') : `<div class="mini-kpis">
            <a href="#/changes" data-mine class="${ch.awaitingMe ? 'warn' : ''}"><strong>${ch.awaitingMe}</strong><span>awaiting my approval</span></a>
            <a href="#/changes"><strong>${ch.awaitingApproval}</strong><span>awaiting CAB</span></a>
            <a href="#/changes" data-sched><strong>${ch.next7}</strong><span>scheduled in 7 days</span></a>
            <a href="#/changes" class="${ch.failed30 ? 'bad' : ''}"><strong>${ch.successRate == null ? '—' : `${ch.successRate}%`}</strong><span>successful (30 days)</span></a></div>
          ${ch.upcoming.length ? `<ul class="mini-list">${ch.upcoming.map((c) => `<li><a href="#/changes/${c.id}"><b>${esc(c.number)}</b></a><span>${esc(c.title)}</span><small class="muted">${App.fmtDateTime(c.plannedStart)}</small>${App.statusPill(c.status)}</li>`).join('')}</ul>` : '<p class="muted">No changes coming up.</p>'}`;
        body('changes').querySelector('[data-mine]')?.addEventListener('click', () => App.setChangeFilter?.({ view: 'list', status: 'mine' }));
        body('changes').querySelector('[data-sched]')?.addEventListener('click', () => App.setChangeFilter?.({ view: 'schedule' }));
      }

      if (body('sla')) {
        const pctCell = (v) => (v == null ? '<span class="muted">—</span>' : `<span class="pct ${v >= 90 ? 'good' : v >= 75 ? 'warn' : 'bad'}">${v}%</span>`);
        const d2 = (m, biz) => (biz && m >= 60 ? `${+(m / 60).toFixed(1)}h` : App.fmtDuration(m)); // business time reads as working hours
        const tgt = (p) => `${d2(p.policy.response, p.policy.hours === 'business')} / ${d2(p.policy.resolution, p.policy.hours === 'business')}${p.policy.hours === 'business' ? ' <small class="muted">business hrs</small>' : ' <small class="muted">24×7</small>'}`;
        body('sla').innerHTML = `<div class="table-wrap"><table class="table sla-table">
          <thead><tr><th>Priority</th><th>Targets (response / resolution)</th><th class="num">Response met</th><th class="num">Resolution met</th><th class="num">Open</th><th class="num">At risk</th><th class="num">Breached</th></tr></thead>
          <tbody>${d.sla.map((r) => `<tr><td>${App.priorityPill(r.priority)}</td><td>${tgt(r)}</td>
            <td class="num">${pctCell(r.responsePct)} <small class="muted">${r.response.met}/${r.response.met + r.response.missed}</small></td>
            <td class="num">${pctCell(r.resolutionPct)} <small class="muted">${r.resolution.met}/${r.resolution.met + r.resolution.missed}</small></td>
            <td class="num">${r.open}</td><td class="num">${r.atRisk ? `<span class="pill sla-risk">${r.atRisk}</span>` : 0}</td><td class="num">${r.breached ? `<a href="#/tickets" data-slabreach class="pill sla-bad">${r.breached}</a>` : 0}</td></tr>`).join('')}</tbody></table></div>`;
        sub('sla', 'met vs. missed in the selected range · open tickets right now');
        body('sla').querySelectorAll('[data-slabreach]').forEach((a) => a.addEventListener('click', () => App.setTicketFilter({ sla: 'breached', priority: '' })));
      }

      if (body('workload')) {
        const us = [...App.meta.users].sort((a, b) => b.workload.count - a.workload.count);
        body('workload').innerHTML = `<div class="legend-row"><span class="light light-free"><b></b>Free</span><span class="light light-available"><b></b>Available</span><span class="light light-busy"><b></b>Busy</span></div>
          <ul class="mini-list">${us.map((u) => `<li>${App.avatar(u, 26)}<span>${esc(u.name)}</span>${App.light(u)}</li>`).join('')}</ul>`;
      }

      if (body('recent')) {
        body('recent').innerHTML = d.recent.length ? `<ul class="feed">${d.recent.map((e) => `<li>${App.avatar(App.user(e.userId) || { id: e.userId, name: e.userName }, 30)}
          <div><b>${esc(e.userName)}</b> logged <b>${fmtMins(e.minutes)}</b> ${e.projectName ? `on <span class="tag">${esc(e.projectName)}</span>` : `<span class="tag amber">${esc(e.category)}</span>`}
          <p>${esc(e.activity)}</p><small class="muted">${App.fmtDate(e.date)} · ${App.ago(e.createdAt)}</small></div></li>`).join('')}</ul>` : App.empty('No updates yet');
      }

      if (body('compliance')) {
        const missing = d.byUser.filter((u) => u.todayMinutes === 0);
        sub('compliance', `${missing.length} of ${d.byUser.length}`);
        body('compliance').innerHTML = missing.length ? `<ul class="mini-list">${missing.map((u) => `<li>${App.avatar(App.user(u.id) || u, 26)}<span>${esc(u.name)}</span><span class="pill st-on-hold">0h today</span></li>`).join('')}</ul>` : App.empty('Everyone has logged today', '');
      }

      // ---- events ----
      el.querySelectorAll('#range button').forEach((b) => b.addEventListener('click', () => { state.range = b.dataset.v; App.render(); }));
      el.querySelector('#f-from').addEventListener('change', (e) => { state.from = e.target.value; App.render(); });
      el.querySelector('#f-to').addEventListener('change', (e) => { state.to = e.target.value; App.render(); });
      el.querySelector('#f-user').addEventListener('change', (e) => { state.userId = e.target.value; App.render(); });
      el.querySelector('#f-project').addEventListener('change', (e) => { state.projectId = e.target.value; App.render(); });
      el.querySelector('#customize').addEventListener('click', () => App.modal({
        title: 'Customize dashboard widgets',
        body: `<p class="muted">Choose which widgets appear on your dashboard.</p><div class="check-grid">${WIDGETS.map((w) => `<label class="check"><input type="checkbox" name="${w.id}" ${hidden.has(w.id) ? '' : 'checked'}> ${w.title}</label>`).join('')}</div>`,
        submitLabel: 'Apply',
        onSubmit: (f) => { savePrefs({ hidden: WIDGETS.filter((w) => !f[w.id]).map((w) => w.id) }); App.render(); },
      }));
    },
  };
})();
