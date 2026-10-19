/* Tickets: service-desk queue, detail view, assignment with workload lights. */
(() => {
  const { esc, icon, fmtMins } = App;
  const state = { status: 'open', assigneeId: '', priority: '', q: '' };
  const SOURCE_ICON = { web: 'layout', email: 'mail', form: 'form', portal: 'link', automation: 'flow' };

  App.openNewTicket = async () => {
    const s = App.meta.settings;
    const forms = App.meta.forms.filter((f) => f.active);
    const canAssign = App.can('tickets', 'assign');
    App.modal({
      title: 'New ticket',
      wide: true,
      body: `${forms.length ? `<div class="tabs-inline"><label class="check"><input type="radio" name="mode" value="blank" checked> Quick ticket</label>${forms.map((f) => `<label class="check"><input type="radio" name="mode" value="${f.id}"> ${esc(f.name)}</label>`).join('')}</div>` : ''}
        <div id="nt-body"></div>`,
      submitLabel: 'Create ticket',
      onOpen: (form) => {
        const area = form.querySelector('#nt-body');
        const draw = async (mode) => {
          if (mode === 'blank' || !mode) {
            area.innerHTML = `<div class="form-grid">
              <label class="span2">Subject<input name="subject" required></label>
              <label class="span2">Description<textarea name="description" rows="4"></textarea></label>
              <label>Requester name<input name="requesterName" value="${esc(App.me.name)}"></label>
              <label>Requester email<input name="requesterEmail" type="email" value="${esc(App.me.email || '')}"></label>
              <label>Category<select name="category">${App.options(s.ticketCategories)}</select></label>
              <label>Priority<select name="priority">${App.options(s.ticketPriorities, 'Medium')}</select></label>
              <label>Project<select name="projectId">${App.projectOptions('')}</select></label>
              ${App.meta.devices?.length ? `<label>Device<select name="deviceId">${App.options(App.meta.devices.map((d) => ({ value: d.id, label: `${d.name}${d.customer ? ` · ${d.customer}` : ''}` })), '', { blank: '— None —' })}</select></label>` : ''}
              ${canAssign ? `<label>Assign to <small class="muted">(hover a light to see workload)</small>${App.userPicker('assigneeId', '')}</label>` : ''}
            </div>`;
          } else {
            const f = (await App.get('/api/forms').catch(() => null))?.find((x) => x.id === mode);
            if (!f) { area.innerHTML = '<p class="muted">This form is not available to you.</p>'; return; }
            area.innerHTML = `<p class="muted">${esc(f.description || '')}</p><div class="form-grid">${App.renderFormFields(f.fields, { name: App.me.name, email: App.me.email })}</div>`;
          }
          App.enhance(area);
        };
        draw('blank');
        form.querySelectorAll('[name=mode]').forEach((r) => r.addEventListener('change', () => draw(r.value)));
      },
      onSubmit: async (f) => {
        const mode = f.mode || 'blank';
        delete f.mode;
        const t = mode === 'blank' ? await App.post('/api/tickets', f) : await App.post(`/api/forms/${mode}/submit`, f);
        App.toast(`Ticket ${t.number} created${t.assigneeName ? ` and assigned to ${t.assigneeName}` : ''}`);
        await App.refreshMeta();
        App.go(`tickets/${t.id}`);
        App.render();
      },
    });
  };

  App.renderFormFields = (fields, defaults = {}) => fields.map((f) => {
    const req = f.required ? 'required' : '';
    const v = esc(defaults[f.key] ?? '');
    const lbl = `${esc(f.label)}${f.required ? ' <span class="req">*</span>' : ''}`;
    switch (f.type) {
      case 'textarea': return `<label class="span2">${lbl}<textarea name="${esc(f.key)}" rows="4" ${req}>${v}</textarea></label>`;
      case 'select': return `<label>${lbl}<select name="${esc(f.key)}" ${req}>${App.options(f.options || [], defaults[f.key], { blank: 'Select…' })}</select></label>`;
      case 'checkbox': return `<label class="check span2"><input type="checkbox" name="${esc(f.key)}"> ${lbl}</label>`;
      default: return `<label>${lbl}<input type="${esc(f.type)}" name="${esc(f.key)}" value="${v}" ${req}></label>`;
    }
  }).join('');

  async function listView(el, alive) {
    const qs = new URLSearchParams(state);
    const list = await App.get(`/api/tickets?${qs}`);
    if (!alive()) return;
    const s = App.meta.settings;
    el.innerHTML = `
      <div class="toolbar">
        <div class="search">${icon('search', 16)}<input id="tq" placeholder="Search number, subject, requester…" value="${esc(state.q)}"></div>
        <select id="ts">${App.options([{ value: 'open', label: 'All open' }, { value: '', label: 'All statuses' }, ...s.ticketStatuses.map((x) => ({ value: x, label: x }))], state.status)}</select>
        <select id="tp">${App.options(s.ticketPriorities, state.priority, { blank: 'All priorities' })}</select>
        <select id="ta">${App.options([{ value: 'none', label: 'Unassigned' }, ...App.meta.users.map((u) => ({ value: u.id, label: u.name }))], state.assigneeId, { blank: 'All assignees' })}</select>
        <span class="grow"></span>
        <button class="btn ghost sm" id="csv">${icon('download', 16)} Export</button>
        ${App.can('tickets', 'create') ? `<button class="btn primary" id="new">${icon('plus', 16)} New ticket</button>` : ''}
      </div>
      <div class="card">${list.length ? `<div class="table-wrap"><table class="table hover">
        <thead><tr><th>Ticket</th><th>Subject</th><th>Requester</th><th>Priority</th><th>Status</th><th>Assignee</th><th>Due</th><th class="num">Time</th></tr></thead>
        <tbody>${list.map((t) => `<tr data-open="${t.id}">
          <td class="nowrap"><span class="src" title="via ${esc(t.source)}">${icon(SOURCE_ICON[t.source] || 'ticket', 15)}</span><b>${esc(t.number)}</b></td>
          <td class="subject"><b>${esc(t.subject)}</b><small class="muted">${esc(t.category)}${t.projectName ? ` · ${esc(t.projectName)}` : ''}${t.commentCount ? ` · ${t.commentCount} comment(s)` : ''}</small></td>
          <td>${esc(t.requesterName || '')}<small class="muted">${esc(t.requesterEmail || '')}</small></td>
          <td>${App.priorityPill(t.priority)}</td><td>${App.statusPill(t.status)}</td>
          <td>${App.userChip(App.user(t.assigneeId))}</td>
          <td class="${t.overdue ? 'bad' : ''}">${t.overdue ? '⚠ ' : ''}${App.fmtDateTime(t.dueAt)}</td>
          <td class="num">${t.timeSpentMinutes ? fmtMins(t.timeSpentMinutes) : '—'}</td></tr>`).join('')}</tbody></table></div>` : App.empty('No tickets found', 'Try changing the filters.')}</div>`;
    const q = el.querySelector('#tq');
    q.addEventListener('input', App.debounce(() => { state.q = q.value; App.render().then(() => { const n = document.getElementById('tq'); n?.focus(); n?.setSelectionRange(n.value.length, n.value.length); }); }, 350));
    el.querySelector('#ts').addEventListener('change', (e) => { state.status = e.target.value; App.render(); });
    el.querySelector('#tp').addEventListener('change', (e) => { state.priority = e.target.value; App.render(); });
    el.querySelector('#ta').addEventListener('change', (e) => { state.assigneeId = e.target.value; App.render(); });
    el.querySelector('#new')?.addEventListener('click', App.openNewTicket);
    el.querySelectorAll('[data-open]').forEach((r) => r.addEventListener('click', () => App.go(`tickets/${r.dataset.open}`)));
    el.querySelector('#csv').addEventListener('click', () => App.downloadCSV('tickets.csv', [
      ['Number', 'Subject', 'Category', 'Priority', 'Status', 'Assignee', 'Requester', 'Requester email', 'Project', 'Source', 'Created', 'Due', 'Resolved', 'Time spent (h)'],
      ...list.map((t) => [t.number, t.subject, t.category, t.priority, t.status, t.assigneeName || '', t.requesterName, t.requesterEmail, t.projectName || '', t.source, t.createdAt, t.dueAt, t.resolvedAt || '', App.hours(t.timeSpentMinutes)]),
    ]));
  }

  async function detailView(el, id, alive) {
    const t = await App.get(`/api/tickets/${id}`);
    if (!alive()) return;
    const s = App.meta.settings;
    const canEdit = App.can('tickets', 'edit');
    const canAssign = App.can('tickets', 'assign') || (!t.assigneeId && canEdit);
    const comments = t.comments || [];
    el.innerHTML = `
      <a class="back" href="#/tickets">${icon('left', 16)} All tickets</a>
      <div class="ticket-layout">
        <div>
          <section class="card ticket-head">
            <div class="th-top"><span class="tnum">${esc(t.number)}</span>${App.priorityPill(t.priority)}${App.statusPill(t.status)}${t.overdue ? '<span class="pill prio-critical">SLA breached</span>' : ''}<span class="grow"></span>
              ${App.can('tickets', 'delete') ? `<button class="icon-btn" id="del" title="Delete ticket">${icon('trash', 16)}</button>` : ''}</div>
            <h2>${esc(t.subject)}</h2>
            <p class="muted">Raised by <b>${esc(t.requesterName || '—')}</b> ${t.requesterEmail ? `&lt;${esc(t.requesterEmail)}&gt;` : ''} via ${esc(t.source)}${t.formName ? ` (${esc(t.formName)})` : ''} · ${App.fmtDateTime(t.createdAt)}</p>
            <div class="desc">${esc(t.description || 'No description').replace(/\n/g, '<br>')}</div>
          </section>
          <section class="card">
            <header><h3>Conversation & history</h3></header>
            <ul class="timeline">${comments.map((c) => `<li class="${c.system ? 'sys' : c.internal ? 'internal' : ''}">
              <div class="tl-dot"></div><div class="tl-body"><div class="tl-meta"><b>${esc(c.authorName)}</b>${c.internal && !c.system ? '<span class="tag ghost">internal note</span>' : ''}<small class="muted">${App.fmtDateTime(c.at)}</small></div>
              <div>${esc(c.text).replace(/\n/g, '<br>')}</div></div></li>`).join('')}</ul>
            <form id="comment" class="comment-box">
              <textarea name="text" rows="3" placeholder="Write a reply or an internal note…" required></textarea>
              <div class="row"><label class="check"><input type="checkbox" name="internal" checked> Internal note (not emailed to requester)</label><span class="grow"></span><button class="btn primary sm" type="submit">Post</button></div>
            </form>
          </section>
        </div>
        <aside>
          <form class="card side-form" id="props">
            <header><h3>Details</h3></header>
            <label>Status<select name="status" ${canEdit ? '' : 'disabled'}>${App.options(s.ticketStatuses, t.status)}</select></label>
            <label>Priority<select name="priority" ${canEdit ? '' : 'disabled'}>${App.options(s.ticketPriorities, t.priority)}</select></label>
            <label>Category<select name="category" ${canEdit ? '' : 'disabled'}>${App.options(s.ticketCategories, t.category)}</select></label>
            <label>Assignee ${canAssign ? '' : '<small class="muted">(no assign permission)</small>'}${canAssign ? App.userPicker('assigneeId', t.assigneeId) : `<div>${App.userChip(App.user(t.assigneeId))}</div>`}</label>
            ${!t.assigneeId && canEdit && !App.can('tickets', 'assign') ? '<button type="button" class="btn sm" id="take">Assign to me</button>' : ''}
            <label>Project<select name="projectId" ${canEdit ? '' : 'disabled'}>${App.projectOptions(t.projectId)}</select></label>
            ${App.meta.devices?.length || t.deviceId ? `<label>Device<select name="deviceId" ${canEdit ? '' : 'disabled'}>${App.options(App.meta.devices.map((d) => ({ value: d.id, label: d.name })), t.deviceId, { blank: '— None —' })}</select></label>` : ''}
            ${t.deviceId && App.can('devices', 'connect') ? `<button type="button" class="btn sm primary remote-btn" id="remote">${icon('monitor', 15)} Remote session to ${esc(t.deviceName || 'device')}</button>` : ''}
            <dl class="facts"><dt>Due (SLA)</dt><dd class="${t.overdue ? 'bad' : ''}">${App.fmtDateTime(t.dueAt)}</dd><dt>Resolved</dt><dd>${App.fmtDateTime(t.resolvedAt)}</dd><dt>Time spent</dt><dd>${fmtMins(t.timeSpentMinutes)}</dd></dl>
          </form>
          <section class="card">
            <header><h3>Time logged</h3>${App.can('timesheet', 'create') ? `<button class="btn sm" id="logtime">${icon('clock', 15)} Log time</button>` : ''}</header>
            ${t.timeEntries.length ? `<ul class="mini-list">${t.timeEntries.map((e) => `<li>${App.avatar(App.user(e.userId) || { id: e.userId, name: e.userName }, 24)}<span>${esc(e.userName)}<small class="muted">${App.fmtDate(e.date)} · ${esc(e.activity)}</small></span><b>${fmtMins(e.minutes)}</b></li>`).join('')}</ul>` : '<p class="muted pad">No time logged yet.</p>'}
          </section>
        </aside>
      </div>`;

    const props = el.querySelector('#props');
    props.addEventListener('change', async () => {
      try {
        const f = App.formData(props);
        await App.put(`/api/tickets/${t.id}`, f);
        App.toast('Ticket updated');
        await App.refreshMeta();
        App.render();
      } catch (e) { App.fail(e); }
    });
    App.enhance(props);
    el.querySelector('#remote')?.addEventListener('click', () => App.startRemote(t.deviceId, 'desktop', t.id));
    el.querySelector('#take')?.addEventListener('click', async () => {
      try { await App.put(`/api/tickets/${t.id}`, { assigneeId: App.me.id }); await App.refreshMeta(); App.render(); } catch (e) { App.fail(e); }
    });
    el.querySelector('#comment').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await App.post(`/api/tickets/${t.id}/comments`, App.formData(e.target)); App.render(); } catch (err) { App.fail(err); }
    });
    el.querySelector('#logtime')?.addEventListener('click', () => App.openEntryModal({
      ticketId: t.id, projectId: t.projectId, category: 'Customer Support', activity: `${t.number}: ${t.subject}`, customer: t.requesterName,
    }, App.render));
    el.querySelector('#del')?.addEventListener('click', async () => {
      if (!await App.confirm('Delete ticket', `Delete ${t.number}? This cannot be undone.`)) return;
      try { await App.del(`/api/tickets/${t.id}`); await App.refreshMeta(); App.go('tickets'); } catch (e) { App.fail(e); }
    });
  }

  App.pages.tickets = {
    title: 'Tickets',
    render: (el, params, alive) => (params[0] ? detailView(el, params[0], alive) : listView(el, alive)),
  };
})();
