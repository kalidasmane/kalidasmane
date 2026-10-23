/* Problems (ITIL problem management): root cause, known errors (KEDB), linked incidents. */
(() => {
  const { esc, icon } = App;
  const state = { status: 'open', q: '' };
  const STATUS_HELP = {
    New: 'Logged, not yet investigated',
    'Under Investigation': 'Diagnosing the root cause',
    'Root Cause Identified': 'Cause known, working on a fix',
    'Known Error': 'Root cause and workaround documented',
    Resolved: 'Permanent fix in place',
    Closed: 'Done',
  };
  const levelOpts = (kind, sel) => App.options(App.meta.itil.levels.map((l) => ({ value: l, label: `${l} – ${App.meta.itil[kind][l]}` })), sel);
  const timeline = (list) => `<ul class="timeline">${(list || []).map((c) => `<li class="${c.system ? 'sys' : 'internal'}">
      <div class="tl-dot"></div><div class="tl-body"><div class="tl-meta"><b>${esc(c.authorName)}</b><small class="muted">${App.fmtDateTime(c.at)}</small></div>
      <div>${esc(c.text).replace(/\n/g, '<br>')}</div></div></li>`).join('')}</ul>`;
  App.recordTimeline = timeline;

  // New problem – also used from a ticket ("Create problem from this incident").
  App.openNewProblem = (prefill = {}) => {
    const s = App.meta.settings;
    App.modal({
      title: prefill.incidentIds?.length ? 'Create a problem from this incident' : 'New problem',
      wide: true,
      body: `<p class="muted">A problem is the unknown underlying cause of one or more incidents. Investigate it to find the root cause, publish a workaround as a known error, then remove the cause with a permanent fix.</p>
        <div class="form-grid">
        <label class="span2">Title<input name="title" required value="${esc(prefill.title || '')}" placeholder="e.g. Recurring VPN drops for remote staff"></label>
        <label class="span2">Description<textarea name="description" rows="3">${esc(prefill.description || '')}</textarea></label>
        <label>Impact<select name="impact">${levelOpts('impact', prefill.impact || 'Medium')}</select></label>
        <label>Urgency<select name="urgency">${levelOpts('urgency', prefill.urgency || 'Medium')}</select></label>
        <label>Category<select name="category">${App.options(s.ticketCategories, prefill.category || 'Problem')}</select></label>
        <label>Project<select name="projectId">${App.projectOptions(prefill.projectId || '')}</select></label>
        <label class="span2">Problem owner${App.userPicker('assigneeId', prefill.assigneeId || '')}</label>
        ${prefill.incidentIds?.length ? '' : '<label class="span2">Link incidents <small class="muted">ticket numbers, comma-separated (optional)</small><input name="incidents" placeholder="INC-1009, INC-1012"></label>'}
      </div>`,
      submitLabel: 'Log problem',
      onSubmit: async (f) => {
        const p = await App.post('/api/problems', { ...f, incidentIds: prefill.incidentIds || [] });
        for (const n of String(f.incidents || '').split(/[\s,;]+/).filter(Boolean)) {
          await App.post(`/api/problems/${p.id}/link`, { ticketNumber: n }).catch((e) => App.toast(`${n}: ${e.message}`, 'err'));
        }
        App.toast(`Problem ${p.number} logged`);
        App.go(`problems/${p.id}`);
      },
    });
  };

  async function listView(el, alive) {
    const list = await App.get(`/api/problems?${new URLSearchParams(state)}`);
    if (!alive()) return;
    const known = state.status === 'known';
    el.innerHTML = `
      <div class="toolbar">
        <div class="seg" id="ptabs"><button data-v="open" class="${state.status === 'open' ? 'on' : ''}">Open problems</button><button data-v="known" class="${known ? 'on' : ''}">${icon('book', 15)} Known errors</button><button data-v="" class="${state.status === '' ? 'on' : ''}">All</button></div>
        <div class="search">${icon('search', 16)}<input id="pq" placeholder="Search problems, root causes, workarounds…" value="${esc(state.q)}"></div>
        <span class="grow"></span>
        ${App.can('problems', 'create') ? `<button class="btn primary" id="new">${icon('plus', 16)} New problem</button>` : ''}
      </div>
      ${known ? '<p class="muted">The <b>Known Error Database</b>: problems whose root cause and workaround are documented. Engineers see matching known errors on incidents, so they can apply the workaround straight away.</p>' : ''}
      <div class="card">${list.length ? (known ? `<div class="kedb">${list.map((p) => `<article class="kedb-item" data-open="${p.id}">
          <header><b>${esc(p.number)}</b>${App.priorityPill(p.priority)}${App.statusPill(p.status)}<span class="grow"></span><small class="muted">${p.incidentCount} incident(s)</small></header>
          <h4>${esc(p.title)}</h4>
          ${p.rootCause ? `<p><span class="lbl">Root cause</span>${esc(p.rootCause)}</p>` : ''}
          <p class="workaround"><span class="lbl">Workaround</span>${esc(p.workaround).replace(/\n/g, '<br>')}</p></article>`).join('')}</div>`
        : `<div class="table-wrap"><table class="table hover">
        <thead><tr><th>Problem</th><th>Title</th><th>Priority</th><th>Status</th><th>Owner</th><th class="num">Incidents</th><th>Logged</th></tr></thead>
        <tbody>${list.map((p) => `<tr data-open="${p.id}">
          <td class="nowrap"><b>${esc(p.number)}</b>${p.knownError ? ' <span class="tag amber" title="Known error">KE</span>' : ''}</td>
          <td class="subject"><b>${esc(p.title)}</b><small class="muted">${esc(p.category || '')}${p.projectName ? ` · ${esc(p.projectName)}` : ''}</small></td>
          <td>${App.priorityPill(p.priority)}</td><td>${App.statusPill(p.status)}</td>
          <td>${App.userChip(App.user(p.assigneeId))}</td>
          <td class="num">${p.openIncidents ? `<b>${p.openIncidents}</b> open / ` : ''}${p.incidentCount}</td>
          <td class="nowrap">${App.fmtDate(p.createdAt)}</td></tr>`).join('')}</tbody></table></div>`)
        : App.empty(known ? 'No known errors yet' : 'No problems found', known ? 'Mark a problem as a known error once its workaround is documented.' : 'Log a problem when the same incident keeps coming back.')}</div>`;
    el.querySelectorAll('#ptabs button').forEach((b) => b.addEventListener('click', () => { state.status = b.dataset.v; App.render(); }));
    const q = el.querySelector('#pq');
    q.addEventListener('input', App.debounce(() => { state.q = q.value; App.render().then(() => { const n = document.getElementById('pq'); n?.focus(); n?.setSelectionRange(n.value.length, n.value.length); }); }, 350));
    el.querySelector('#new')?.addEventListener('click', () => App.openNewProblem());
    el.querySelectorAll('[data-open]').forEach((r) => r.addEventListener('click', () => App.go(`problems/${r.dataset.open}`)));
  }

  async function detailView(el, id, alive) {
    const p = await App.get(`/api/problems/${id}`);
    if (!alive()) return;
    const it = App.meta.itil;
    const canEdit = App.can('problems', 'edit');
    const dis = canEdit ? '' : 'disabled';
    const steps = App.meta.itsm.problemStatuses;
    const at = steps.indexOf(p.status);
    el.innerHTML = `
      <a class="back" href="#/problems">${icon('left', 16)} All problems</a>
      <div class="ticket-layout">
        <div>
          <section class="card ticket-head">
            <div class="th-top"><span class="tnum">${esc(p.number)}</span>${App.priorityPill(p.priority)}${App.statusPill(p.status)}${p.knownError && p.status !== 'Known Error' ? '<span class="pill sla-risk">Known error</span>' : ''}<span class="grow"></span>
              ${App.can('problems', 'delete') ? `<button class="icon-btn" id="del" title="Delete problem">${icon('trash', 16)}</button>` : ''}</div>
            <h2>${esc(p.title)}</h2>
            <p class="muted">Logged by <b>${esc(p.createdByName || '—')}</b> · ${App.fmtDateTime(p.createdAt)}</p>
            <ol class="stepper">${steps.map((x, i) => `<li class="${i < at ? 'done' : i === at ? 'now' : ''}" title="${esc(STATUS_HELP[x] || '')}">${esc(x)}</li>`).join('')}</ol>
            <div class="desc">${esc(p.description || 'No description').replace(/\n/g, '<br>')}</div>
          </section>

          <form class="card" id="rca"><header><h3>Investigation</h3></header><div class="pad form-grid">
            <label class="span2">Root cause <small class="muted">what is really causing the incidents</small><textarea name="rootCause" rows="3" ${dis}>${esc(p.rootCause || '')}</textarea></label>
            <label class="span2">Workaround <small class="muted">how to restore service until the fix – shared as a known error</small><textarea name="workaround" rows="3" ${dis}>${esc(p.workaround || '')}</textarea></label>
            <label class="span2">Permanent fix <small class="muted">the change that removes the cause</small><textarea name="resolution" rows="3" ${dis}>${esc(p.resolution || '')}</textarea></label>
            ${canEdit ? `<div class="span2 row"><button class="btn primary sm" type="submit">Save investigation</button><span class="grow"></span>
              <button type="button" class="btn sm" id="share" ${p.workaround && p.openIncidents ? '' : 'disabled'} title="Post the workaround as a reply on every open linked incident">${icon('mail', 15)} Share workaround with ${p.openIncidents} open incident(s)</button>
              ${App.can('changes', 'create') ? `<button type="button" class="btn sm" id="raise">${icon('change', 15)} Raise change for the fix</button>` : ''}</div>` : ''}
          </div></form>

          <section class="card"><header><h3>Linked incidents (${p.incidents.length})</h3>
            ${canEdit ? `<form id="linkf" class="row"><input name="ticketNumber" placeholder="INC-1234" style="width:130px"><button class="btn sm">${icon('link', 15)} Link</button></form>` : ''}</header>
            ${p.incidents.length ? `<div class="table-wrap"><table class="table hover"><thead><tr><th>Ticket</th><th>Subject</th><th>Priority</th><th>Status</th><th>Assignee</th><th></th></tr></thead>
              <tbody>${p.incidents.map((t) => `<tr><td class="nowrap"><a href="#/tickets/${t.id}"><b>${esc(t.number)}</b></a></td><td>${esc(t.subject)}</td><td>${App.priorityPill(t.priority)}</td><td>${App.statusPill(t.status)}</td><td>${esc(t.assigneeName || 'Unassigned')}</td>
              <td class="row-actions">${canEdit ? `<button class="icon-btn" data-unlink="${t.id}" title="Unlink">${icon('x', 15)}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
              ${canEdit && p.openIncidents ? `<div class="pad row"><span class="muted">When the permanent fix is in place:</span><span class="grow"></span><button class="btn sm" id="resolveall" ${p.resolution ? '' : 'disabled title="Record the permanent fix first"'}>Resolve ${p.openIncidents} open incident(s)</button></div>` : ''}`
            : '<p class="muted pad">No incidents linked yet. Link the incidents this problem causes to see its real impact.</p>'}
          </section>

          ${p.changes.length ? `<section class="card"><header><h3>Changes</h3></header><ul class="mini-list pad">${p.changes.map((c) => `<li>${icon('change', 16)}<span><a href="#/changes/${c.id}"><b>${esc(c.number)}</b></a> ${esc(c.title)}</span>${App.statusPill(c.status)}</li>`).join('')}</ul></section>` : ''}

          <section class="card"><header><h3>Work notes & history</h3></header>
            ${timeline(p.comments)}
            <form id="note" class="comment-box"><textarea name="text" rows="2" placeholder="Add a work note…" required></textarea><div class="row"><span class="grow"></span><button class="btn primary sm">Add note</button></div></form>
          </section>
        </div>
        <aside>
          <form class="card side-form" id="props">
            <header><h3>Details</h3></header>
            <label>Status<select name="status" ${dis}>${App.options(steps.map((x) => ({ value: x, label: x })), p.status)}</select></label>
            <div class="grid2"><label>Impact<select name="impact" ${dis}>${App.options(it.levels, p.impact)}</select></label>
            <label>Urgency<select name="urgency" ${dis}>${App.options(it.levels, p.urgency)}</select></label></div>
            <label>Priority<select name="priority" ${dis}>${App.priorityOptions(p.priority)}</select></label>
            <label>Category<select name="category" ${dis}>${App.options(App.meta.settings.ticketCategories, p.category)}</select></label>
            <label>Problem owner${canEdit ? App.userPicker('assigneeId', p.assigneeId) : `<div>${App.userChip(App.user(p.assigneeId))}</div>`}</label>
            <label>Project<select name="projectId" ${dis}>${App.projectOptions(p.projectId)}</select></label>
            <label class="check"><input type="checkbox" name="knownError" ${p.knownError ? 'checked' : ''} ${dis}> Published as a known error</label>
            <dl class="facts"><dt>Logged</dt><dd>${App.fmtDateTime(p.createdAt)}</dd><dt>Resolved</dt><dd>${App.fmtDateTime(p.resolvedAt)}</dd><dt>Closed</dt><dd>${App.fmtDateTime(p.closedAt)}</dd></dl>
          </form>
        </aside>
      </div>`;

    const save = async (body, msg = 'Problem updated') => {
      try { await App.put(`/api/problems/${p.id}`, body); App.toast(msg); } catch (e) { App.fail(e); }
      App.render();
    };
    const props = el.querySelector('#props');
    App.enhance(props);
    props.addEventListener('change', (ev) => {
      const f = App.formData(props);
      if (ev.target.name === 'impact' || ev.target.name === 'urgency') delete f.priority;
      save(f);
    });
    el.querySelector('#rca').addEventListener('submit', (e) => { e.preventDefault(); save(App.formData(e.target), 'Investigation saved'); });
    el.querySelector('#share')?.addEventListener('click', async () => {
      if (!await App.confirm('Share the workaround', `Post the workaround as a reply on ${p.openIncidents} open incident(s)? Requesters are emailed.`, 'Share')) return;
      try { const r = await App.post(`/api/problems/${p.id}/share-workaround`); App.toast(`Workaround shared with ${r.count} incident(s)`); App.render(); } catch (e) { App.fail(e); }
    });
    el.querySelector('#resolveall')?.addEventListener('click', async () => {
      if (!await App.confirm('Resolve linked incidents', `Resolve ${p.openIncidents} open incident(s) with the permanent fix as resolution notes?`, 'Resolve')) return;
      try { const r = await App.post(`/api/problems/${p.id}/resolve-incidents`); App.toast(`${r.count} incident(s) resolved`); await App.refreshMeta(); App.render(); } catch (e) { App.fail(e); }
    });
    el.querySelector('#raise')?.addEventListener('click', () => App.openNewChange({
      problemId: p.id, problemNumber: p.number, title: `Permanent fix for ${p.number}: ${p.title}`.slice(0, 200),
      reason: [p.rootCause && `Root cause: ${p.rootCause}`, p.resolution && `Fix: ${p.resolution}`].filter(Boolean).join('\n'),
    }));
    el.querySelector('#linkf')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await App.post(`/api/problems/${p.id}/link`, App.formData(e.target)); App.render(); } catch (err) { App.fail(err); }
    });
    el.querySelectorAll('[data-unlink]').forEach((b) => b.addEventListener('click', async () => {
      try { await App.post(`/api/problems/${p.id}/unlink`, { ticketId: b.dataset.unlink }); App.render(); } catch (e) { App.fail(e); }
    }));
    el.querySelector('#note').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await App.post(`/api/problems/${p.id}/comments`, App.formData(e.target)); App.render(); } catch (err) { App.fail(err); }
    });
    el.querySelector('#del')?.addEventListener('click', async () => {
      if (!await App.confirm('Delete problem', `Delete ${p.number}? Linked incidents stay, but lose the link.`)) return;
      try { await App.del(`/api/problems/${p.id}`); App.go('problems'); } catch (e) { App.fail(e); }
    });
  }

  App.setProblemFilter = (status) => Object.assign(state, { status, q: '' });

  App.pages.problems = {
    title: 'Problems',
    render: (el, params, alive) => (params[0] ? detailView(el, params[0], alive) : listView(el, alive)),
  };
})();
