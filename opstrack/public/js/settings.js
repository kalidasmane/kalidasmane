/* Settings (gear icon): users, profiles, forms, email channels, workflows, general. */
(() => {
  const { esc, icon } = App;
  const TABS = [
    { id: 'users', label: 'Users', icon: 'users', perm: 'users' },
    { id: 'profiles', label: 'Profiles & Permissions', icon: 'shield', perm: 'profiles' },
    { id: 'forms', label: 'Forms', icon: 'form', perm: 'forms' },
    { id: 'email', label: 'Email (Inbound / Outbound)', icon: 'mail', perm: 'email' },
    { id: 'notifications', label: 'Notifications (chat & SMS)', icon: 'chat', perm: 'notifications' },
    { id: 'workflows', label: 'Workflow Automation', icon: 'flow', perm: 'workflows' },
    { id: 'remote', label: 'Remote Desktop', icon: 'monitor', perm: 'settings' },
    { id: 'sla', label: 'SLA & Priority (ITIL)', icon: 'clock', perm: 'settings' },
    { id: 'general', label: 'General', icon: 'sliders', perm: 'settings' },
    { id: 'audit', label: 'Audit log', icon: 'list', perm: 'settings' },
  ];
  const actionBtns = (mod, id) => `<td class="row-actions">${App.can(mod, 'edit') ? `<button class="icon-btn" data-edit="${id}" title="Edit">${icon('edit', 16)}</button>` : ''}${App.can(mod, 'delete') ? `<button class="icon-btn" data-del="${id}" title="Delete">${icon('trash', 16)}</button>` : ''}</td>`;
  const bindRows = (el, list, onEdit, onDelete) => {
    el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => onEdit(list.find((x) => x.id === b.dataset.edit))));
    el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => onDelete(list.find((x) => x.id === b.dataset.del))));
  };
  const reload = async () => { await App.refreshMeta(); App.render(); };

  // ================= USERS =================
  async function usersTab(el) {
    const [users, profiles] = await Promise.all([App.get('/api/users'), App.can('profiles') ? App.get('/api/profiles') : Promise.resolve(App.meta.profiles)]);
    let q = '';
    const draw = () => {
      const list = users.filter((u) => `${u.name} ${u.username} ${u.email} ${u.department}`.toLowerCase().includes(q));
      el.querySelector('#ulist').innerHTML = `<table class="table hover"><thead><tr><th>User</th><th>Username</th><th>Profile</th><th>Reporting manager</th><th>Department</th><th>Workload</th><th>Status</th><th></th></tr></thead>
        <tbody>${list.map((u) => `<tr><td>${App.avatar(u, 30)} <b>${esc(u.name)}</b><small class="muted">${esc(u.email || '')}</small></td><td><code>${esc(u.username)}</code></td>
          <td><span class="pill" style="--pc:${esc(u.profileColor || '#64748b')}" data-color>${esc(u.profileName)}</span></td><td>${esc(u.managerName || '—')}</td><td>${esc(u.department || '')}<small class="muted">${esc(u.designation || '')}</small></td>
          <td>${App.light(u)}</td><td>${u.active ? (u.online ? '<span class="ok">● Online</span>' : `<span class="muted">Last seen ${App.ago(u.lastSeen)}</span>`) : '<span class="pill st-closed">Disabled</span>'}</td>${actionBtns('users', u.id)}</tr>`).join('')}</tbody></table>`;
      bindRows(el, users, userModal, delUser);
    };
    function userModal(u = {}) {
      App.modal({
        title: u.id ? `Edit user – ${u.name}` : 'Create user',
        wide: true,
        body: `<div class="form-grid">
          <label>Full name<input name="name" value="${esc(u.name || '')}" required></label>
          <label>Username<input name="username" value="${esc(u.username || '')}" required autocomplete="off"></label>
          <label>Email<input type="email" name="email" value="${esc(u.email || '')}"></label>
          <label>Phone<input name="phone" value="${esc(u.phone || '')}"></label>
          <label>Department<input name="department" value="${esc(u.department || '')}"></label>
          <label>Designation<input name="designation" value="${esc(u.designation || '')}"></label>
          <label>Profile (role)<select name="profileId" required>${App.options(profiles.map((p) => ({ value: p.id, label: p.name })), u.profileId, { blank: 'Select profile…' })}</select></label>
          <label>Reporting manager<select name="managerId">${App.options(users.filter((x) => x.id !== u.id).map((x) => ({ value: x.id, label: `${x.name}${x.designation ? ` – ${x.designation}` : ''}` })), u.managerId, { blank: '— None —' })}</select></label>
          <label>${u.id ? 'Reset password <small class="muted">(leave blank to keep)</small>' : 'Password'}<input type="password" name="password" autocomplete="new-password" ${u.id ? '' : 'required'}></label>
          <div class="checks"><label class="check"><input type="checkbox" name="active" ${u.active !== false ? 'checked' : ''}> Active (can sign in)</label>
          <label class="check"><input type="checkbox" name="mustChangePassword"> Must change password at next sign-in</label></div>
        </div>`,
        onSubmit: async (f) => {
          if (u.id) await App.put(`/api/users/${u.id}`, f); else await App.post('/api/users', f);
          App.toast(u.id ? 'User updated' : 'User created');
          reload();
        },
      });
    }
    async function delUser(u) {
      if (!await App.confirm('Delete user', `Delete ${u.name}? Their open tickets become unassigned and their reportees move to their manager. Logged time is kept.`)) return;
      try { await App.del(`/api/users/${u.id}`); App.toast('User deleted'); reload(); } catch (e) { App.fail(e); }
    }
    el.innerHTML = `<div class="toolbar"><div class="search">${icon('search', 16)}<input id="uq" placeholder="Search users…"></div><span class="muted">${users.length} users · ${users.filter((u) => u.online).length} online</span><span class="grow"></span>
      ${App.can('users', 'create') ? `<button class="btn primary" id="new">${icon('plus', 16)} Create user</button>` : ''}</div>
      <div class="card"><div class="table-wrap" id="ulist"></div></div>`;
    el.querySelector('#uq').addEventListener('input', (e) => { q = e.target.value.toLowerCase(); draw(); });
    el.querySelector('#new')?.addEventListener('click', () => userModal());
    draw();
  }

  // ================= PROFILES =================
  async function profilesTab(el) {
    const profiles = await App.get('/api/profiles');
    const mods = App.meta.modules;
    const ACT_LABEL = { view: 'View', create: 'Create', edit: 'Modify', delete: 'Delete', viewAll: 'See everyone', assign: 'Assign', connect: 'Connect' };
    function profileModal(p = {}, clone = false) {
      const perms = p.permissions || {};
      const locked = p.system && !clone;
      App.modal({
        title: clone ? `Clone profile – ${p.name}` : p.id ? `Edit profile – ${p.name}` : 'Create custom profile',
        wide: true,
        body: `<div class="form-grid"><label>Profile name<input name="name" value="${esc(clone ? `${p.name} (copy)` : p.name || '')}" required></label>
          <label>Colour<input type="color" name="color" value="${esc(p.color || '#64748b')}"></label>
          <label class="span2">Description<input name="description" value="${esc(p.description || '')}"></label></div>
          ${locked ? '<p class="notice">The Administrator profile always has full access.</p>' : ''}
          <div class="table-wrap"><table class="table perm-table"><thead><tr><th>Module</th>${Object.keys(ACT_LABEL).map((a) => `<th>${ACT_LABEL[a]}</th>`).join('')}<th>All</th></tr></thead><tbody>
          ${Object.entries(mods).map(([k, m]) => `<tr><td><b>${esc(m.label)}</b></td>${Object.keys(ACT_LABEL).map((a) => `<td>${m.actions.includes(a) ? `<input type="checkbox" data-mod="${k}" data-act="${a}" ${(perms[k] || []).includes(a) ? 'checked' : ''} ${locked ? 'disabled' : ''}>` : ''}</td>`).join('')}
            <td><input type="checkbox" data-row="${k}" ${locked ? 'disabled' : ''}></td></tr>`).join('')}
          </tbody></table></div>
          <p class="hint">“See everyone” lets a profile view all engineers’ tracker entries / all tickets. Without it users see their own data plus their direct and indirect reportees.</p>`,
        onOpen: (form) => {
          form.querySelectorAll('[data-row]').forEach((r) => {
            const boxes = form.querySelectorAll(`[data-mod="${r.dataset.row}"]`);
            r.checked = [...boxes].every((b) => b.checked);
            r.addEventListener('change', () => boxes.forEach((b) => { b.checked = r.checked; }));
          });
        },
        onSubmit: async (f, form) => {
          const permissions = {};
          form.querySelectorAll('[data-mod]').forEach((b) => { if (b.checked) (permissions[b.dataset.mod] = permissions[b.dataset.mod] || []).push(b.dataset.act); });
          const body = { name: f.name, description: f.description, color: f.color, permissions };
          if (p.id && !clone) await App.put(`/api/profiles/${p.id}`, body); else await App.post('/api/profiles', body);
          App.toast('Profile saved');
          reload();
        },
      });
    }
    el.innerHTML = `<div class="toolbar"><p class="muted">Profiles define what users can see and do. Create custom profiles and assign them to users.</p><span class="grow"></span>
      ${App.can('profiles', 'create') ? `<button class="btn primary" id="new">${icon('plus', 16)} Create profile</button>` : ''}</div>
      <div class="profile-grid">${profiles.map((p) => `<article class="card profile" style="--pc:${esc(p.color || '#64748b')}">
        <div class="pf-top"><span class="pf-dot"></span><h3>${esc(p.name)}</h3>${p.system ? '<span class="tag ghost">system</span>' : ''}<span class="grow"></span>
          ${App.can('profiles', 'create') ? `<button class="icon-btn" data-clone="${p.id}" title="Clone">${icon('copy', 16)}</button>` : ''}
          ${App.can('profiles', 'edit') ? `<button class="icon-btn" data-edit="${p.id}" title="Edit">${icon('edit', 16)}</button>` : ''}
          ${App.can('profiles', 'delete') && !p.system ? `<button class="icon-btn" data-del="${p.id}" title="Delete">${icon('trash', 16)}</button>` : ''}</div>
        <p class="muted">${esc(p.description || '')}</p>
        <div class="pf-mods">${Object.entries(p.permissions || {}).map(([k, a]) => `<span class="tag ghost" title="${esc(a.join(', '))}">${esc(mods[k]?.label || k)}</span>`).join('') || '<span class="muted">No access</span>'}</div>
        <small class="muted">${p.userCount} user(s)</small></article>`).join('')}</div>`;
    el.querySelector('#new')?.addEventListener('click', () => profileModal());
    el.querySelectorAll('[data-clone]').forEach((b) => b.addEventListener('click', () => profileModal(profiles.find((p) => p.id === b.dataset.clone), true)));
    bindRows(el, profiles, (p) => profileModal(p), async (p) => {
      if (!await App.confirm('Delete profile', `Delete profile “${p.name}”?`)) return;
      try { await App.del(`/api/profiles/${p.id}`); App.toast('Profile deleted'); reload(); } catch (e) { App.fail(e); }
    });
  }

  // ================= FORMS =================
  async function formsTab(el) {
    const forms = await App.get('/api/forms');
    const s = App.meta.settings;
    const FIELD_TYPES = ['text', 'email', 'textarea', 'select', 'number', 'date', 'checkbox'];
    const fieldRow = (f = {}) => `<div class="builder-row" draggable="false">
      <input data-k="label" placeholder="Field label" value="${esc(f.label || '')}">
      <select data-k="type">${App.options(FIELD_TYPES, f.type || 'text')}</select>
      <input data-k="options" placeholder="Options (comma separated, for select)" value="${esc((f.options || []).join(', '))}">
      <label class="check"><input type="checkbox" data-k="required" ${f.required ? 'checked' : ''}> Required</label>
      <input type="hidden" data-k="key" value="${esc(f.key || '')}">
      <button type="button" class="icon-btn" data-up title="Move up">▲</button><button type="button" class="icon-btn" data-rm title="Remove">${icon('x', 15)}</button></div>`;
    function formModal(fm = { fields: [{ label: 'Subject', key: 'subject', type: 'text', required: true }, { label: 'Your email', key: 'email', type: 'email', required: true }, { label: 'Description', key: 'description', type: 'textarea', required: true }] }) {
      App.modal({
        title: fm.id ? `Edit form – ${fm.name}` : 'Create form',
        wide: true,
        body: `<div class="form-grid">
          <label>Form name<input name="name" value="${esc(fm.name || '')}" required></label>
          <label>Ticket category<select name="category">${App.options(s.ticketCategories, fm.category)}</select></label>
          <label class="span2">Description<input name="description" value="${esc(fm.description || '')}"></label>
          <label>Default priority<select name="defaultPriority">${App.priorityOptions(fm.defaultPriority || 'Medium')}</select></label>
          <label>Link to project<select name="projectId">${App.projectOptions(fm.projectId)}</select></label>
          <label>Default assignee${App.userPicker('defaultAssigneeId', fm.defaultAssigneeId, { placeholder: 'Leave to workflows' })}</label>
          <div class="checks"><label class="check"><input type="checkbox" name="active" ${fm.active !== false ? 'checked' : ''}> Active</label>
          <label class="check"><input type="checkbox" name="public" ${fm.public !== false ? 'checked' : ''}> Public self-service portal link (no login)</label></div>
        </div>
        <h4>Fields <small class="muted">Use keys “subject”, “name”, “email” to map to the ticket subject and requester.</small></h4>
        <div id="fields">${fm.fields.map(fieldRow).join('')}</div>
        <button type="button" class="btn sm" id="addf">${icon('plus', 15)} Add field</button>`,
        onOpen: (form) => {
          const box = form.querySelector('#fields');
          const wire = () => {
            box.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => b.closest('.builder-row').remove(); });
            box.querySelectorAll('[data-up]').forEach((b) => { b.onclick = () => { const r = b.closest('.builder-row'); if (r.previousElementSibling) box.insertBefore(r, r.previousElementSibling); }; });
          };
          form.querySelector('#addf').addEventListener('click', () => { box.insertAdjacentHTML('beforeend', fieldRow()); wire(); });
          wire();
        },
        onSubmit: async (f, form) => {
          const fields = [...form.querySelectorAll('.builder-row')].map((r) => {
            const o = {}; r.querySelectorAll('[data-k]').forEach((i) => { o[i.dataset.k] = i.type === 'checkbox' ? i.checked : i.value; });
            return o;
          }).filter((x) => x.label);
          if (!fields.length) throw new Error('Add at least one field');
          const body = { ...f, fields, defaultAssigneeId: f.defaultAssigneeId || null, projectId: f.projectId || null };
          if (fm.id) await App.put(`/api/forms/${fm.id}`, body); else await App.post('/api/forms', body);
          App.toast('Form saved');
          reload();
        },
      });
    }
    const link = (f) => `${location.origin}/portal/${f.id}`;
    el.innerHTML = `<div class="toolbar"><p class="muted">Forms create tickets automatically — internally from “New ticket”, or publicly via a self-service portal link you can share with customers.</p><span class="grow"></span>
      ${App.can('forms', 'create') ? `<button class="btn primary" id="new">${icon('plus', 16)} Create form</button>` : ''}</div>
      <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Form</th><th>Fields</th><th>Category / priority</th><th>Submissions</th><th>Portal link</th><th>Status</th><th></th></tr></thead><tbody>
      ${forms.map((f) => `<tr><td><b>${esc(f.name)}</b><small class="muted">${esc(f.description || '')}</small></td><td>${f.fields.length}</td><td>${esc(f.category || '')} · ${esc(f.defaultPriority || '')}</td><td>${f.submissions}</td>
        <td>${f.public ? `<button class="btn sm ghost" data-copy="${esc(link(f))}">${icon('copy', 14)} Copy</button> <a class="btn sm ghost" target="_blank" rel="noopener" href="${esc(link(f))}">${icon('link', 14)} Open</a>` : '<span class="muted">internal only</span>'}</td>
        <td>${f.active ? '<span class="pill st-resolved">Active</span>' : '<span class="pill st-closed">Inactive</span>'}</td>${actionBtns('forms', f.id)}</tr>`).join('') || `<tr><td colspan="7">${App.empty('No forms yet')}</td></tr>`}
      </tbody></table></div></div>`;
    el.querySelector('#new')?.addEventListener('click', () => formModal());
    el.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); App.toast('Portal link copied'); } catch { App.toast(b.dataset.copy); }
    }));
    bindRows(el, forms, formModal, async (f) => {
      if (!await App.confirm('Delete form', `Delete “${f.name}”? Existing tickets are kept.`)) return;
      try { await App.del(`/api/forms/${f.id}`); App.toast('Form deleted'); reload(); } catch (e) { App.fail(e); }
    });
  }

  // ================= EMAIL =================
  async function emailTab(el) {
    const { accounts, log } = await App.get('/api/email-accounts');
    const providers = App.meta.emailProviders;
    function accModal(a = { direction: 'inbound', provider: 'm365', enabled: true }) {
      const preset = (dir, prov) => (providers[prov] || providers.custom)[dir === 'inbound' ? 'imap' : 'smtp'] || providers.custom[dir === 'inbound' ? 'imap' : 'smtp'];
      const p0 = a.id ? a : { ...a, ...preset(a.direction, a.provider), folder: 'INBOX', pollMinutes: 5 };
      App.modal({
        title: a.id ? `Edit channel – ${a.name}` : 'Add email channel',
        wide: true,
        body: `<div class="form-grid">
          <label>Channel name<input name="name" value="${esc(p0.name || '')}" placeholder="e.g. Service desk mailbox" required></label>
          <label>Direction<select name="direction">${App.options([{ value: 'inbound', label: 'Inbound – email to ticket (IMAP)' }, { value: 'outbound', label: 'Outbound – notifications (SMTP)' }], p0.direction)}</select></label>
          <label class="span2">Email solution<select name="provider">${App.options(Object.entries(providers).map(([k, v]) => ({ value: k, label: v.label })), p0.provider)}</select></label>
          <label>Server host<input name="host" value="${esc(p0.host || '')}" required></label>
          <label>Port<input type="number" name="port" value="${esc(p0.port || '')}" required></label>
          <label>Authentication<select name="authType">${App.options([{ value: 'password', label: 'Username + password / app password' }, { value: 'oauth2', label: 'OAuth2 access token' }], p0.authType || 'password')}</select></label>
          <label>Username / mailbox<input name="username" value="${esc(p0.username || '')}" autocomplete="off"></label>
          <label>Password / token<input type="password" name="password" value="${esc(p0.password || '')}" autocomplete="new-password"></label>
          <div class="checks"><label class="check"><input type="checkbox" name="secure" ${p0.secure ? 'checked' : ''}> Use SSL/TLS (implicit)</label>
          <label class="check"><input type="checkbox" name="allowSelfSigned" ${p0.allowSelfSigned ? 'checked' : ''}> Allow self-signed certificate (on-premises)</label></div>
          <div class="span2 grid2" data-dir="outbound">
            <label>From name<input name="fromName" value="${esc(p0.fromName || '')}" placeholder="IT Service Desk"></label>
            <label>From address<input type="email" name="fromAddress" value="${esc(p0.fromAddress || '')}" placeholder="servicedesk@company.com"></label>
            <label class="check"><input type="checkbox" name="isDefault" ${p0.isDefault ? 'checked' : ''}> Default outbound channel</label>
          </div>
          <div class="span2 grid2" data-dir="inbound">
            <label>Mailbox folder<input name="folder" value="${esc(p0.folder || 'INBOX')}"></label>
            <label>Check every (minutes)<input type="number" min="1" name="pollMinutes" value="${esc(p0.pollMinutes || 5)}"></label>
            <label>Apply form (category / priority)<select name="defaultFormId">${App.options(App.meta.forms.map((f) => ({ value: f.id, label: f.name })), p0.defaultFormId, { blank: '— None —' })}</select></label>
            <label>Default assignee${App.userPicker('defaultAssigneeId', p0.defaultAssigneeId, { placeholder: 'Leave to workflows' })}</label>
          </div>
          <label class="check span2"><input type="checkbox" name="enabled" ${p0.enabled !== false ? 'checked' : ''}> Enabled</label>
        </div>
        <p class="hint">Works with any cloud (Microsoft 365, Google Workspace, Zoho, Amazon SES, SendGrid…) or on-premises (Exchange Server, Postfix/Dovecot, hMailServer…) system over SMTP / IMAP. Replies containing <code>[${esc(App.meta.settings.ticketPrefix)}-1234]</code> in the subject are added to the existing ticket.</p>`,
        onOpen: (form) => {
          const sync = () => form.querySelectorAll('[data-dir]').forEach((d) => { d.hidden = d.dataset.dir !== form.direction.value; });
          const applyPreset = () => {
            const p = preset(form.direction.value, form.provider.value);
            form.host.value = p.host; form.port.value = p.port; form.secure.checked = !!p.secure;
          };
          form.direction.addEventListener('change', () => { sync(); applyPreset(); });
          form.provider.addEventListener('change', applyPreset);
          sync();
        },
        onSubmit: async (f) => {
          f.port = Number(f.port); f.pollMinutes = Number(f.pollMinutes) || 5;
          if (!f.defaultFormId) f.defaultFormId = null;
          if (!f.defaultAssigneeId) f.defaultAssigneeId = null;
          if (a.id) await App.put(`/api/email-accounts/${a.id}`, f); else await App.post('/api/email-accounts', f);
          App.toast('Email channel saved');
          App.render();
        },
      });
    }
    const section = (dir, title, desc) => {
      const list = accounts.filter((a) => a.direction === dir);
      return `<section class="card"><header><h3>${icon(dir === 'inbound' ? 'mail' : 'right', 16)} ${title}</h3><span class="w-sub">${desc}</span></header>
        ${list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Channel</th><th>Solution</th><th>Server</th><th>${dir === 'inbound' ? 'Last checked' : 'From'}</th><th>Status</th><th>Actions</th><th></th></tr></thead><tbody>
        ${list.map((a) => `<tr><td><b>${esc(a.name)}</b>${a.isDefault ? ' <span class="tag ghost">default</span>' : ''}<small class="muted">${esc(a.username || '')}</small></td><td>${esc(providers[a.provider]?.label || a.provider)}</td><td><code>${esc(a.host)}:${esc(a.port)}</code></td>
          <td>${dir === 'inbound' ? `${App.ago(a.lastPolledAt)}${a.lastError ? `<small class="bad">${esc(a.lastError)}</small>` : ''}` : esc(a.fromAddress || a.username || '')}</td>
          <td>${a.enabled ? '<span class="pill st-resolved">Enabled</span>' : '<span class="pill st-closed">Disabled</span>'}</td>
          <td class="nowrap">${App.can('email', 'edit') ? `<button class="btn sm ghost" data-test="${a.id}">Test</button>${dir === 'inbound' ? `<button class="btn sm ghost" data-poll="${a.id}">Fetch now</button>` : `<button class="btn sm ghost" data-send="${a.id}">Send test</button>`}` : ''}</td>${actionBtns('email', a.id)}</tr>`).join('')}
        </tbody></table></div>` : `<p class="muted pad">No ${dir} channels configured.</p>`}</section>`;
    };
    el.innerHTML = `<div class="toolbar"><p class="muted">Connect any cloud or on-premises email system. Inbound mailboxes turn emails into tickets; outbound sends notifications.</p><span class="grow"></span>
      ${App.can('email', 'create') ? `<button class="btn primary" id="new">${icon('plus', 16)} Add email channel</button>` : ''}</div>
      ${section('inbound', 'Inbound (email → ticket)', 'IMAP')}
      ${section('outbound', 'Outbound (notifications)', 'SMTP')}
      <section class="card"><header><h3>Email activity log</h3></header>${log.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Direction</th><th>Channel</th><th>To / subject</th><th>Status</th></tr></thead><tbody>
        ${log.map((l) => `<tr><td>${App.fmtDateTime(l.at)}</td><td>${l.direction === 'in' ? 'Inbound' : 'Outbound'}</td><td>${esc(l.account || '—')}</td><td>${esc(l.to || '')}<small class="muted">${esc(l.subject || l.detail || '')}</small></td><td><span class="pill ${l.status === 'sent' || l.status === 'polled' ? 'st-resolved' : l.status === 'failed' ? 'prio-critical' : 'st-on-hold'}">${esc(l.status)}</span>${l.status !== 'polled' && l.detail ? `<small class="muted">${esc(l.detail)}</small>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted pad">No email activity yet.</p>'}</section>`;
    el.querySelector('#new')?.addEventListener('click', () => accModal());
    const run = (sel, path, body) => el.querySelectorAll(sel).forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true; const t = b.textContent; b.textContent = 'Working…';
      try { const r = await App.post(`/api/email-accounts/${Object.values(b.dataset)[0]}/${path}`, body?.()); App.toast(r.message); App.render(); } catch (e) { App.fail(e); } finally { b.disabled = false; b.textContent = t; }
    }));
    run('[data-test]', 'test');
    run('[data-poll]', 'poll');
    run('[data-send]', 'send-test', () => ({ to: prompt('Send test email to:', App.me.email || '') || undefined }));
    bindRows(el, accounts, accModal, async (a) => {
      if (!await App.confirm('Delete email channel', `Delete “${a.name}”?`)) return;
      try { await App.del(`/api/email-accounts/${a.id}`); App.toast('Channel deleted'); App.render(); } catch (e) { App.fail(e); }
    });
  }

  // ================= WORKFLOWS =================
  async function workflowsTab(el) {
    const { workflows, logs } = await App.get('/api/workflows');
    const wm = App.meta.workflowMeta;
    const s = App.meta.settings;
    const emailAccs = App.can('email') ? (await App.get('/api/email-accounts')).accounts.filter((a) => a.direction === 'inbound') : [];
    const FIELDS = [['subject', 'Subject'], ['description', 'Description'], ['priority', 'Priority'], ['impact', 'Impact'], ['urgency', 'Urgency'], ['status', 'Status'], ['slaTarget', 'SLA target (response / resolution) – SLA triggers'], ['category', 'Category'], ['source', 'Source (web/email/form/portal/automation)'], ['requesterEmail', 'Requester email'], ['assigneeId', 'Assignee'], ['projectId', 'Project'], ['formId', 'Form']];
    const condRow = (c = {}) => `<div class="builder-row cond">
      <select data-k="field">${App.options(FIELDS.map(([v, l]) => ({ value: v, label: l })), c.field)}<option value="${c.field?.startsWith('formData.') ? esc(c.field) : 'formData.'}" ${c.field?.startsWith('formData.') ? 'selected' : ''}>Form field…</option></select>
      <select data-k="op">${App.options(Object.entries(wm.operators).map(([v, l]) => ({ value: v, label: l })), c.op || 'equals')}</select>
      <input data-k="value" value="${esc(c.value || '')}" placeholder="Value (comma = any of)">
      <button type="button" class="icon-btn" data-rm>${icon('x', 15)}</button></div>`;
    const userMulti = (sel = []) => `<div class="multi">${App.meta.users.map((u) => `<label class="check"><input type="checkbox" data-multi="userIds" value="${u.id}" ${sel.includes(u.id) ? 'checked' : ''}> ${esc(u.name)} ${App.light(u)}</label>`).join('')}</div>`;
    const actionParams = (a) => {
      switch (a.type) {
        case 'assign_user': return `<label>User${App.userPicker('userId', a.userId, { allowNone: false, placeholder: 'Pick a user' })}</label>`;
        case 'assign_round_robin':
        case 'assign_least_loaded': return `<label>Limit to profile<select data-k="profileId">${App.options(App.meta.profiles.map((p) => ({ value: p.id, label: p.name })), a.profileId, { blank: 'Any profile' })}</select></label>
          <label class="check"><input type="checkbox" data-k="onlineOnly" ${a.onlineOnly ? 'checked' : ''}> Prefer online users</label><div class="span2"><small class="muted">Group (leave empty for everyone matching the profile):</small>${userMulti(a.userIds)}</div>`;
        case 'set_priority': return `<label>Priority<select data-k="value">${App.priorityOptions(a.value)}</select></label>`;
        case 'set_status': return `<label>Status<select data-k="value">${App.options(s.ticketStatuses, a.value)}</select></label>`;
        case 'set_category': return `<label>Category<select data-k="value">${App.options(s.ticketCategories, a.value)}</select></label>`;
        case 'set_project': return `<label>Project<select data-k="projectId">${App.projectOptions(a.projectId, 'Select…')}</select></label>`;
        case 'add_comment': return `<label class="span2">Text<textarea data-k="text" rows="2">${esc(a.text || '')}</textarea></label><label class="check"><input type="checkbox" data-k="internal" ${a.internal !== false ? 'checked' : ''}> Internal note</label>`;
        case 'send_email': return `<label>Recipient<select data-k="to">${App.options([{ value: 'requester', label: 'Requester' }, { value: 'assignee', label: 'Assignee' }, { value: 'manager', label: 'Assignee’s reporting manager' }, { value: 'custom', label: 'Custom address' }], a.to || 'requester')}</select></label>
          <label>Custom address<input data-k="address" value="${esc(a.address || '')}"></label><label class="span2">Subject<input data-k="subject" value="${esc(a.subject || '[{{ticket.number}}] {{ticket.subject}}')}"></label><label class="span2">Body<textarea data-k="body" rows="3">${esc(a.body || 'Ticket {{ticket.number}} – {{ticket.subject}}\nPriority: {{ticket.priority}}\nAssignee: {{assignee.name}}')}</textarea></label>`;
        case 'notify_channel': return App.meta.notifyChannels?.length
          ? `<label>Channel<select data-k="channelId">${App.options(App.meta.notifyChannels.map((c) => ({ value: c.id, label: `${c.name} (${App.meta.notifyMeta.types[c.type]})` })), a.channelId)}</select></label>
            <label class="span2">Extra text (optional)<input data-k="text" value="${esc(a.text || '')}" placeholder="e.g. Please pick this up within 15 minutes"></label>`
          : '<p class="muted span2">No notification channels yet – add one under Settings → Notifications (chat &amp; SMS).</p>';
        case 'create_ticket': return `<label class="span2">Subject<input data-k="subject" value="${esc(a.subject || '')}" placeholder="e.g. Weekly backup verification – {{date}}"></label>
          <label class="span2">Description<textarea data-k="description" rows="2">${esc(a.description || '')}</textarea></label>
          <label>Priority<select data-k="priority">${App.priorityOptions(a.priority || 'Medium')}</select></label><label>Category<select data-k="category">${App.options(s.ticketCategories, a.category)}</select></label>
          <label>Project<select data-k="projectId">${App.projectOptions(a.projectId)}</select></label><label>Assign to${App.userPicker('assigneeId', a.assigneeId)}</label>`;
        default: return '';
      }
    };
    const actionRow = (a = { type: 'assign_least_loaded' }) => `<div class="action-card"><div class="row"><span class="step-no"></span><select data-type>${App.options(Object.entries(wm.actions).map(([v, l]) => ({ value: v, label: l })), a.type)}</select><span class="grow"></span><button type="button" class="icon-btn" data-up title="Move up">▲</button><button type="button" class="icon-btn" data-rm>${icon('x', 15)}</button></div><div class="form-grid params">${actionParams(a)}</div></div>`;
    const readAction = (card) => {
      const a = { type: card.querySelector('[data-type]').value };
      card.querySelectorAll('.params [data-k]').forEach((i) => { a[i.dataset.k] = i.type === 'checkbox' ? i.checked : i.value; });
      card.querySelectorAll('.params input[type=hidden][name]').forEach((i) => { a[i.name] = i.value; });
      const multi = [...card.querySelectorAll('[data-multi=userIds]:checked')].map((i) => i.value);
      if (card.querySelector('[data-multi]')) a.userIds = multi;
      return a;
    };

    function wfModal(w = { trigger: 'ticket.created', matchType: 'all', conditions: [], actions: [{ type: 'assign_least_loaded', onlineOnly: true }], enabled: true, schedule: { frequency: 'daily', time: '09:00', weekdays: [1, 2, 3, 4, 5] } }) {
      const sc = w.schedule || { frequency: 'daily', time: '09:00', weekdays: [1, 2, 3, 4, 5] };
      App.modal({
        title: w.id ? `Edit workflow – ${w.name}` : 'Create workflow',
        wide: true,
        body: `<div class="form-grid">
          <label>Workflow name<input name="name" value="${esc(w.name || '')}" required></label>
          <label>Run order<input type="number" name="order" value="${esc(w.order || workflows.length + 1)}"></label>
          <label class="span2">Description<input name="description" value="${esc(w.description || '')}"></label>
          <label class="span2">When (trigger)<select name="trigger">${App.options(Object.entries(wm.triggers).map(([v, l]) => ({ value: v, label: l })), w.trigger)}</select></label>
          <label data-t="ticket.created ticket.updated form.submitted">Only for form<select name="formId">${App.options(App.meta.forms.map((f) => ({ value: f.id, label: f.name })), w.formId, { blank: 'Any form / none' })}</select></label>
          <label data-t="email.received">Only for mailbox<select name="emailAccountId">${App.options(emailAccs.map((a) => ({ value: a.id, label: a.name })), w.emailAccountId, { blank: 'Any inbound mailbox' })}</select></label>
          <div class="span2 grid2" data-t="schedule">
            <label>Frequency<select name="frequency">${App.options([{ value: 'hourly', label: 'Every hour' }, { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }], sc.frequency)}</select></label>
            <label>Time<input type="time" name="time" value="${esc(sc.time || '09:00')}"></label>
            <label>Weekday (weekly)<select name="weekday">${App.options(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => ({ value: i, label: d })), sc.weekday ?? 1)}</select></label>
            <label>Day of month (monthly)<input type="number" min="1" max="28" name="monthDay" value="${esc(sc.monthDay || 1)}"></label>
            <div class="span2"><small class="muted">Daily on:</small> ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => `<label class="check inline"><input type="checkbox" data-wd value="${i}" ${(sc.weekdays || []).map(Number).includes(i) ? 'checked' : ''}> ${d}</label>`).join('')}</div>
          </div>
        </div>
        <div data-t="ticket.created ticket.updated form.submitted email.received">
          <h4>If (conditions) <select name="matchType" class="inline-select">${App.options([{ value: 'all', label: 'all conditions match' }, { value: 'any', label: 'any condition matches' }], w.matchType)}</select></h4>
          <div id="conds">${(w.conditions || []).map(condRow).join('')}</div>
          <button type="button" class="btn sm" id="addc">${icon('plus', 15)} Add condition</button> <small class="muted">No conditions = always run.</small>
        </div>
        <h4>Then (actions run in order)</h4>
        <div id="acts">${(w.actions || []).map(actionRow).join('')}</div>
        <button type="button" class="btn sm" id="adda">${icon('plus', 15)} Add action</button>
        <p class="hint">Placeholders: <code>{{ticket.number}}</code> <code>{{ticket.subject}}</code> <code>{{ticket.priority}}</code> <code>{{ticket.requesterName}}</code> <code>{{assignee.name}}</code> <code>{{date}}</code></p>
        <label class="check"><input type="checkbox" name="enabled" ${w.enabled !== false ? 'checked' : ''}> Enabled</label>`,
        onOpen: (form) => {
          const syncT = () => form.querySelectorAll('[data-t]').forEach((x) => { x.hidden = !x.dataset.t.split(' ').includes(form.trigger.value); });
          form.trigger.addEventListener('change', syncT); syncT();
          const conds = form.querySelector('#conds'); const acts = form.querySelector('#acts');
          const wire = () => {
            form.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { b.closest('.builder-row, .action-card').remove(); }; });
            acts.querySelectorAll('[data-up]').forEach((b) => { b.onclick = () => { const c = b.closest('.action-card'); if (c.previousElementSibling) acts.insertBefore(c, c.previousElementSibling); }; });
            acts.querySelectorAll('[data-type]').forEach((sel) => {
              sel.onchange = () => { sel.closest('.action-card').querySelector('.params').innerHTML = actionParams({ type: sel.value }); App.enhance(acts); };
            });
            conds.querySelectorAll('[data-k=field]').forEach((sel) => {
              sel.onchange = () => {
                if (sel.value === 'formData.') {
                  const k = prompt('Form field key (e.g. impact):');
                  if (k) { const o = sel.selectedOptions[0]; o.value = `formData.${k}`; o.textContent = `Form field: ${k}`; }
                }
              };
            });
            App.enhance(form);
          };
          form.querySelector('#addc').addEventListener('click', () => { conds.insertAdjacentHTML('beforeend', condRow({})); wire(); });
          form.querySelector('#adda').addEventListener('click', () => { acts.insertAdjacentHTML('beforeend', actionRow()); wire(); });
          wire();
        },
        onSubmit: async (f, form) => {
          const conditions = [...form.querySelectorAll('#conds .builder-row')].map((r) => {
            const o = {}; r.querySelectorAll('[data-k]').forEach((i) => { o[i.dataset.k] = i.value; }); return o;
          });
          const actions = [...form.querySelectorAll('#acts .action-card')].map(readAction);
          if (!actions.length) throw new Error('Add at least one action');
          const body = {
            name: f.name, description: f.description, trigger: f.trigger, enabled: f.enabled, order: Number(f.order) || 0,
            formId: f.formId || null, emailAccountId: f.emailAccountId || null, matchType: f.matchType, conditions, actions,
            schedule: { frequency: f.frequency, time: f.time, weekday: Number(f.weekday), monthDay: Number(f.monthDay), weekdays: [...form.querySelectorAll('[data-wd]:checked')].map((i) => Number(i.value)) },
          };
          if (w.id) await App.put(`/api/workflows/${w.id}`, body); else await App.post('/api/workflows', body);
          App.toast('Workflow saved');
          App.render();
        },
      });
    }

    const describe = (w) => {
      const sc = w.schedule || {};
      const when = w.trigger === 'schedule' ? `${sc.frequency} ${sc.frequency === 'hourly' ? '' : `at ${sc.time}`}` : wm.triggers[w.trigger];
      return `<b>When</b> ${esc(when)}${w.conditions?.length ? ` <b>if</b> ${w.conditions.map((c) => `${esc(c.field)} ${esc(wm.operators[c.op] || c.op)} “${esc(c.value)}”`).join(w.matchType === 'any' ? ' <i>or</i> ' : ' <i>and</i> ')}` : ''} <b>then</b> ${(w.actions || []).map((a) => esc(wm.actions[a.type] || a.type).toLowerCase()).join(' → ')}`;
    };
    el.innerHTML = `<div class="toolbar"><p class="muted">Build your own workflows: route tickets from specific forms or mailboxes, auto-assign by workload, notify managers, and create tickets on a schedule.</p><span class="grow"></span>
      ${App.can('workflows', 'create') ? `<button class="btn primary" id="new">${icon('plus', 16)} Create workflow</button>` : ''}</div>
      <div class="wf-list">${workflows.sort((a, b) => (a.order || 0) - (b.order || 0)).map((w) => `<article class="card wf ${w.enabled ? '' : 'off'}">
        <div class="wf-ic">${icon(w.trigger === 'schedule' ? 'clock' : w.trigger === 'email.received' ? 'mail' : w.trigger === 'form.submitted' ? 'form' : 'flow', 20)}</div>
        <div class="wf-main"><h3>${esc(w.name)} ${w.enabled ? '' : '<span class="tag ghost">disabled</span>'}</h3><p class="muted">${esc(w.description || '')}</p><p class="wf-desc">${describe(w)}</p>
          <small class="muted">Ran ${w.runCount || 0} time(s) · last ${App.ago(w.lastRunAt)}</small></div>
        <div class="wf-act">${App.can('workflows', 'edit') ? `<label class="switch" title="Enable / disable"><input type="checkbox" data-toggle="${w.id}" ${w.enabled ? 'checked' : ''}><i></i></label>${w.trigger === 'schedule' ? `<button class="btn sm ghost" data-run="${w.id}">${icon('play', 14)} Run now</button>` : ''}` : ''}
          <table><tr>${actionBtns('workflows', w.id)}</tr></table></div></article>`).join('') || App.empty('No workflows yet', 'Create one to automate ticket assignment and creation.')}</div>
      <section class="card"><header><h3>Execution log</h3></header>${logs.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Workflow</th><th>Trigger</th><th>Ticket</th><th>Result</th></tr></thead><tbody>
        ${logs.map((l) => `<tr><td>${App.fmtDateTime(l.at)}</td><td>${esc(l.workflow)}</td><td>${esc(l.trigger)}</td><td>${esc(l.ticket || '—')}</td><td><span class="pill ${l.status === 'success' ? 'st-resolved' : 'prio-critical'}">${esc(l.status)}</span> <small class="muted">${esc(l.detail)}</small></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted pad">No runs yet.</p>'}</section>`;
    el.querySelector('#new')?.addEventListener('click', () => wfModal());
    el.querySelectorAll('[data-toggle]').forEach((t) => t.addEventListener('change', async () => {
      try { await App.put(`/api/workflows/${t.dataset.toggle}`, { enabled: t.checked }); App.toast(t.checked ? 'Workflow enabled' : 'Workflow disabled'); App.render(); } catch (e) { App.fail(e); }
    }));
    el.querySelectorAll('[data-run]').forEach((b) => b.addEventListener('click', async () => {
      try { const r = await App.post(`/api/workflows/${b.dataset.run}/run`); App.toast(`${r.log.status}: ${r.log.detail}`); await App.refreshMeta(); App.render(); } catch (e) { App.fail(e); }
    }));
    bindRows(el, workflows, wfModal, async (w) => {
      if (!await App.confirm('Delete workflow', `Delete “${w.name}”?`)) return;
      try { await App.del(`/api/workflows/${w.id}`); App.toast('Workflow deleted'); App.render(); } catch (e) { App.fail(e); }
    });
  }

  // ================= GENERAL =================
  async function generalTab(el) {
    const s = await App.get('/api/settings');
    const canEdit = App.can('settings', 'edit');
    el.innerHTML = `<form class="card settings-form" id="gs"><div class="form-grid">
      <label>Workspace name<input name="companyName" value="${esc(s.companyName)}"></label>
      <label>Ticket number prefix<input name="ticketPrefix" value="${esc(s.ticketPrefix)}" maxlength="6"></label>
      <label>Problem number prefix<input name="problemPrefix" value="${esc(s.problemPrefix || 'PRB')}" maxlength="6"></label>
      <label>Change number prefix<input name="changePrefix" value="${esc(s.changePrefix || 'CHG')}" maxlength="6"></label>
      <label>Daily target hours (per engineer)<input type="number" step="0.5" name="dailyTargetHours" value="${esc(s.dailyTargetHours)}"></label>
      <label>Workload: green up to N open tickets<input type="number" min="1" name="workloadGreenMax" value="${esc(s.workloadGreenMax)}"></label>
      <div class="span2 legend-row big"><span class="light light-free"><b></b>0 = Free (white)</span><span class="light light-available"><b></b>1–<span id="gmax">${esc(s.workloadGreenMax)}</span> = Available (green)</span><span class="light light-busy"><b></b>&gt;<span id="gmax2">${esc(s.workloadGreenMax)}</span> = Busy (red)</span></div>
      <label class="span2">Activity types (comma separated)<input name="activityCategories" value="${esc(s.activityCategories.join(', '))}"></label>
      <label class="span2">Ticket categories<input name="ticketCategories" value="${esc(s.ticketCategories.join(', '))}"></label>
      <label class="span2">Ticket statuses<input name="ticketStatuses" value="${esc(s.ticketStatuses.join(', '))}"></label>
      <label class="span2">Statuses that count as closed<input name="closedStatuses" value="${esc(s.closedStatuses.join(', '))}"></label>
      <p class="span2 muted">Priorities, response and resolution targets, business hours and escalation are under <a href="#/settings/sla">SLA &amp; Priority (ITIL)</a>.</p>
      <label class="check"><input type="checkbox" name="notifyOnAssign" ${s.notifyOnAssign ? 'checked' : ''}> Email engineers when a ticket is assigned to them</label>
      <label class="check"><input type="checkbox" name="notifyRequesterOnCreate" ${s.notifyRequesterOnCreate ? 'checked' : ''}> Send acknowledgement to requesters (email / portal tickets)</label>
    </div>${canEdit ? '<footer><button class="btn primary" type="submit">Save settings</button></footer>' : ''}</form>`;
    const f = el.querySelector('#gs');
    f.workloadGreenMax.addEventListener('input', (e) => { el.querySelector('#gmax').textContent = e.target.value; el.querySelector('#gmax2').textContent = e.target.value; });
    if (!canEdit) f.querySelectorAll('input').forEach((i) => { i.disabled = true; });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = App.formData(f);
      body.workloadGreenMax = Number(body.workloadGreenMax); body.dailyTargetHours = Number(body.dailyTargetHours);
      try { await App.put('/api/settings', body); App.toast('Settings saved'); await App.refreshMeta(); document.querySelector('.sidebar .brand span:last-child').textContent = App.meta.settings.companyName; App.render(); } catch (err) { App.fail(err); }
    });
  }

  // ================= SLA & PRIORITY (ITIL) =================
  async function slaTab(el) {
    const s = await App.get('/api/settings');
    const it = App.meta.itil;
    const canEdit = App.can('settings', 'edit');
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let zones = [];
    try { zones = Intl.supportedValuesOf('timeZone'); } catch { /* older browsers */ }
    const prios = [...s.ticketPriorities].reverse(); // P1 first
    const draw = (c) => {
      const bh = c.businessHours;
      const dayLen = (() => { const [a, b] = [bh.start, bh.end].map((x) => { const [h, m] = x.split(':').map(Number); return h * 60 + m; }); return Math.max(0, b - a); })();
      const dur = (m) => (m % 60 ? { v: m, u: 'm' } : { v: m / 60, u: 'h' });
      const durInput = (p, k) => { const d = dur(Number(c.policies[p]?.[k] ?? 60)); return `<input type="number" min="1" step="1" data-pol="${esc(p)}" data-k="${k}" value="${d.v}"><select data-pol="${esc(p)}" data-k="${k}Unit">${App.options([{ value: 'm', label: 'minutes' }, { value: 'h', label: 'hours' }], d.u)}</select>`; };
      el.innerHTML = `<form class="settings-form" id="slf">
        <section class="card"><header><h3>Priority matrix – impact × urgency</h3></header><div class="pad">
          <p class="muted">ITIL sets a ticket's priority from its <b>impact</b> (how many people or how much of the business is affected) and its <b>urgency</b> (how quickly it hurts). P1 is the most urgent.</p>
          <div class="table-wrap"><table class="matrix-table"><thead><tr><th class="rowh">Impact ↓ / Urgency →</th>${it.levels.map((u) => `<th title="${esc(it.urgency[u])}">${u}<br><small class="muted">${esc(it.urgency[u])}</small></th>`).join('')}</tr></thead>
          <tbody>${it.levels.map((i) => `<tr><th class="rowh" title="${esc(it.impact[i])}">${i}<br><small class="muted">${esc(it.impact[i])}</small></th>${it.levels.map((u) => `<td><select data-mx="${i}|${u}">${App.priorityOptions(c.matrix?.[i]?.[u])}</select></td>`).join('')}</tr>`).join('')}</tbody></table></div>
        </div></section>

        <section class="card"><header><h3>Service level targets</h3></header><div class="pad">
          <p class="muted"><b>Response</b>: the first reply to the requester, or moving the ticket on from New/Open. <b>Resolution</b>: the ticket reaches ${esc(s.closedStatuses.join(' or '))}. Business-hours targets only count working time (${App.fmtDuration(dayLen)} per working day).</p>
          <div class="table-wrap"><table class="table sla-policy"><thead><tr><th>Priority</th><th>Response within</th><th>Resolve within</th><th>Clock</th></tr></thead>
          <tbody>${prios.map((p) => `<tr><td>${App.priorityPill(p)}</td><td class="nowrap">${durInput(p, 'response')}</td><td class="nowrap">${durInput(p, 'resolution')}</td>
            <td><select data-pol="${esc(p)}" data-k="hours">${App.options([{ value: '24x7', label: '24×7 (around the clock)' }, { value: 'business', label: 'Business hours' }], c.policies[p]?.hours || '24x7')}</select></td></tr>`).join('')}</tbody></table></div>
        </div></section>

        <section class="card"><header><h3>Business hours</h3></header><div class="pad form-grid">
          <label>Time zone<input name="timezone" list="tzlist" value="${esc(bh.timezone)}"><datalist id="tzlist">${zones.map((z) => `<option value="${esc(z)}">`).join('')}</datalist></label>
          <div class="grid2"><label>Start<input type="time" name="start" value="${esc(bh.start)}"></label><label>End<input type="time" name="end" value="${esc(bh.end)}"></label></div>
          <div class="span2"><span class="lbl">Working days</span><div class="days-row">${DAYS.map((d, i) => `<label class="check inline"><input type="checkbox" data-day="${i}" ${bh.days.includes(i) ? 'checked' : ''}> ${d}</label>`).join('')}</div></div>
          <label class="span2">Holidays <small class="muted">(no SLA time counts on these days for business-hours targets; one date per line, YYYY-MM-DD)</small><textarea name="holidays" rows="3" placeholder="2026-12-25">${esc((c.holidays || []).join('\n'))}</textarea></label>
        </div></section>

        <section class="card"><header><h3>Pending, escalation and closure</h3></header><div class="pad form-grid">
          <div class="span2"><span class="lbl">Statuses that pause the resolution clock (pending)</span><div class="days-row">${s.ticketStatuses.filter((x) => !s.closedStatuses.includes(x)).map((x) => `<label class="check inline"><input type="checkbox" data-pause="${esc(x)}" ${c.pauseStatuses.includes(x) ? 'checked' : ''}> ${esc(x)}</label>`).join('')}</div></div>
          <label>Warn when this much of a target is used (%)<input type="number" min="10" max="99" name="warnAt" value="${esc(c.warnAt)}"></label>
          <label>Close resolved tickets automatically after (days, 0 = never)<input type="number" min="0" max="90" name="autoCloseDays" value="${esc(c.autoCloseDays)}"></label>
          <label class="check span2"><input type="checkbox" name="escalateToManager" ${c.escalateToManager ? 'checked' : ''}> Escalate breaches to the assignee's reporting manager (unassigned tickets go to everyone who can assign tickets)</label>
          <label class="check span2"><input type="checkbox" name="requireResolution" ${c.requireResolution ? 'checked' : ''}> Require a resolution code and notes before a ticket is resolved or closed</label>
          <p class="span2 muted">Warnings and breaches appear in the ticket history and the notification bell, can be sent to Teams / Slack / WhatsApp / SMS channels (events “SLA at risk” and “SLA breached”), and can start workflows (triggers “SLA is at risk” and “SLA is breached”) for functional escalation, e.g. reassign or raise the priority.</p>
        </div></section>
        ${canEdit ? `<div class="row"><button type="button" class="btn ghost" id="sreset">Reset to ITIL defaults</button><span class="grow"></span><button class="btn primary" type="submit">Save SLA settings</button></div>` : ''}
      </form>`;
      const f = el.querySelector('#slf');
      if (!canEdit) f.querySelectorAll('input,select,textarea').forEach((i) => { i.disabled = true; });
      f.querySelector('#sreset')?.addEventListener('click', () => draw(JSON.parse(JSON.stringify({ ...it.defaults, businessHours: { ...it.defaults.businessHours, timezone: bh.timezone } }))));
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = App.formData(f);
        const matrix = {};
        f.querySelectorAll('[data-mx]').forEach((x) => { const [i, u] = x.dataset.mx.split('|'); (matrix[i] ||= {})[u] = x.value; });
        const policies = {};
        for (const p of prios) {
          const get = (k) => f.querySelector(`[data-pol="${CSS.escape(p)}"][data-k="${k}"]`).value;
          const mins = (k) => Number(get(k)) * (get(`${k}Unit`) === 'h' ? 60 : 1);
          policies[p] = { response: mins('response'), resolution: mins('resolution'), hours: get('hours') };
        }
        const body = { sla: {
          matrix, policies,
          businessHours: { timezone: v.timezone, start: v.start, end: v.end, days: [...f.querySelectorAll('[data-day]:checked')].map((x) => Number(x.dataset.day)) },
          holidays: String(v.holidays || ''), pauseStatuses: [...f.querySelectorAll('[data-pause]:checked')].map((x) => x.dataset.pause),
          warnAt: Number(v.warnAt), autoCloseDays: Number(v.autoCloseDays), escalateToManager: !!v.escalateToManager, requireResolution: !!v.requireResolution,
        } };
        try { await App.put('/api/settings', body); App.toast('SLA settings saved – open tickets were recalculated'); await App.refreshMeta(); App.render(); } catch (err) { App.fail(err); }
      });
    };
    draw(JSON.parse(JSON.stringify(s.sla)));
  }

  // ================= REMOTE DESKTOP =================
  async function remoteTab(el) {
    const s = await App.get('/api/settings');
    const r = s.remote || {};
    const providers = App.meta.remoteProviders;
    const canEdit = App.can('settings', 'edit');
    el.innerHTML = `<form class="card settings-form" id="rf">
      <p class="muted">Engineers open remote desktop, terminal and file sessions to devices from <b>Devices &amp; Remote</b>. OpsTrack connects to a remote-management server you run. Each session is logged, and its time goes into the engineer's Daily Tracker.</p>
      <div class="form-grid">
        <label class="span2">Remote management server<select name="provider">${App.options(Object.entries(providers).map(([k, v]) => ({ value: k, label: v.label })), r.provider, { blank: '— Not connected —' })}</select></label>
        <label class="span2" data-p="meshcentral guacamole">Server address<input name="serverUrl" value="${esc(r.serverUrl || '')}" placeholder="https://mesh.yourcompany.com"></label>
        <label data-p="guacamole">Guacamole data source<input name="guacDataSource" value="${esc(r.guacDataSource || 'mysql')}" placeholder="mysql, postgresql, sqlserver or default"></label>
        <label class="span2" data-p="custom">URL template <small class="muted">placeholders: {id} {host} {name} {mode}</small><input name="urlTemplate" value="${esc(r.urlTemplate || '')}" placeholder="https://remote.yourcompany.com/connect?device={id}"></label>
        <label class="check span2"><input type="checkbox" name="embed" ${r.embed !== false ? 'checked' : ''}> Open sessions inside OpsTrack (embedded). Untick to open them in a new browser tab.</label>
        <label class="check"><input type="checkbox" name="logToTracker" ${r.logToTracker !== false ? 'checked' : ''}> Log session time to the Daily Tracker</label>
        <label>Tracker activity type<select name="trackerCategory">${App.options(App.meta.settings.activityCategories, r.trackerCategory || 'Customer Support')}</select></label>
      </div>
      <details class="guide" data-p="meshcentral"><summary>How to set up MeshCentral (free, self-hosted)</summary>
        <ol>
          <li>On a server that both your engineers and the managed devices can reach, run <code>npm install meshcentral</code> then <code>node node_modules/meshcentral</code>. You can also use the official Docker image.</li>
          <li>Open the MeshCentral page, create the first (admin) account and a <b>device group</b>. Click <b>Add Agent</b> and install the agent on each Windows, Linux or macOS device. The agent connects out to MeshCentral, so devices behind firewalls work.</li>
          <li>To show sessions inside OpsTrack, edit <code>meshcentral-data/config.json</code>. In the <code>"settings"</code> section add <code>"allowedFramingOrigins": "https://ops.yourcompany.com"</code> (your OpsTrack address), then restart MeshCentral. This lets only OpsTrack embed it.</li>
          <li>Run OpsTrack and MeshCentral on <b>HTTPS</b> under the <b>same domain</b>, for example <code>ops.yourcompany.com</code> and <code>mesh.yourcompany.com</code>. Otherwise browsers block MeshCentral's login cookie inside the embedded view. If they are on different domains (for example OpsTrack on <code>onrender.com</code>), untick “Open sessions inside OpsTrack” so sessions open in a new tab.</li>
          <li>Create a MeshCentral account for each engineer, with rights on the device groups they support. Engineers sign in to MeshCentral once in their browser.</li>
          <li>In OpsTrack, add each device and paste its node ID. In MeshCentral, open the device and copy the value after <code>gotonode=</code> in the address bar.</li>
        </ol></details>
      <details class="guide" data-p="guacamole"><summary>How to set up Apache Guacamole (free, self-hosted)</summary>
        <ol>
          <li>Install Guacamole, for example with the official <code>guacamole/guacamole</code> and <code>guacamole/guacd</code> Docker images and a MySQL or PostgreSQL database.</li>
          <li>Create a connection (RDP, VNC or SSH) for each device under <b>Settings → Connections</b>. The number in the connection's edit address is its connection ID.</li>
          <li>Set the data source above to match your authentication backend: <code>mysql</code>, <code>postgresql</code> or <code>sqlserver</code>.</li>
          <li>Host Guacamole on the same domain as OpsTrack to show it embedded, or untick “Open sessions inside OpsTrack”.</li>
        </ol></details>
      ${canEdit ? '<footer><button class="btn primary" type="submit">Save remote desktop settings</button></footer>' : ''}
    </form>`;
    const f = el.querySelector('#rf');
    const sync = () => f.querySelectorAll('[data-p]').forEach((x) => { x.hidden = !x.dataset.p.split(' ').includes(f.provider.value); });
    f.provider.addEventListener('change', sync);
    sync();
    if (!canEdit) f.querySelectorAll('input,select').forEach((i) => { i.disabled = true; });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await App.put('/api/settings', { remote: App.formData(f) });
        App.toast('Remote desktop settings saved');
        await App.refreshMeta();
      } catch (err) { App.fail(err); }
    });
  }

  // ================= TEAMS & WHATSAPP =================
  async function notificationsTab(el) {
    const [{ channels, log }, s] = await Promise.all([App.get('/api/notify-channels'), App.get('/api/settings')]);
    const en = s.emailNotify || {};
    const outbound = App.can('email') ? (await App.get('/api/email-accounts').catch(() => ({ accounts: [] }))).accounts.filter((a) => a.direction === 'outbound' && a.enabled) : null;
    const noOutbound = outbound !== null && !outbound.length;
    const nm = App.meta.notifyMeta;
    const prios = [...App.meta.settings.ticketPriorities].reverse();
    const fieldHelp = Object.entries(nm.templateFields).map(([k, v]) => `<code>${k}</code> ${esc(v)}`).join(' · ');
    function channelModal(c = { type: 'teams', enabled: true, events: ['ticket.created'], priorities: [], messageMode: 'template', templateLanguage: 'en', templateFields: 'number,subject,priority,assignee' }) {
      App.modal({
        title: c.id ? `Edit channel – ${c.name}` : 'Add Teams, Slack, WhatsApp or SMS channel',
        wide: true,
        body: `<div class="form-grid">
          <label>Channel name<input name="name" value="${esc(c.name || '')}" placeholder="e.g. Service desk Teams channel" required></label>
          <label>Type<select name="type">${App.options(Object.entries(nm.types).map(([v, l]) => ({ value: v, label: l })), c.type)}</select></label>
          <div class="span2" data-ct="teams slack">
            <label>Webhook address<input name="webhookUrl" value="${esc(c.webhookUrl || '')}" placeholder="https://…" autocomplete="off"></label>
            <p class="hint block" data-ct="teams">In Teams: open the channel → <b>⋯ → Workflows</b> → “Post to a channel when a webhook request is received” → copy the address. The older <b>Connectors → Incoming Webhook</b> address also works.</p>
            <p class="hint block" data-ct="slack">In Slack: <b>api.slack.com/apps → Create New App → From scratch</b> → <b>Incoming Webhooks</b> → turn on → <b>Add New Webhook to Workspace</b> → pick the channel → copy the <code>https://hooks.slack.com/services/…</code> address.</p>
            <label class="check" data-ct="slack"><input type="checkbox" name="mentionCritical" ${c.mentionCritical ? 'checked' : ''}> <span>Mention <b>@here</b> for Critical tickets</span></label>
          </div>
          <div class="span2 grid2" data-ct="whatsapp_meta">
            <label>Phone number ID<input name="phoneNumberId" value="${esc(c.phoneNumberId || '')}" placeholder="from Meta → WhatsApp → API Setup"></label>
            <label>Access token<input type="password" name="accessToken" value="${esc(c.accessToken || '')}" placeholder="permanent system-user token" autocomplete="new-password"></label>
          </div>
          <div class="span2 grid2" data-ct="whatsapp_twilio sms_twilio">
            <label>Account SID<input name="accountSid" value="${esc(c.accountSid || '')}" placeholder="AC…"></label>
            <label>Auth token<input type="password" name="authToken" value="${esc(c.authToken || '')}" autocomplete="new-password"></label>
          </div>
          <div class="span2 grid2" data-ct="sms_vonage">
            <label>API key<input name="apiKey" value="${esc(c.apiKey || '')}" autocomplete="off"></label>
            <label>API secret<input type="password" name="apiSecret" value="${esc(c.apiSecret || '')}" autocomplete="new-password"></label>
          </div>
          <div class="span2 grid2" data-ct="whatsapp_twilio sms_twilio sms_vonage">
            <label>Sender<input name="fromNumber" value="${esc(c.fromNumber || '')}" placeholder="+14155238886 or OPSTRK"></label>
            <p class="hint block">WhatsApp: your WhatsApp-enabled number. SMS: a phone number, an alphanumeric sender ID (up to 11 characters, where the country allows it), or a Twilio Messaging Service SID (<code>MG…</code>).</p>
          </div>
          <div class="span2 grid2" data-ct="sms_http">
            <label class="span2">Gateway address <small class="muted">placeholders: <code>{to}</code> (+91…), <code>{to_digits}</code> (91…), <code>{message}</code></small><input name="gatewayUrl" value="${esc(c.gatewayUrl || '')}" placeholder="https://api.example-sms.com/send?apikey=KEY&to={to_digits}&text={message}" autocomplete="off"></label>
            <label>Method<select name="gatewayMethod">${App.options(['POST', 'GET'], c.gatewayMethod || 'POST')}</select></label>
            <label>Body format (POST)<select name="gatewayContentType">${App.options([{ value: 'json', label: 'JSON' }, { value: 'form', label: 'Form (x-www-form-urlencoded)' }], c.gatewayContentType || 'json')}</select></label>
            <label class="span2">Body (POST)<textarea name="gatewayBody" rows="3" placeholder='{"to": "{to}", "message": "{message}", "sender": "OPSTRK"}'>${esc(c.gatewayBody || '')}</textarea></label>
            <label class="span2">Extra headers <small class="muted">(optional, one per line, e.g. <code>Authorization: Bearer …</code>)</small><textarea name="gatewayHeader" rows="2" autocomplete="off">${esc(c.gatewayHeader || '')}</textarea></label>
          </div>
          <div class="span2 grid2" data-ct="whatsapp_meta whatsapp_twilio sms_twilio sms_vonage sms_http">
            <label class="span2">Send to (phone numbers, international format, one per line or comma-separated)<textarea name="recipients" rows="2" placeholder="+91 98123 45678&#10;+44 7700 900123">${esc(c.recipients || '')}</textarea></label>
            <label class="check span2"><input type="checkbox" name="notifyAssignee" ${c.notifyAssignee ? 'checked' : ''}> Also send to the assigned engineer (phone number from their user profile)</label>
            <p class="hint block span2" data-ct="sms_twilio sms_vonage sms_http">SMS text: “[${esc(App.meta.settings.companyName)}] New ticket INC-1023 (Critical): Email server down. Assignee: Ravi.” followed by the ticket link (up to 3 SMS segments).</p>
          </div>
          <div class="span2 grid2" data-ct="whatsapp_meta whatsapp_twilio">
            <label>Message type<select name="messageMode">${App.options([{ value: 'template', label: 'Approved template (required to start conversations)' }, { value: 'text', label: 'Plain text (only inside a 24-hour customer-service window)' }], c.messageMode || 'template')}</select></label>
            <label data-ct="whatsapp_meta" data-mode="template">Template name<input name="templateName" value="${esc(c.templateName || '')}" placeholder="new_ticket_alert"></label>
            <label data-ct="whatsapp_meta" data-mode="template">Template language<input name="templateLanguage" value="${esc(c.templateLanguage || 'en')}" placeholder="en, en_US, hi"></label>
            <label data-ct="whatsapp_twilio" data-mode="template">Content template SID<input name="contentSid" value="${esc(c.contentSid || '')}" placeholder="HX…"></label>
            <label class="span2" data-mode="template">Template variables {{1}}, {{2}}, … in order<input name="templateFields" value="${esc(c.templateFields || 'number,subject,priority,assignee')}"><small class="muted">${fieldHelp}</small></label>
          </div>
          <fieldset class="span2"><legend>Send when</legend>
            ${Object.entries(nm.events).map(([v, l]) => `<label class="check inline"><input type="checkbox" data-ev value="${v}" ${(c.events || []).includes(v) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}
            <div class="row" style="margin-top:8px"><small class="muted">Only these priorities (none ticked = all):</small> ${prios.map((p) => `<label class="check inline"><input type="checkbox" data-pr value="${esc(p)}" ${(c.priorities || []).includes(p) ? 'checked' : ''}> ${esc(App.prioLabel(p))}</label>`).join('')}</div>
          </fieldset>
          <label class="check"><input type="checkbox" name="enabled" ${c.enabled !== false ? 'checked' : ''}> Enabled</label>
        </div>`,
        onOpen: (form) => {
          const sync = () => {
            const t = form.type.value; const mode = form.messageMode.value;
            const forType = (x) => !x.dataset.ct || x.dataset.ct.split(' ').includes(t);
            form.querySelectorAll('[data-ct], [data-mode]').forEach((x) => { x.hidden = !forType(x) || (x.dataset.mode && x.dataset.mode !== mode); });
          };
          form.type.addEventListener('change', sync);
          form.messageMode.addEventListener('change', sync);
          sync();
        },
        onSubmit: async (f, form) => {
          f.events = [...form.querySelectorAll('[data-ev]:checked')].map((x) => x.value);
          f.priorities = [...form.querySelectorAll('[data-pr]:checked')].map((x) => x.value);
          if (!f.events.length) throw new Error('Choose at least one event');
          if (c.id) await App.put(`/api/notify-channels/${c.id}`, f); else await App.post('/api/notify-channels', f);
          App.toast('Channel saved');
          await App.refreshMeta();
          App.render();
        },
      });
    }
    const canEdit = App.can('notifications', 'edit');
    el.innerHTML = `<form class="card settings-form compact" id="pub">
        <label>OpsTrack web address <small class="muted">(used for ticket links in emails, Teams, Slack, WhatsApp and SMS)</small>
          <div class="row"><input name="publicUrl" value="${esc(s.publicUrl || location.origin)}" class="grow" ${App.can('settings', 'edit') ? '' : 'disabled'}>${App.can('settings', 'edit') ? '<button class="btn" type="submit">Save</button>' : ''}</div></label>
      </form>
      <form class="card settings-form" id="em">
        <header class="row"><h3>${icon('mail', 16)} Email notifications for ticket updates</h3></header>
        ${noOutbound ? `<p class="notice">No outbound email channel is set up yet, so these emails can't be sent. <a href="#/settings/email">Add one under Settings → Email</a>.</p>` : ''}
        <div class="email-rules">
          <div><h4>Requester</h4>
            <label class="check"><input type="checkbox" name="requesterOnStatus" ${en.requesterOnStatus ? 'checked' : ''}> When the status changes to:</label>
            <div class="chips-row">${App.meta.settings.ticketStatuses.map((st) => `<label class="check inline"><input type="checkbox" data-st value="${esc(st)}" ${(en.requesterStatuses || []).includes(st) ? 'checked' : ''}> ${esc(st)}</label>`).join('')}</div>
            <label class="check"><input type="checkbox" name="requesterOnReply" ${en.requesterOnReply ? 'checked' : ''}> When an engineer replies (public comments, never internal notes)</label>
          </div>
          <div><h4>Assigned engineer</h4>
            <label class="check"><input type="checkbox" name="assigneeOnUpdate" ${en.assigneeOnUpdate ? 'checked' : ''}> When someone else changes the ticket</label>
            <label class="check"><input type="checkbox" name="assigneeOnComment" ${en.assigneeOnComment ? 'checked' : ''}> When someone else comments, including requester email replies and internal notes</label>
            <p class="hint block">Emails on assignment are set in Settings → General.</p>
          </div>
          <div><h4>CC on the ticket</h4>
            <label class="check"><input type="checkbox" name="watchersOnUpdate" ${en.watchersOnUpdate ? 'checked' : ''}> Email addresses in a ticket's “Notify also (CC)” field get status, priority and assignee changes, plus public replies</label>
          </div>
        </div>
        <p class="hint block">Nobody is emailed about their own change. Engineers' emails include a link to the ticket. Anyone can reply to an email to add a comment.</p>
        ${App.can('settings', 'edit') ? '<footer><button class="btn primary" type="submit">Save email notifications</button></footer>' : ''}
      </form>
      <div class="toolbar"><p class="muted">Send new and assigned tickets to Microsoft Teams, Slack, WhatsApp and SMS. Channels can also be used by workflows (action “Send a Teams / Slack / WhatsApp / SMS message”).</p><span class="grow"></span>
        ${App.can('notifications', 'create') ? `<button class="btn primary" id="new">${icon('plus', 16)} Add channel</button>` : ''}</div>
      <div class="card">${channels.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Channel</th><th>Type</th><th>Sends when</th><th>Priorities</th><th>Status</th><th></th><th></th></tr></thead><tbody>
        ${channels.map((c) => `<tr><td><b>${esc(c.name)}</b>${c.type === 'slack' && c.mentionCritical ? '<small class="muted">@here on Critical</small>' : ''}${/^(whatsapp|sms)/.test(c.type) ? `<small class="muted">${esc(String(c.recipients || '').split(/[\n,;]+/).filter((x) => x.trim()).length)} number(s)${c.notifyAssignee ? ' + assignee' : ''}${c.type.startsWith('whatsapp') ? ` · ${c.messageMode === 'text' ? 'plain text' : 'template'}` : ''}</small>` : ''}</td>
          <td>${esc(nm.types[c.type] || c.type)}</td><td>${(c.events || []).map((e) => `<span class="tag ghost">${esc(nm.events[e] || e)}</span>`).join('')}</td>
          <td>${(c.priorities || []).length ? c.priorities.map((p) => App.priorityPill(p)).join(' ') : '<span class="muted">all</span>'}</td>
          <td>${c.enabled ? '<span class="pill st-resolved">Enabled</span>' : '<span class="pill st-closed">Disabled</span>'}</td>
          <td>${canEdit ? `<button class="btn sm ghost" data-test="${c.id}">Send test</button>` : ''}</td>${actionBtns('notifications', c.id)}</tr>`).join('')}
      </tbody></table></div>` : App.empty('No channels yet', 'Add a Microsoft Teams or Slack channel, or WhatsApp / SMS numbers, to be told about new tickets.')}</div>
      <section class="card"><header><h3>Delivery log</h3></header>${log.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Channel</th><th>Event</th><th>Ticket</th><th>Result</th></tr></thead><tbody>
        ${log.map((l) => `<tr><td>${App.fmtDateTime(l.at)}</td><td>${esc(l.channel)}</td><td>${esc(nm.events[l.event] || { workflow: 'Workflow', test: 'Test message' }[l.event] || l.event)}</td><td>${esc(l.ticket || '—')}</td><td><span class="pill ${l.status === 'sent' ? 'st-resolved' : 'prio-critical'}">${esc(l.status)}</span> <small class="muted">${esc(l.detail || '')}</small></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted pad">Nothing sent yet.</p>'}</section>`;
    const emForm = el.querySelector('#em');
    if (!App.can('settings', 'edit')) emForm.querySelectorAll('input').forEach((i) => { i.disabled = true; });
    emForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = App.formData(emForm);
      f.requesterStatuses = [...emForm.querySelectorAll('[data-st]:checked')].map((x) => x.value);
      try { await App.put('/api/settings', { emailNotify: f }); App.toast('Email notifications saved'); } catch (err) { App.fail(err); }
    });
    el.querySelector('#pub').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await App.put('/api/settings', { publicUrl: e.target.publicUrl.value.trim() }); App.toast('Address saved'); } catch (err) { App.fail(err); }
    });
    el.querySelector('#new')?.addEventListener('click', () => channelModal());
    el.querySelectorAll('[data-test]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true; const t = b.textContent; b.textContent = 'Sending…';
      try { const r = await App.post(`/api/notify-channels/${b.dataset.test}/test`); App.toast(r.message); } catch (err) { App.fail(err); } finally { b.disabled = false; b.textContent = t; App.render(); }
    }));
    bindRows(el, channels, channelModal, async (c) => {
      if (!await App.confirm('Delete channel', `Delete “${c.name}”? Workflows using it will skip it.`)) return;
      try { await App.del(`/api/notify-channels/${c.id}`); App.toast('Channel deleted'); await App.refreshMeta(); App.render(); } catch (err) { App.fail(err); }
    });
  }

  async function auditTab(el) {
    const list = await App.get('/api/audit');
    el.innerHTML = `<div class="card">${list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>User</th><th>Action</th><th>Target</th></tr></thead><tbody>${list.map((a) => `<tr><td>${App.fmtDateTime(a.at)}</td><td>${esc(a.userName || '—')}</td><td><code>${esc(a.action)}</code></td><td>${esc(a.target || '')}</td></tr>`).join('')}</tbody></table></div>` : App.empty('No audit entries')}</div>`;
  }

  const RENDER = { users: usersTab, profiles: profilesTab, forms: formsTab, email: emailTab, workflows: workflowsTab, general: generalTab, sla: slaTab, remote: remoteTab, notifications: notificationsTab, audit: auditTab };

  App.pages.settings = {
    title: 'Settings',
    async render(el, params) {
      const tabs = TABS.filter((t) => App.can(t.perm));
      if (!tabs.length) { el.innerHTML = App.empty('No access', 'Your profile has no administration permissions.'); return; }
      const cur = tabs.find((t) => t.id === params[0]) || tabs[0];
      el.innerHTML = `<div class="settings-layout"><nav class="settings-nav">${tabs.map((t) => `<a href="#/settings/${t.id}" class="${t.id === cur.id ? 'on' : ''}">${icon(t.icon, 16)} ${t.label}</a>`).join('')}</nav><div id="stab"></div></div>`;
      await RENDER[cur.id](el.querySelector('#stab'));
    },
  };
})();
