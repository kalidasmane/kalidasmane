/* Changes (ITIL change management): RFCs, CAB approval, schedule, implementation and review. */
(() => {
  const { esc, icon } = App;
  const state = { view: 'list', status: 'open', type: '', q: '' };
  const TYPE_HELP = {
    standard: 'Low risk, done often, follows a proven procedure – pre-approved, no CAB needed.',
    normal: 'Assessed for risk and approved by every chosen CAB member before it is scheduled.',
    emergency: 'Fixes or prevents a major incident now – one emergency CAB (ECAB) approval is enough.',
  };
  const LIFECYCLE = ['Draft', 'Assessment', 'Awaiting Approval', 'Approved', 'Scheduled', 'Implementing', 'Review', 'Closed'];
  const riskPill = (r) => `<span class="pill ${{ High: 'prio-critical', Medium: 'prio-high', Low: 'prio-low' }[r] || ''}">${esc(r)} risk</span>`;
  const typePill = (t) => `<span class="pill ${t === 'emergency' ? 'sla-bad' : t === 'standard' ? 'sla-met' : ''}">${esc(App.meta.itsm.changeTypes[t] || t)}</span>`;
  // <input type="datetime-local"> works in local time; the server stores UTC.
  const toLocal = (iso) => { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  const fromLocal = (v) => (v ? new Date(v).toISOString() : '');
  const window_ = (c) => (c.plannedStart ? `${App.fmtDateTime(c.plannedStart)} → ${c.plannedEnd ? new Date(c.plannedEnd).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '?'}` : 'Not scheduled');

  function planFields(c, dis = '') {
    const devices = App.meta.devices || [];
    return `
      <label class="span2">Reason for change <small class="muted">business justification</small><textarea name="reason" rows="2" ${dis}>${esc(c.reason || '')}</textarea></label>
      <label class="span2">Description<textarea name="description" rows="2" ${dis}>${esc(c.description || '')}</textarea></label>
      <label class="span2">Implementation plan<textarea name="implementationPlan" rows="3" ${dis}>${esc(c.implementationPlan || '')}</textarea></label>
      <label class="span2">Backout plan <small class="muted">how to undo it if it goes wrong</small><textarea name="backoutPlan" rows="2" ${dis}>${esc(c.backoutPlan || '')}</textarea></label>
      <label class="span2">Test plan <small class="muted">how success is verified</small><textarea name="testPlan" rows="2" ${dis}>${esc(c.testPlan || '')}</textarea></label>
      <label>Planned start<input type="datetime-local" name="plannedStart" value="${toLocal(c.plannedStart)}" ${dis}></label>
      <label>Planned end<input type="datetime-local" name="plannedEnd" value="${toLocal(c.plannedEnd)}" ${dis}></label>
      ${devices.length ? `<label class="span2">Affected devices / services <small class="muted">used to spot clashing changes · Ctrl / ⌘-click to pick several</small><select name="deviceIds" multiple size="4" ${dis}>${devices.map((d) => `<option value="${esc(d.id)}" ${(c.deviceIds || []).includes(d.id) ? 'selected' : ''}>${esc(d.name)}${d.customer ? ` · ${esc(d.customer)}` : ''}</option>`).join('')}</select></label>` : ''}`;
  }
  const readPlan = (form, f) => ({
    ...f, plannedStart: fromLocal(f.plannedStart), plannedEnd: fromLocal(f.plannedEnd),
    ...(form.querySelector('[name=deviceIds]') ? { deviceIds: [...form.querySelector('[name=deviceIds]').selectedOptions].map((o) => o.value) } : {}),
  });

  App.openNewChange = (prefill = {}) => {
    const it = App.meta.itsm;
    App.modal({
      title: 'New request for change (RFC)',
      wide: true,
      body: `<div class="form-grid">
        <label class="span2">Title<input name="title" required value="${esc(prefill.title || '')}" placeholder="e.g. Upgrade core switch firmware"></label>
        <label>Change type<select name="type">${App.options(Object.entries(it.changeTypes).map(([v, l]) => ({ value: v, label: l })), prefill.type || 'normal')}</select></label>
        <p class="muted" id="typehelp" style="align-self:end;margin:0"></p>
        <label>Risk<select name="risk">${App.options(it.risks, 'Medium')}</select></label>
        <label>Impact<select name="impact">${App.options(it.risks, 'Medium')}</select></label>
        ${planFields(prefill)}
        <label class="span2">Change owner${App.userPicker('assigneeId', prefill.assigneeId || App.me.id)}</label>
        ${prefill.problemNumber ? `<p class="span2 muted">Linked to problem <b>${esc(prefill.problemNumber)}</b>.</p>` : ''}
      </div>`,
      submitLabel: 'Save as draft',
      onOpen: (form) => {
        const sel = form.querySelector('[name=type]');
        const upd = () => { form.querySelector('#typehelp').textContent = TYPE_HELP[sel.value]; };
        sel.addEventListener('change', upd); upd();
      },
      onSubmit: async (f, form) => {
        const c = await App.post('/api/changes', { ...readPlan(form, f), problemId: prefill.problemId || null, incidentIds: prefill.incidentIds || [] });
        App.toast(`${c.number} saved as a draft – submit it when the plan is ready`);
        App.go(`changes/${c.id}`);
      },
    });
  };

  // ---------- list ----------
  async function listView(el, alive) {
    const it = App.meta.itsm;
    const isSchedule = state.view === 'schedule';
    const list = isSchedule ? await App.get('/api/changes/schedule') : await App.get(`/api/changes?${new URLSearchParams({ status: state.status, type: state.type, q: state.q })}`);
    if (!alive()) return;
    el.innerHTML = `
      <div class="toolbar">
        <div class="seg" id="cview"><button data-v="list" class="${!isSchedule ? 'on' : ''}">${icon('list', 15)} Changes</button><button data-v="schedule" class="${isSchedule ? 'on' : ''}">${icon('calendar', 15)} Schedule (30 days)</button></div>
        ${isSchedule ? '' : `<div class="search">${icon('search', 16)}<input id="cq" placeholder="Search changes…" value="${esc(state.q)}"></div>
        <select id="cs">${App.options([{ value: 'open', label: 'All open' }, { value: 'mine', label: 'Awaiting my approval' }, { value: '', label: 'All statuses' }, ...it.changeStatuses.map((x) => ({ value: x, label: x }))], state.status)}</select>
        <select id="ct">${App.options(Object.entries(it.changeTypes).map(([v, l]) => ({ value: v, label: l })), state.type, { blank: 'All types' })}</select>`}
        <span class="grow"></span>
        ${App.can('changes', 'create') ? `<button class="btn primary" id="new">${icon('plus', 16)} New change</button>` : ''}
      </div>
      <div class="card">${isSchedule ? scheduleHtml(list) : list.length ? `<div class="table-wrap"><table class="table hover">
        <thead><tr><th>Change</th><th>Title</th><th>Type</th><th>Risk</th><th>Status</th><th>Owner</th><th>Planned</th></tr></thead>
        <tbody>${list.map((c) => `<tr data-open="${c.id}">
          <td class="nowrap"><b>${esc(c.number)}</b>${c.conflictCount ? ` <span class="tag amber" title="Clashes with ${c.conflictCount} other change(s)">⚠ clash</span>` : ''}</td>
          <td class="subject"><b>${esc(c.title)}</b><small class="muted">${c.problemNumber ? `for ${esc(c.problemNumber)} · ` : ''}${esc(c.deviceNames.join(', '))}</small></td>
          <td>${typePill(c.type)}</td><td>${riskPill(c.risk)}</td><td>${App.statusPill(c.status)}</td>
          <td>${App.userChip(App.user(c.assigneeId))}</td><td class="nowrap">${window_(c)}</td></tr>`).join('')}</tbody></table></div>`
        : App.empty('No changes found', 'Raise a request for change (RFC) before changing live services.')}</div>`;
    el.querySelectorAll('#cview button').forEach((b) => b.addEventListener('click', () => { state.view = b.dataset.v; App.render(); }));
    el.querySelector('#cs')?.addEventListener('change', (e) => { state.status = e.target.value; App.render(); });
    el.querySelector('#ct')?.addEventListener('change', (e) => { state.type = e.target.value; App.render(); });
    const q = el.querySelector('#cq');
    q?.addEventListener('input', App.debounce(() => { state.q = q.value; App.render().then(() => { const n = document.getElementById('cq'); n?.focus(); n?.setSelectionRange(n.value.length, n.value.length); }); }, 350));
    el.querySelector('#new')?.addEventListener('click', () => App.openNewChange());
    el.querySelectorAll('[data-open]').forEach((r) => r.addEventListener('click', () => App.go(`changes/${r.dataset.open}`)));
  }

  // Forward schedule of change, grouped by day, with clashes highlighted.
  function scheduleHtml(list) {
    if (!list.length) return App.empty('Nothing scheduled', 'Approved and scheduled changes for the next 30 days appear here.');
    const days = new Map();
    for (const c of list) {
      const k = new Date(c.plannedStart).toDateString();
      if (!days.has(k)) days.set(k, []);
      days.get(k).push(c);
    }
    return `<div class="schedule">${[...days].map(([d, cs]) => `<section><h4>${esc(new Date(d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }))}</h4>
      ${cs.map((c) => `<a class="sched-item ${c.conflicts.length ? 'clash' : ''}" href="#/changes/${c.id}">
        <span class="sched-time">${new Date(c.plannedStart).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} – ${c.plannedEnd ? new Date(c.plannedEnd).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '?'}</span>
        <span class="sched-body"><b>${esc(c.number)}</b> ${esc(c.title)}<small>${esc(c.deviceNames.join(', ') || 'No devices listed')}${c.conflicts.length ? ` · ⚠ clashes with ${c.conflicts.map((x) => `${esc(x.number)} (${esc(x.reason)})`).join(', ')}` : ''}</small></span>
        <span class="sched-tags">${typePill(c.type)}${riskPill(c.risk)}${App.statusPill(c.status)}</span></a>`).join('')}</section>`).join('')}</div>`;
  }

  // ---------- detail ----------
  async function detailView(el, id, alive) {
    const c = await App.get(`/api/changes/${id}`);
    if (!alive()) return;
    const it = App.meta.itsm;
    const final = ['Closed', 'Rejected', 'Cancelled'].includes(c.status);
    const canEdit = App.can('changes', 'edit') && !final;
    const dis = canEdit ? '' : 'disabled';
    const myTurn = c.status === 'Awaiting Approval' && c.approverIds.includes(App.me.id) && !c.approvals.some((a) => a.userId === App.me.id) && App.can('changes', 'approve');
    const at = LIFECYCLE.indexOf(c.status);
    const btn = (action, label, cls = '') => `<button type="button" class="btn sm ${cls}" data-act="${action}">${label}</button>`;
    const actions = App.can('changes', 'edit') ? [
      c.status === 'Draft' && btn('submit', c.type === 'emergency' ? 'Submit to ECAB' : c.type === 'standard' ? 'Submit (pre-approved)' : 'Submit for assessment', 'primary'),
      c.status === 'Assessment' && btn('request_approval', 'Send to CAB for approval', 'primary'),
      c.status === 'Approved' && btn('schedule', `${icon('calendar', 15)} Schedule`, 'primary'),
      ['Approved', 'Scheduled'].includes(c.status) && btn('start', `${icon('play', 15)} Start implementation`, c.status === 'Scheduled' ? 'primary' : ''),
      c.status === 'Implementing' && btn('complete', 'Implementation finished…', 'primary'),
      c.status === 'Review' && btn('close', 'Close after review…', 'primary'),
      c.status === 'Rejected' && btn('rework', 'Rework as a new draft'),
      !final && !['Implementing', 'Review'].includes(c.status) && btn('cancel', 'Cancel change', 'ghost'),
    ].filter(Boolean).join('') : '';
    el.innerHTML = `
      <a class="back" href="#/changes">${icon('left', 16)} All changes</a>
      <div class="ticket-layout">
        <div>
          <section class="card ticket-head">
            <div class="th-top"><span class="tnum">${esc(c.number)}</span>${typePill(c.type)}${riskPill(c.risk)}${App.statusPill(c.status)}<span class="grow"></span>
              ${App.can('changes', 'delete') ? `<button class="icon-btn" id="del" title="Delete change">${icon('trash', 16)}</button>` : ''}</div>
            <h2>${esc(c.title)}</h2>
            <p class="muted">Requested by <b>${esc(c.requestedByName || '—')}</b> · ${App.fmtDateTime(c.createdAt)}${c.problemNumber ? ` · for problem <a href="#/problems/${c.problemId}">${esc(c.problemNumber)}</a>` : ''}${c.incidents.length ? ` · incidents ${c.incidents.map((t) => `<a href="#/tickets/${t.id}">${esc(t.number)}</a>`).join(', ')}` : ''}</p>
            ${['Rejected', 'Cancelled'].includes(c.status) ? `<p class="notice">This change was ${c.status.toLowerCase()}.</p>` : `<ol class="stepper">${LIFECYCLE.filter((x) => c.type !== 'standard' || !['Assessment', 'Awaiting Approval'].includes(x)).map((x) => `<li class="${LIFECYCLE.indexOf(x) < at ? 'done' : x === c.status ? 'now' : ''}">${esc(x)}</li>`).join('')}</ol>`}
            <p class="muted small">${esc(TYPE_HELP[c.type])}</p>
            ${actions || myTurn ? `<div class="row wrap">${myTurn ? `<button type="button" class="btn sm primary" id="approve">✓ Approve</button><button type="button" class="btn sm danger" id="reject">✕ Reject</button><span class="grow"></span>` : ''}${actions}</div>` : ''}
          </section>

          ${c.conflicts.length ? `<section class="card warn-card"><header><h3>${icon('alert', 16)} Schedule clash</h3></header><ul class="mini-list pad">${c.conflicts.map((x) => `<li><span><a href="#/changes/${x.id}"><b>${esc(x.number)}</b></a> ${esc(x.title)}<small class="muted">${window_(x)} · ${esc(x.reason)}</small></span></li>`).join('')}</ul></section>` : ''}

          <form class="card" id="plan"><header><h3>Plan</h3>${canEdit && ['Awaiting Approval', 'Approved', 'Scheduled'].includes(c.status) && c.type !== 'standard' ? '<small class="muted">Changing the plan, timing, risk or devices sends it back for approval</small>' : ''}</header>
            <div class="pad form-grid">${planFields(c, dis)}
            ${canEdit ? '<div class="span2 row"><span class="grow"></span><button class="btn primary sm">Save plan</button></div>' : ''}</div></form>

          ${c.outcome || c.status === 'Review' || c.reviewNotes ? `<section class="card"><header><h3>Post-implementation review</h3></header><div class="pad">
            <dl class="facts"><dt>Outcome</dt><dd>${esc(c.outcome || '—')}</dd><dt>Started</dt><dd>${App.fmtDateTime(c.actualStart)}</dd><dt>Finished</dt><dd>${App.fmtDateTime(c.actualEnd)}</dd></dl>
            ${c.reviewNotes ? `<p>${esc(c.reviewNotes).replace(/\n/g, '<br>')}</p>` : '<p class="muted">Review notes are added when the change is closed.</p>'}</div></section>` : ''}

          <section class="card"><header><h3>Work notes & history</h3></header>
            ${App.recordTimeline(c.comments)}
            <form id="note" class="comment-box"><textarea name="text" rows="2" placeholder="Add a work note…" required></textarea><div class="row"><span class="grow"></span><button class="btn primary sm">Add note</button></div></form>
          </section>
        </div>
        <aside>
          ${c.type !== 'standard' ? `<section class="card"><header><h3>${c.type === 'emergency' ? 'ECAB approval' : 'CAB approval'}</h3></header><div class="pad">
            ${c.approvers.length ? `<ul class="mini-list">${c.approvers.map((a) => `<li>${App.avatar(App.user(a.id) || { id: a.id, name: a.name }, 26)}<span>${esc(a.name)}${a.decision?.comment ? `<small class="muted">“${esc(a.decision.comment)}”</small>` : ''}</span>
              ${a.decision ? `<span class="pill ${a.decision.decision === 'approved' ? 'sla-ok' : 'sla-bad'}">${esc(a.decision.decision)}</span>` : '<span class="pill sla-paused">pending</span>'}</li>`).join('')}</ul>
              <p class="muted small">${c.type === 'emergency' ? 'One approval is enough.' : 'Every approver must approve; one rejection rejects the change.'}</p>`
            : '<p class="muted">Approvers are chosen when the change is sent for approval.</p>'}</div></section>` : ''}
          <form class="card side-form" id="props">
            <header><h3>Details</h3></header>
            <label>Change type<select name="type" ${dis}>${App.options(Object.entries(it.changeTypes).map(([v, l]) => ({ value: v, label: l })), c.type)}</select></label>
            <div class="grid2"><label>Risk<select name="risk" ${dis}>${App.options(it.risks, c.risk)}</select></label>
            <label>Impact<select name="impact" ${dis}>${App.options(it.risks, c.impact)}</select></label></div>
            <label>Change owner${canEdit ? App.userPicker('assigneeId', c.assigneeId) : `<div>${App.userChip(App.user(c.assigneeId))}</div>`}</label>
            <dl class="facts"><dt>Planned</dt><dd>${window_(c)}</dd><dt>Started</dt><dd>${App.fmtDateTime(c.actualStart)}</dd><dt>Finished</dt><dd>${App.fmtDateTime(c.actualEnd)}</dd></dl>
          </form>
        </aside>
      </div>`;

    const run = async (action, body = {}) => {
      try { await App.post(`/api/changes/${c.id}/action`, { action, ...body }); App.toast(`${c.number}: done`); App.render(); } catch (e) { App.fail(e); }
    };
    const chooseApprovers = async (action) => {
      const list = await App.get('/api/changes/approvers');
      App.modal({
        title: c.type === 'emergency' ? 'Emergency CAB (ECAB)' : 'Change advisory board (CAB)',
        body: `<p class="muted">${c.type === 'emergency' ? 'Choose who can approve this emergency change. The first approval is enough.' : 'Choose the CAB members who must approve this change. They are notified straight away.'}</p>
          <div class="check-grid">${list.filter((u) => u.id !== App.me.id || list.length === 1).map((u) => `<label class="check"><input type="checkbox" data-ap value="${esc(u.id)}"> ${esc(u.name)}<small class="muted">&nbsp;${esc(u.designation || '')}</small></label>`).join('') || '<p class="muted">Nobody can approve changes yet. Give a profile the “approve” permission on Changes.</p>'}</div>`,
        submitLabel: 'Send for approval',
        onSubmit: async (f, form) => {
          const approverIds = [...form.querySelectorAll('[data-ap]:checked')].map((x) => x.value);
          await App.post(`/api/changes/${c.id}/action`, { action, approverIds });
          App.toast(`${c.number} sent for approval`);
          App.render();
        },
      });
    };
    el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
      const a = b.dataset.act;
      if (a === 'request_approval' || (a === 'submit' && c.type === 'emergency')) return chooseApprovers(a);
      if (a === 'complete') {
        return App.modal({
          title: `Implementation of ${c.number} finished`,
          body: `<label>Outcome<select name="outcome" required>${App.options(it.outcomes, '', { blank: 'Choose…' })}</select></label><p class="muted">If the change failed, run the backout plan before recording the outcome.</p>`,
          submitLabel: 'Record outcome',
          onSubmit: async (f) => { if (!f.outcome) throw new Error('Choose the outcome'); await App.post(`/api/changes/${c.id}/action`, { action: 'complete', outcome: f.outcome }); App.render(); },
        });
      }
      if (a === 'close') {
        return App.modal({
          title: `Post-implementation review – ${c.number}`,
          body: `<label>Review notes <small class="muted">did it meet its goals, any side effects, lessons learned</small><textarea name="reviewNotes" rows="5" required>${esc(c.reviewNotes || '')}</textarea></label>`,
          submitLabel: 'Close change',
          onSubmit: async (f) => { await App.post(`/api/changes/${c.id}/action`, { action: 'close', reviewNotes: f.reviewNotes }); App.render(); },
        });
      }
      if (a === 'cancel' && !await App.confirm('Cancel change', `Cancel ${c.number}?`, 'Cancel change')) return;
      return run(a);
    }));
    el.querySelector('#approve')?.addEventListener('click', () => App.modal({
      title: `Approve ${c.number}`, body: '<label>Comment (optional)<textarea name="comment" rows="2"></textarea></label>', submitLabel: 'Approve',
      onSubmit: async (f) => { await App.post(`/api/changes/${c.id}/action`, { action: 'approve', comment: f.comment }); App.render(); },
    }));
    el.querySelector('#reject')?.addEventListener('click', () => App.modal({
      title: `Reject ${c.number}`, danger: true, body: '<label>Reason<textarea name="comment" rows="3" required></textarea></label>', submitLabel: 'Reject',
      onSubmit: async (f) => { if (!String(f.comment || '').trim()) throw new Error('Give a reason'); await App.post(`/api/changes/${c.id}/action`, { action: 'reject', comment: f.comment }); App.render(); },
    }));
    const save = async (body, msg = 'Change updated') => {
      try { const r = await App.put(`/api/changes/${c.id}`, body); App.toast(r.status !== c.status ? `${msg} – back to ${r.status}` : msg); } catch (e) { App.fail(e); }
      App.render();
    };
    const plan = el.querySelector('#plan');
    plan.addEventListener('submit', (e) => { e.preventDefault(); save(readPlan(plan, App.formData(plan)), 'Plan saved'); });
    const props = el.querySelector('#props');
    App.enhance(props);
    props.addEventListener('change', () => save(App.formData(props)));
    el.querySelector('#note').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await App.post(`/api/changes/${c.id}/comments`, App.formData(e.target)); App.render(); } catch (err) { App.fail(err); }
    });
    el.querySelector('#del')?.addEventListener('click', async () => {
      if (!await App.confirm('Delete change', `Delete ${c.number}? This cannot be undone.`)) return;
      try { await App.del(`/api/changes/${c.id}`); App.go('changes'); } catch (e) { App.fail(e); }
    });
  }

  App.setChangeFilter = (o) => Object.assign(state, { view: 'list', status: 'open', type: '', q: '', ...o });

  App.pages.changes = {
    title: 'Changes',
    render: (el, params, alive) => (params[0] ? detailView(el, params[0], alive) : listView(el, alive)),
  };
})();
