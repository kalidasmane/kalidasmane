/* Daily Tracker: engineers log what they worked on, for which project, and how long. */
(() => {
  const { esc, icon, fmtMins } = App;
  const state = { userId: '', anchor: App.today(), view: 'week', projectId: '', category: '' };

  const weekStart = (ds) => { const d = new Date(`${ds}T12:00:00`); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return App.dateStr(d); };

  // Shared entry modal (used by the topbar "Log time" button and ticket pages).
  App.openEntryModal = async (entry = {}, after) => {
    const s = App.meta.settings;
    const isEdit = !!entry.id;
    const canPickUser = App.can('timesheet', 'viewAll') || App.meta.users.some((u) => u.managerId === App.me.id);
    let ticketOpts = '';
    if (App.can('tickets')) {
      try {
        const ts = await App.get('/api/tickets?status=open');
        ticketOpts = App.options(ts.map((t) => ({ value: t.id, label: `${t.number} · ${t.subject}` })), entry.ticketId, { blank: 'No ticket' });
      } catch { /* optional */ }
    }
    const hrs = entry.minutes ? Math.floor(entry.minutes / 60) : '';
    const mins = entry.minutes ? entry.minutes % 60 : '';
    App.modal({
      title: isEdit ? 'Edit tracker entry' : 'Log your work',
      wide: true,
      body: `<div class="form-grid">
        ${canPickUser ? `<label>Engineer<select name="userId">${App.options(App.meta.users.filter((u) => App.can('timesheet', 'viewAll') || u.id === App.me.id || u.managerId === App.me.id).map((u) => ({ value: u.id, label: u.name })), entry.userId || App.me.id)}</select></label>` : ''}
        <label>Date<input type="date" name="date" value="${esc(entry.date || App.today())}" max="${App.addDays(App.today(), 7)}" required></label>
        <label>Project<select name="projectId">${App.projectOptions(entry.projectId, '— None (support / other) —')}</select></label>
        <label>Activity type<select name="category">${App.options(s.activityCategories, entry.category || (entry.ticketId ? 'Customer Support' : 'Project Work'))}</select></label>
        <label class="span2">What did you work on?<input name="activity" value="${esc(entry.activity || '')}" placeholder="e.g. Configured Azure VPN gateway for Cloud Migration" required></label>
        <fieldset class="span2 duration"><legend>Duration</legend>
          <div class="dur-row">
            <label>Hours<input type="number" name="hours" min="0" max="24" value="${hrs}" placeholder="0"></label>
            <label>Minutes<input type="number" name="minutes" min="0" max="59" step="5" value="${mins}" placeholder="0"></label>
            <span class="or">or</span>
            <label>Start<input type="time" name="startTime" value="${esc(entry.startTime || '')}"></label>
            <label>End<input type="time" name="endTime" value="${esc(entry.endTime || '')}"></label>
          </div>
          <div class="chips" id="dur-chips">${[15, 30, 60, 90, 120, 240, 480].map((m) => `<button type="button" class="chip" data-m="${m}">${fmtMins(m)}</button>`).join('')}</div>
        </fieldset>
        ${ticketOpts ? `<label>Related ticket<select name="ticketId">${ticketOpts}</select></label>` : ''}
        <label>Customer (for support)<input name="customer" value="${esc(entry.customer || '')}" placeholder="Customer / requester"></label>
        <label class="span2">Notes<textarea name="notes" rows="2" placeholder="Optional details">${esc(entry.notes || '')}</textarea></label>
        <label class="check span2"><input type="checkbox" name="billable" ${entry.billable ? 'checked' : ''}> Billable</label>
        <p class="hint span2">${icon('link', 14)} Tip: if you leave Project empty but mention a project name or code (e.g. “CLD” or “Cloud Migration”) in the description, it is linked automatically.</p>
      </div>`,
      submitLabel: isEdit ? 'Save changes' : 'Add entry',
      onOpen: (form) => {
        form.querySelectorAll('#dur-chips .chip').forEach((c) => c.addEventListener('click', () => {
          const m = Number(c.dataset.m);
          form.hours.value = Math.floor(m / 60); form.minutes.value = m % 60;
          form.startTime.value = ''; form.endTime.value = '';
        }));
      },
      onSubmit: async (f) => {
        if (!f.ticketId) f.ticketId = null;
        const r = isEdit ? await App.put(`/api/timesheets/${entry.id}`, f) : await App.post('/api/timesheets', f);
        App.toast(r.autoDetected ? `Saved – linked to project “${r.projectName}” automatically` : 'Entry saved');
        after?.(r);
      },
    });
  };

  App.pages.tracker = {
    title: 'Daily Tracker',
    async render(el, params, alive) {
      const canAll = App.can('timesheet', 'viewAll');
      const team = App.meta.users.filter((u) => canAll || u.id === App.me.id || u.managerId === App.me.id);
      if (!state.userId) state.userId = App.me.id;
      let from; let to;
      if (state.view === 'day') { from = to = state.anchor; } else if (state.view === 'week') { from = weekStart(state.anchor); to = App.addDays(from, 6); } else {
        from = `${state.anchor.slice(0, 8)}01`;
        const d = new Date(`${from}T12:00:00`); d.setMonth(d.getMonth() + 1); d.setDate(0); to = App.dateStr(d);
      }
      const qs = new URLSearchParams({ from, to, userId: state.userId === 'all' ? '' : state.userId, projectId: state.projectId, category: state.category });
      const entries = await App.get(`/api/timesheets?${qs}`);
      if (!alive()) return;
      const target = (Number(App.meta.settings.dailyTargetHours) || 8) * 60;
      const total = entries.reduce((s, e) => s + e.minutes, 0);

      // per-day totals for the week strip
      const ws = weekStart(state.anchor);
      const weekDays = [...Array(7)].map((_, i) => App.addDays(ws, i));
      const perDay = {};
      for (const e of entries) perDay[e.date] = (perDay[e.date] || 0) + e.minutes;

      const byDate = {};
      for (const e of entries) (byDate[e.date] = byDate[e.date] || []).push(e);
      const dates = Object.keys(byDate).sort().reverse();
      const label = state.view === 'day' ? App.fmtDate(from) : state.view === 'week' ? `${App.fmtDate(from)} – ${App.fmtDate(to)}` : new Date(`${from}T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      const multiUser = state.userId === 'all';

      el.innerHTML = `
        <div class="toolbar">
          <div class="seg">${['day', 'week', 'month'].map((v) => `<button data-view="${v}" class="${state.view === v ? 'on' : ''}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>
          <div class="date-nav"><button class="icon-btn" data-step="-1">${icon('left')}</button><button class="btn sm ghost" data-step="0">Today</button><button class="icon-btn" data-step="1">${icon('right')}</button><b>${label}</b></div>
          <span class="grow"></span>
          ${team.length > 1 ? `<select id="t-user">${App.options([...(canAll || team.length > 1 ? [{ value: 'all', label: 'Everyone in my scope' }] : []), ...team.map((u) => ({ value: u.id, label: u.id === App.me.id ? `${u.name} (me)` : u.name }))], state.userId)}</select>` : ''}
          <select id="t-project">${App.options([{ value: 'none', label: 'Support / no project' }, ...App.meta.projects.map((p) => ({ value: p.id, label: p.name }))], state.projectId, { blank: 'All projects' })}</select>
          <select id="t-cat">${App.options(App.meta.settings.activityCategories, state.category, { blank: 'All activity types' })}</select>
        </div>
        ${state.view === 'week' && !multiUser ? `<div class="week-strip">${weekDays.map((d) => {
          const m = perDay[d] || 0; const pct = Math.min(100, m / target * 100);
          return `<button class="day ${d === App.today() ? 'today' : ''} ${d === state.anchor ? 'sel' : ''}" data-day="${d}">
            <span>${new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</span><b>${new Date(`${d}T12:00:00`).getDate()}</b>
            <div class="progress ${pct >= 100 ? 'done' : ''}"><i style="width:${pct}%"></i></div><small>${m ? fmtMins(m) : '—'}</small></button>`;
        }).join('')}</div>` : ''}
        <div class="summary-row">
          <div class="stat"><span>Total logged</span><b>${fmtMins(total)}</b></div>
          <div class="stat"><span>Project work</span><b>${fmtMins(entries.filter((e) => e.projectId).reduce((s, e) => s + e.minutes, 0))}</b></div>
          <div class="stat"><span>Customer support</span><b>${fmtMins(entries.filter((e) => e.category === 'Customer Support').reduce((s, e) => s + e.minutes, 0))}</b></div>
          <div class="stat"><span>Entries</span><b>${entries.length}</b></div>
          <span class="grow"></span>
          ${App.can('timesheet', 'create') ? `<button class="btn primary" id="add-entry">${icon('plus', 16)} Log time</button>` : ''}
        </div>
        ${App.can('timesheet', 'create') && !multiUser ? `<form class="quick-entry card" id="quick">
          <input type="date" name="date" value="${state.view === 'day' ? state.anchor : App.today()}" required>
          <select name="projectId">${App.projectOptions('', '— Support / other —')}</select>
          <select name="category">${App.options(App.meta.settings.activityCategories, 'Project Work')}</select>
          <input name="activity" placeholder="What did you work on? (project name in text auto-links)" required class="grow">
          <input name="hours" type="number" step="0.25" min="0" max="24" placeholder="Hours" required class="w80">
          <button class="btn primary" type="submit">Add</button>
        </form>` : ''}
        <div id="entries">${dates.length ? dates.map((d) => {
          const list = byDate[d]; const sum = list.reduce((s, e) => s + e.minutes, 0);
          return `<section class="card day-group"><header><h3>${new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h3><span class="pill ${!multiUser && sum >= target ? 'st-resolved' : ''}">${fmtMins(sum)}</span></header>
            <div class="table-wrap"><table class="table"><tbody>${list.map((e) => `<tr>
              ${multiUser ? `<td class="w-user">${App.avatar(App.user(e.userId) || { id: e.userId, name: e.userName }, 26)} ${esc(e.userName)}</td>` : ''}
              <td class="w-time"><b>${fmtMins(e.minutes)}</b>${e.startTime ? `<small>${esc(e.startTime)}–${esc(e.endTime)}</small>` : ''}</td>
              <td>${e.projectName ? `<span class="tag">${esc(e.projectName)}</span>${e.autoDetected ? '<span class="tag ghost" title="Linked from the activity text">auto</span>' : ''}` : ''}<span class="tag ${e.category === 'Customer Support' ? 'amber' : 'ghost'}">${esc(e.category)}</span>${e.ticketNumber ? `<a class="tag link" href="#/tickets/${e.ticketId}">${esc(e.ticketNumber)}</a>` : ''}
                <div class="activity">${esc(e.activity)}${e.customer ? ` <span class="muted">· ${esc(e.customer)}</span>` : ''}</div>${e.notes ? `<small class="muted">${esc(e.notes)}</small>` : ''}</td>
              <td class="row-actions">${App.can('timesheet', 'edit') ? `<button class="icon-btn" data-edit="${e.id}" title="Edit">${icon('edit', 16)}</button>` : ''}${App.can('timesheet', 'delete') ? `<button class="icon-btn" data-del="${e.id}" title="Delete">${icon('trash', 16)}</button>` : ''}</td>
            </tr>`).join('')}</tbody></table></div></section>`;
        }).join('') : App.empty('Nothing logged for this period', 'Use “Log time” to record what you worked on — projects, customer queries, meetings.')}</div>`;

      // events
      el.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { state.view = b.dataset.view; App.render(); }));
      el.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
        const n = Number(b.dataset.step);
        if (!n) state.anchor = App.today();
        else if (state.view === 'day') state.anchor = App.addDays(state.anchor, n);
        else if (state.view === 'week') state.anchor = App.addDays(state.anchor, 7 * n);
        else { const d = new Date(`${state.anchor.slice(0, 8)}15T12:00:00`); d.setMonth(d.getMonth() + n); state.anchor = App.dateStr(d); }
        App.render();
      }));
      el.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => { state.anchor = b.dataset.day; state.view = 'day'; App.render(); }));
      el.querySelector('#t-user')?.addEventListener('change', (e) => { state.userId = e.target.value; App.render(); });
      el.querySelector('#t-project').addEventListener('change', (e) => { state.projectId = e.target.value; App.render(); });
      el.querySelector('#t-cat').addEventListener('change', (e) => { state.category = e.target.value; App.render(); });
      el.querySelector('#add-entry')?.addEventListener('click', () => App.openEntryModal({ date: state.view === 'day' ? state.anchor : App.today(), userId: state.userId }, App.render));
      el.querySelector('#quick')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = App.formData(e.target);
        try {
          if (state.userId !== App.me.id) f.userId = state.userId;
          const r = await App.post('/api/timesheets', f);
          App.toast(r.autoDetected ? `Added – linked to “${r.projectName}” automatically` : 'Entry added');
          App.render();
        } catch (err) { App.fail(err); }
      });
      el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => App.openEntryModal(entries.find((x) => x.id === b.dataset.edit), App.render)));
      el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
        if (!await App.confirm('Delete entry', 'Delete this tracker entry? This cannot be undone.')) return;
        try { await App.del(`/api/timesheets/${b.dataset.del}`); App.toast('Entry deleted'); App.render(); } catch (err) { App.fail(err); }
      }));
    },
  };
})();
