/* Projects: add / modify / delete projects and see who worked on them. */
(() => {
  const { esc, icon, fmtMins, hours } = App;
  const STATUSES = ['Planned', 'Active', 'On Hold', 'Completed', 'Archived'];
  let filter = 'Active';

  function projectModal(p = {}) {
    App.modal({
      title: p.id ? `Edit project – ${p.name}` : 'New project',
      wide: true,
      body: `<div class="form-grid">
        <label>Project code<input name="code" value="${esc(p.code || '')}" placeholder="e.g. CLD" maxlength="12"></label>
        <label>Project name<input name="name" value="${esc(p.name || '')}" required></label>
        <label>Client / customer<input name="client" value="${esc(p.client || '')}"></label>
        <label>Status<select name="status">${App.options(STATUSES, p.status || 'Active')}</select></label>
        <label>Project manager<select name="managerId">${App.userOptions(p.managerId, '— None —')}</select></label>
        <label>Budget (hours)<input type="number" name="budgetHours" min="0" value="${esc(p.budgetHours || '')}"></label>
        <label>Start date<input type="date" name="startDate" value="${esc(p.startDate || '')}"></label>
        <label>End date<input type="date" name="endDate" value="${esc(p.endDate || '')}"></label>
        <label class="span2">Auto-detect keywords <small class="muted">(comma separated – tracker entries mentioning these are linked to this project)</small><input name="keywords" value="${esc(p.keywords || '')}" placeholder="e.g. azure, migration"></label>
        <label class="span2">Description<textarea name="description" rows="3">${esc(p.description || '')}</textarea></label>
        <label>Colour<input type="color" name="color" value="${esc(p.color || '#4f46e5')}"></label>
      </div>`,
      onSubmit: async (f) => {
        f.budgetHours = f.budgetHours ? Number(f.budgetHours) : null;
        if (p.id) await App.put(`/api/projects/${p.id}`, f); else await App.post('/api/projects', f);
        App.toast(p.id ? 'Project updated' : 'Project created');
        await App.refreshMeta();
        App.render();
      },
    });
  }

  async function detail(el, id, alive) {
    const [projects, rep] = await Promise.all([App.get('/api/projects'), App.can('reports') ? App.get(`/api/reports/effort?projectId=${id}`) : App.get(`/api/timesheets?projectId=${id}`).then((entries) => ({ entries, summary: null }))]);
    if (!alive()) return;
    const p = projects.find((x) => x.id === id);
    if (!p) { el.innerHTML = App.empty('Project not found'); return; }
    const entries = rep.entries;
    const byUser = {};
    const byCat = {};
    for (const e of entries) {
      byUser[e.userId] = byUser[e.userId] || { name: e.userName, minutes: 0, acts: {} };
      byUser[e.userId].minutes += e.minutes;
      byUser[e.userId].acts[e.category] = (byUser[e.userId].acts[e.category] || 0) + e.minutes;
      byCat[e.category] = (byCat[e.category] || 0) + e.minutes;
    }
    const total = entries.reduce((s, e) => s + e.minutes, 0);
    const pct = p.budgetHours ? Math.round(total / 60 / p.budgetHours * 100) : null;
    el.innerHTML = `<a class="back" href="#/projects">${icon('left', 16)} All projects</a>
      <section class="card proj-hero" style="--pc:${esc(p.color || '#4f46e5')}">
        <div><span class="tag">${esc(p.code || 'PRJ')}</span>${App.statusPill(p.status)}<h2>${esc(p.name)}</h2><p class="muted">${esc(p.client || '')} ${p.managerName ? `· PM ${esc(p.managerName)}` : ''} · ${App.fmtDate(p.startDate)} → ${App.fmtDate(p.endDate)}</p><p>${esc(p.description || '')}</p></div>
        <div class="proj-nums"><div class="stat"><span>Logged</span><b>${hours(total)}h</b></div><div class="stat"><span>Budget</span><b>${p.budgetHours ? `${p.budgetHours}h` : '—'}</b></div><div class="stat"><span>Engineers</span><b>${Object.keys(byUser).length}</b></div>
          ${pct !== null ? `<div class="progress lg ${pct > 100 ? 'over' : ''}"><i style="width:${Math.min(100, pct)}%"></i></div><small class="muted">${pct}% of budget used</small>` : ''}</div>
      </section>
      <div class="grid12">
        <section class="card" style="--span:7"><header><h3>Effort by engineer</h3></header>
          ${Object.keys(byUser).length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Engineer</th><th class="num">Time</th><th>Activities</th></tr></thead><tbody>
          ${Object.entries(byUser).sort((a, b) => b[1].minutes - a[1].minutes).map(([uid, u]) => `<tr><td>${App.avatar(App.user(uid) || { id: uid, name: u.name }, 26)} ${esc(u.name)}</td><td class="num"><b>${fmtMins(u.minutes)}</b></td><td>${Object.entries(u.acts).map(([c, m]) => `<span class="tag ghost">${esc(c)} ${fmtMins(m)}</span>`).join('')}</td></tr>`).join('')}
          </tbody></table></div>` : App.empty('No time logged yet')}</section>
        <section class="card" style="--span:5"><header><h3>Activity breakdown</h3></header><div class="chart-box sm"><canvas id="pc"></canvas></div></section>
        <section class="card" style="--span:12"><header><h3>Recent work log</h3></header>
          ${entries.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Engineer</th><th>Activity</th><th class="num">Time</th></tr></thead><tbody>${entries.slice(0, 40).map((e) => `<tr><td>${App.fmtDate(e.date)}</td><td>${esc(e.userName)}</td><td><span class="tag ghost">${esc(e.category)}</span> ${esc(e.activity)}</td><td class="num">${fmtMins(e.minutes)}</td></tr>`).join('')}</tbody></table></div>` : App.empty('No entries')}</section>
      </div>`;
    const cats = Object.entries(byCat);
    if (cats.length) {
      App.chart(el.querySelector('#pc'), {
        type: 'doughnut',
        data: { labels: cats.map((c) => c[0]), datasets: [{ data: cats.map((c) => +(c[1] / 60).toFixed(1)), backgroundColor: cats.map((c, i) => App.catColor(c[0], i)), borderWidth: 0 }] },
        options: { maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } } },
      });
    }
  }

  App.pages.projects = {
    title: 'Projects',
    async render(el, params, alive) {
      if (params[0]) return detail(el, params[0], alive);
      const list = await App.get('/api/projects');
      if (!alive()) return;
      const shown = list.filter((p) => !filter || p.status === filter);
      el.innerHTML = `<div class="toolbar">
          <div class="seg">${['Active', 'Planned', 'On Hold', 'Completed', 'Archived', ''].map((s) => `<button data-f="${s}" class="${filter === s ? 'on' : ''}">${s || 'All'} <em>${list.filter((p) => !s || p.status === s).length}</em></button>`).join('')}</div>
          <span class="grow"></span>
          ${App.can('projects', 'create') ? `<button class="btn primary" id="new">${icon('plus', 16)} New project</button>` : ''}
        </div>
        ${shown.length ? `<div class="proj-grid">${shown.map((p) => {
          const h = p.loggedMinutes / 60; const pct = p.budgetHours ? Math.round(h / p.budgetHours * 100) : null;
          return `<article class="card proj" style="--pc:${esc(p.color || '#4f46e5')}" data-open="${p.id}">
            <div class="proj-top"><span class="tag">${esc(p.code || 'PRJ')}</span>${App.statusPill(p.status)}<span class="grow"></span>
              ${App.can('projects', 'edit') ? `<button class="icon-btn" data-edit="${p.id}" title="Edit">${icon('edit', 16)}</button>` : ''}
              ${App.can('projects', 'delete') ? `<button class="icon-btn" data-del="${p.id}" title="Delete">${icon('trash', 16)}</button>` : ''}</div>
            <h3>${esc(p.name)}</h3><p class="muted">${esc(p.client || 'Internal')}${p.managerName ? ` · PM ${esc(p.managerName)}` : ''}</p>
            <div class="proj-meta"><span><b>${hours(p.loggedMinutes)}h</b> logged</span><span><b>${p.contributors}</b> engineer(s)</span>${p.budgetHours ? `<span><b>${p.budgetHours}h</b> budget</span>` : ''}</div>
            ${pct !== null ? `<div class="progress ${pct > 100 ? 'over' : ''}"><i style="width:${Math.min(100, pct)}%"></i></div><small class="muted">${pct}% of budget</small>` : ''}
          </article>`;
        }).join('')}</div>` : App.empty('No projects here', 'Create a project so engineers can log time against it.')}`;
      el.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.f; App.render(); }));
      el.querySelector('#new')?.addEventListener('click', () => projectModal());
      el.querySelectorAll('[data-open]').forEach((c) => c.addEventListener('click', (e) => { if (!e.target.closest('button')) App.go(`projects/${c.dataset.open}`); }));
      el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => projectModal(list.find((p) => p.id === b.dataset.edit))));
      el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
        const p = list.find((x) => x.id === b.dataset.del);
        if (!await App.confirm('Delete project', `Delete “${p.name}”? Logged time is kept in reports under the project name.`)) return;
        try { await App.del(`/api/projects/${p.id}`); App.toast('Project deleted'); await App.refreshMeta(); App.render(); } catch (e) { App.fail(e); }
      }));
    },
  };
})();
