/* Tickets: service-desk queue, detail view, assignment with workload lights. */
(() => {
  const { esc, icon, fmtMins } = App;
  const state = { status: 'open', assigneeId: '', priority: '', sla: '', q: '' };
  const itil = () => App.meta.itil;
  const levelOptions = (kind, sel) => App.options(itil().levels.map((l) => ({ value: l, label: `${l} – ${itil()[kind][l]}` })), sel);
  // Shows the priority the ITIL matrix gives for the chosen impact × urgency.
  const bindMatrix = (scope) => {
    const out = scope.querySelector('[data-prio-preview]');
    const sel = scope.querySelector('select[name=priority]');
    const upd = () => {
      const p = itil().matrix?.[scope.querySelector('[name=impact]').value]?.[scope.querySelector('[name=urgency]').value];
      if (out) out.innerHTML = sel?.value ? 'Priority set by hand' : `Priority from the matrix: ${p ? App.priorityPill(p) : '—'}`;
    };
    scope.querySelectorAll('[name=impact],[name=urgency],select[name=priority]').forEach((x) => x.addEventListener('change', upd));
    upd();
  };
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
              <label class="span2">Notify also (CC) <small class="muted">email addresses, comma-separated – they get status updates and replies</small><input name="watchers" placeholder="manager@customer.com, it-lead@yourcompany.com"></label>
              <label>Category<select name="category">${App.options(s.ticketCategories)}</select></label>
              <label>Impact <small class="muted">(who is affected)</small><select name="impact">${levelOptions('impact', 'Low')}</select></label>
              <label>Urgency <small class="muted">(how soon it hurts)</small><select name="urgency">${levelOptions('urgency', 'Medium')}</select></label>
              <label>Priority<select name="priority">${App.priorityOptions('', { blank: 'Auto – from impact × urgency' })}</select></label>
              <div class="prio-preview" data-prio-preview></div>
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
          if (area.querySelector('[name=impact]')) bindMatrix(area);
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

  // List cell: the clock that matters now (response until answered, then resolution).
  function slaCell(t) {
    const c = App.slaClock(t);
    if (!c) return '—';
    const which = c === t.sla.response ? 'Response' : 'Resolution';
    return `<div class="sla-cell" title="${esc(`${which} target ${c.targetText} · due ${App.fmtDateTime(c.dueAt)}`)}">${App.slaBadge(c)}<small>${which} · ${esc(App.slaDue(c))}</small></div>`;
  }

  async function listView(el, alive) {
    const qs = new URLSearchParams(state);
    const list = await App.get(`/api/tickets?${qs}`);
    if (!alive()) return;
    const s = App.meta.settings;
    el.innerHTML = `
      <div class="toolbar">
        <div class="search">${icon('search', 16)}<input id="tq" placeholder="Search number, subject, requester…" value="${esc(state.q)}"></div>
        <select id="ts">${App.options([{ value: 'open', label: 'All open' }, { value: '', label: 'All statuses' }, ...s.ticketStatuses.map((x) => ({ value: x, label: x }))], state.status)}</select>
        <select id="tp">${App.priorityOptions(state.priority, { blank: 'All priorities' })}</select>
        <select id="tsla">${App.options([{ value: 'breached', label: 'SLA breached' }, { value: 'at_risk', label: 'SLA at risk' }, { value: 'paused', label: 'SLA paused' }, { value: 'ok', label: 'SLA on track' }], state.sla, { blank: 'Any SLA state' })}</select>
        <select id="ta">${App.options([{ value: 'none', label: 'Unassigned' }, ...App.meta.users.map((u) => ({ value: u.id, label: u.name }))], state.assigneeId, { blank: 'All assignees' })}</select>
        <span class="grow"></span>
        <button class="btn ghost sm" id="csv">${icon('download', 16)} Export</button>
        ${App.can('tickets', 'create') ? `<button class="btn primary" id="new">${icon('plus', 16)} New ticket</button>` : ''}
      </div>
      <div class="card">${list.length ? `<div class="table-wrap"><table class="table hover">
        <thead><tr><th>Ticket</th><th>Subject</th><th>Requester</th><th>Priority</th><th>Status</th><th>Assignee</th><th>SLA</th><th class="num">Time</th></tr></thead>
        <tbody>${list.map((t) => `<tr data-open="${t.id}">
          <td class="nowrap"><span class="src" title="via ${esc(t.source)}">${icon(SOURCE_ICON[t.source] || 'ticket', 15)}</span><b>${esc(t.number)}</b></td>
          <td class="subject"><b>${esc(t.subject)}</b><small class="muted">${esc(t.category)}${t.projectName ? ` · ${esc(t.projectName)}` : ''}${t.commentCount ? ` · ${t.commentCount} comment(s)` : ''}</small></td>
          <td>${esc(t.requesterName || '')}<small class="muted">${esc(t.requesterEmail || '')}</small></td>
          <td>${App.priorityPill(t.priority)}</td><td>${App.statusPill(t.status)}</td>
          <td>${App.userChip(App.user(t.assigneeId))}</td>
          <td>${slaCell(t)}</td>
          <td class="num">${t.timeSpentMinutes ? fmtMins(t.timeSpentMinutes) : '—'}</td></tr>`).join('')}</tbody></table></div>` : App.empty('No tickets found', 'Try changing the filters.')}</div>`;
    const q = el.querySelector('#tq');
    q.addEventListener('input', App.debounce(() => { state.q = q.value; App.render().then(() => { const n = document.getElementById('tq'); n?.focus(); n?.setSelectionRange(n.value.length, n.value.length); }); }, 350));
    el.querySelector('#ts').addEventListener('change', (e) => { state.status = e.target.value; App.render(); });
    el.querySelector('#tp').addEventListener('change', (e) => { state.priority = e.target.value; App.render(); });
    el.querySelector('#tsla').addEventListener('change', (e) => { state.sla = e.target.value; App.render(); });
    el.querySelector('#ta').addEventListener('change', (e) => { state.assigneeId = e.target.value; App.render(); });
    el.querySelector('#new')?.addEventListener('click', App.openNewTicket);
    el.querySelectorAll('[data-open]').forEach((r) => r.addEventListener('click', () => App.go(`tickets/${r.dataset.open}`)));
    el.querySelector('#csv').addEventListener('click', () => App.downloadCSV('tickets.csv', [
      ['Number', 'Subject', 'Category', 'Priority', 'Impact', 'Urgency', 'Status', 'Assignee', 'Requester', 'Requester email', 'Project', 'Source', 'Created',
        'Response due', 'First response', 'Response SLA', 'Resolution due', 'Resolved', 'Resolution SLA', 'Resolution code', 'Time spent (h)'],
      ...list.map((t) => [t.number, t.subject, t.category, App.prioLabel(t.priority), t.impact || '', t.urgency || '', t.status, t.assigneeName || '', t.requesterName, t.requesterEmail, t.projectName || '', t.source, t.createdAt,
        t.sla?.response.dueAt || '', t.firstResponseAt || '', t.sla?.response.state || '', t.dueAt, t.resolvedAt || '', t.sla?.resolution.state || '', t.resolutionCode || '', App.hours(t.timeSpentMinutes)]),
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
            <div class="th-top"><span class="tnum">${esc(t.number)}</span>${App.priorityPill(t.priority)}${App.statusPill(t.status)}${t.slaBreached ? '<span class="pill sla-bad">SLA breached</span>' : ''}${t.reopenCount ? `<span class="tag ghost">reopened ${t.reopenCount}×</span>` : ''}<span class="grow"></span>
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
              <textarea name="text" rows="3" placeholder="Write a reply or an internal note… Type @username to notify a colleague." required></textarea>
              <div class="row"><label class="check"><input type="checkbox" name="internal" checked> Internal note (not emailed to requester)</label><span class="grow"></span><button class="btn primary sm" type="submit">Post</button></div>
            </form>
          </section>
        </div>
        <aside>
          ${slaCard(t)}
          <form class="card side-form" id="props">
            <header><h3>Details</h3></header>
            <label>Status<select name="status" ${canEdit ? '' : 'disabled'}>${App.options(s.ticketStatuses, t.status)}</select></label>
            ${App.meta.itil.pauseStatuses.includes(t.status) ? `<label>On-hold reason<select name="holdReason" ${canEdit ? '' : 'disabled'}>${App.options(App.meta.itil.holdReasons, t.holdReason, { blank: '— Choose —' })}</select></label>` : ''}
            <div class="grid2"><label>Impact<select name="impact" ${canEdit ? '' : 'disabled'} title="${esc(App.meta.itil.impact[t.impact] || '')}">${App.options(App.meta.itil.levels, t.impact)}</select></label>
            <label>Urgency<select name="urgency" ${canEdit ? '' : 'disabled'} title="${esc(App.meta.itil.urgency[t.urgency] || '')}">${App.options(App.meta.itil.levels, t.urgency)}</select></label></div>
            <label>Priority <small class="muted">(set by impact × urgency)</small><select name="priority" ${canEdit ? '' : 'disabled'}>${App.priorityOptions(t.priority)}</select></label>
            <label>Category<select name="category" ${canEdit ? '' : 'disabled'}>${App.options(s.ticketCategories, t.category)}</select></label>
            <label>Assignee ${canAssign ? '' : '<small class="muted">(no assign permission)</small>'}${canAssign ? App.userPicker('assigneeId', t.assigneeId) : `<div>${App.userChip(App.user(t.assigneeId))}</div>`}</label>
            ${!t.assigneeId && canEdit && !App.can('tickets', 'assign') ? '<button type="button" class="btn sm" id="take">Assign to me</button>' : ''}
            <label>Project<select name="projectId" ${canEdit ? '' : 'disabled'}>${App.projectOptions(t.projectId)}</select></label>
            <label>Notify also (CC) <small class="muted">emails, comma-separated</small><input name="watchers" value="${esc(t.watchers || '')}" placeholder="name@company.com" ${canEdit ? '' : 'disabled'}></label>
            ${App.meta.devices?.length || t.deviceId ? `<label>Device<select name="deviceId" ${canEdit ? '' : 'disabled'}>${App.options(App.meta.devices.map((d) => ({ value: d.id, label: d.name })), t.deviceId, { blank: '— None —' })}</select></label>` : ''}
            ${t.deviceId && App.can('devices', 'connect') ? `<button type="button" class="btn sm primary remote-btn" id="remote">${icon('monitor', 15)} Remote session to ${esc(t.deviceName || 'device')}</button>` : ''}
            <dl class="facts">${t.resolutionCode ? `<dt>Resolution</dt><dd>${esc(t.resolutionCode)}</dd>` : ''}<dt>Resolved</dt><dd>${App.fmtDateTime(t.resolvedAt)}</dd><dt>Time spent</dt><dd>${fmtMins(t.timeSpentMinutes)}</dd></dl>
            ${t.resolutionNotes ? `<div class="sla-meta"><b>Resolution notes</b><br>${esc(t.resolutionNotes).replace(/\n/g, '<br>')}</div>` : ''}
          </form>
          ${itsmCard(t)}
          <section class="card">
            <header><h3>Time logged</h3>${App.can('timesheet', 'create') ? `<button class="btn sm" id="logtime">${icon('clock', 15)} Log time</button>` : ''}</header>
            ${t.timeEntries.length ? `<ul class="mini-list">${t.timeEntries.map((e) => `<li>${App.avatar(App.user(e.userId) || { id: e.userId, name: e.userName }, 24)}<span>${esc(e.userName)}<small class="muted">${App.fmtDate(e.date)} · ${esc(e.activity)}</small></span><b>${fmtMins(e.minutes)}</b></li>`).join('')}</ul>` : '<p class="muted pad">No time logged yet.</p>'}
          </section>
        </aside>
      </div>`;

    const props = el.querySelector('#props');
    props.addEventListener('change', async (ev) => {
      try {
        const f = App.formData(props);
        // ITIL: resolving / closing records a resolution code and notes.
        if (ev.target.name === 'status' && s.closedStatuses.includes(f.status) && !s.closedStatuses.includes(t.status) && App.meta.itil.requireResolution) {
          ev.target.value = t.status;
          return resolveModal(t, f.status);
        }
        if (ev.target.name === 'status' && App.meta.itil.pauseStatuses.includes(f.status) && !App.meta.itil.pauseStatuses.includes(t.status)) {
          ev.target.value = t.status;
          return holdModal(t, f.status);
        }
        if (ev.target.name === 'impact' || ev.target.name === 'urgency') delete f.priority; // let the matrix decide
        await App.put(`/api/tickets/${t.id}`, f);
        App.toast('Ticket updated');
        await App.refreshMeta();
        App.render();
      } catch (e) { App.fail(e); }
    });
    App.enhance(props);
    bindItsm(el, t);
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

  function slaCard(t) {
    const st = t.sla;
    if (!st) return '';
    const row = (name, c, note) => `<div class="sla-row"><div class="sla-top"><b>${name}</b>${App.slaBadge(c)}</div>
      <div class="sla-bar ${c.state}"><i style="width:${c.pct}%"></i></div>
      <small>Target ${esc(c.targetText)} · due ${App.fmtDateTime(c.dueAt)} · ${esc(App.slaDue(c))}${note ? ` · ${note}` : ''}</small></div>`;
    return `<section class="card sla-card"><header><h3>SLA</h3>${App.priorityPill(t.priority)}</header><div class="pad">
      <p class="sla-meta">${st.hours === 'business' ? 'Business hours' : 'Around the clock (24×7)'} · impact ${esc(t.impact || '—')} × urgency ${esc(t.urgency || '—')}</p>
      ${row('First response', st.response)}
      ${row('Resolution', st.resolution, st.pausedMinutes ? `paused ${App.fmtDuration(st.pausedMinutes)}` : '')}
    </div></section>`;
  }

  // ITIL links: the problem behind this incident, matching known errors, related changes.
  function itsmCard(t) {
    const seeP = App.can('problems'); const seeC = App.can('changes');
    if (!seeP && !seeC) return '';
    const pr = t.problem;
    return `<section class="card" id="itsm"><header><h3>Problem & change</h3></header><div class="pad">
      ${seeP && pr ? `<div class="linked-rec">${icon('alert', 16)}<span><a href="#/problems/${pr.id}"><b>${esc(pr.number)}</b></a> ${esc(pr.title)}<small class="muted">${esc(pr.status)}${pr.knownError ? ' · known error' : ''}</small></span></div>
        ${pr.workaround ? `<div class="workaround small"><span class="lbl">Workaround</span>${esc(pr.workaround).replace(/\n/g, '<br>')}<button type="button" class="btn sm ghost" data-usewa="${esc(pr.workaround)}">Use in reply</button></div>` : ''}` : ''}
      ${seeP && !pr ? '<div id="kedb-hint"></div>' : ''}
      ${seeC && t.changes?.length ? t.changes.map((c) => `<div class="linked-rec">${icon('change', 16)}<span><a href="#/changes/${c.id}"><b>${esc(c.number)}</b></a> ${esc(c.title)}<small class="muted">${esc(c.status)}</small></span></div>`).join('') : ''}
      <div class="row wrap" style="margin-top:8px">
        ${seeP && !pr && App.can('problems', 'create') ? `<button type="button" class="btn sm" id="mkprob">${icon('alert', 15)} Create problem</button>` : ''}
        ${seeP && !pr && App.can('problems', 'edit') ? `<button type="button" class="btn sm ghost" id="linkprob">${icon('link', 15)} Link to problem</button>` : ''}
        ${seeC && App.can('changes', 'create') ? `<button type="button" class="btn sm ghost" id="mkchg">${icon('change', 15)} Raise change</button>` : ''}
      </div></div></section>`;
  }

  function bindItsm(el, t) {
    const useWorkaround = (text) => {
      const box = el.querySelector('#comment [name=text]');
      box.value = `${box.value ? `${box.value}\n\n` : ''}${text}`;
      el.querySelector('#comment [name=internal]').checked = false;
      box.focus();
      App.toast('Workaround added to the reply – review it and press Post', 'info');
    };
    el.querySelectorAll('[data-usewa]').forEach((b) => b.addEventListener('click', () => useWorkaround(b.dataset.usewa)));
    el.querySelector('#mkprob')?.addEventListener('click', () => App.openNewProblem({
      incidentIds: [t.id], title: t.subject, description: `Raised from incident ${t.number}.\n\n${t.description || ''}`.trim(),
      category: t.category, impact: t.impact, urgency: t.urgency, projectId: t.projectId,
    }));
    el.querySelector('#mkchg')?.addEventListener('click', () => App.openNewChange({ incidentIds: [t.id], title: `Change for ${t.number}: ${t.subject}`.slice(0, 200), deviceIds: t.deviceId ? [t.deviceId] : [] }));
    el.querySelector('#linkprob')?.addEventListener('click', async () => {
      const open = await App.get('/api/problems?status=open');
      App.modal({
        title: `Link ${t.number} to a problem`,
        body: open.length ? `<label>Problem<select name="problemId">${App.options(open.map((p) => ({ value: p.id, label: `${p.number} – ${p.title}` })))}</select></label>` : '<p class="muted">There are no open problems. Create one instead.</p>',
        submitLabel: 'Link',
        onSubmit: open.length ? async (f) => { await App.post(`/api/problems/${f.problemId}/link`, { ticketId: t.id }); App.toast('Linked'); App.render(); } : null,
      });
    });
    const hint = el.querySelector('#kedb-hint');
    if (hint) {
      App.get(`/api/tickets/${t.id}/known-errors`).then((list) => {
        if (!list.length || !document.body.contains(hint)) return;
        hint.innerHTML = `<p class="small"><b>${icon('book', 14)} Matching known errors</b></p>${list.map((p) => `<div class="kedb-match"><a href="#/problems/${p.id}"><b>${esc(p.number)}</b> ${esc(p.title)}</a>
          <div class="small muted">${esc(p.workaround).slice(0, 220)}</div>
          <div class="row"><button type="button" class="btn sm ghost" data-usewa="${esc(p.workaround)}">Use workaround</button>${App.can('problems', 'edit') ? `<button type="button" class="btn sm ghost" data-linkp="${p.id}">Link to ${esc(p.number)}</button>` : ''}</div></div>`).join('')}`;
        hint.querySelectorAll('[data-usewa]').forEach((b) => b.addEventListener('click', () => useWorkaround(b.dataset.usewa)));
        hint.querySelectorAll('[data-linkp]').forEach((b) => b.addEventListener('click', async () => {
          try { await App.post(`/api/problems/${b.dataset.linkp}/link`, { ticketId: t.id }); App.toast('Linked to the known error'); App.render(); } catch (e) { App.fail(e); }
        }));
      }).catch(() => {});
    }
  }

  function resolveModal(t, status) {
    App.modal({
      title: `${status === 'Closed' ? 'Close' : 'Resolve'} ${t.number}`,
      body: `<div class="form-grid">
        <label class="span2">Resolution code<select name="resolutionCode" required>${App.options(App.meta.itil.resolutionCodes, t.resolutionCode, { blank: 'Choose…' })}</select></label>
        <label class="span2">Resolution notes <small class="muted">what was done – shared with the requester in the status email</small><textarea name="resolutionNotes" rows="4" required>${esc(t.resolutionNotes || '')}</textarea></label>
      </div>`,
      submitLabel: status === 'Closed' ? 'Close ticket' : 'Resolve ticket',
      onSubmit: async (f) => {
        if (!f.resolutionCode || !String(f.resolutionNotes || '').trim()) throw new Error('Choose a resolution code and add resolution notes');
        await App.put(`/api/tickets/${t.id}`, { ...f, status });
        App.toast(`${t.number} ${status.toLowerCase()}`);
        await App.refreshMeta(); App.render();
      },
    });
  }

  function holdModal(t, status) {
    App.modal({
      title: `Put ${t.number} on hold`,
      body: `<p class="muted">The resolution SLA clock stops while the ticket waits, and restarts when it moves on.</p>
        <label>Reason<select name="holdReason" required>${App.options(App.meta.itil.holdReasons, '', { blank: 'Choose…' })}</select></label>`,
      submitLabel: 'Put on hold',
      onSubmit: async (f) => {
        if (!f.holdReason) throw new Error('Choose a reason');
        await App.put(`/api/tickets/${t.id}`, { status, holdReason: f.holdReason });
        App.toast(`${t.number} is on hold`);
        App.render();
      },
    });
  }

  App.setTicketFilter = (o) => Object.assign(state, { status: 'open', q: '', assigneeId: '', ...o });

  App.pages.tickets = {
    title: 'Tickets',
    render: (el, params, alive) => (params[0] ? detailView(el, params[0], alive) : listView(el, alive)),
  };
})();
