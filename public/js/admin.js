// TexRec admin portal
let token = sessionStorage.getItem('texrec_token');
let regFilter = '';

const authed = (path, opts = {}) => api(path, {
  ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });

function show(view) {
  $('#login-view').style.display = view === 'login' ? '' : 'none';
  $('#dash-view').style.display = view === 'dash' ? '' : 'none';
}

// ---------- login ----------
$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#login-msg');
  msg.className = 'form-msg';
  try {
    const data = Object.fromEntries(new FormData(e.target));
    const res = await api('/api/admin/login', { method: 'POST', body: data });
    token = res.token;
    sessionStorage.setItem('texrec_token', token);
    sessionStorage.setItem('texrec_name', res.name);
    enterDash();
  } catch (err) {
    msg.className = 'form-msg err';
    msg.textContent = err.message;
  }
});

$('#logout').addEventListener('click', async () => {
  try { await authed('/api/admin/logout', { method: 'POST' }); } catch {}
  sessionStorage.clear(); token = null;
  show('login');
});

// ---------- registrations ----------
async function loadRegs() {
  let regs;
  try { regs = await authed(`/api/admin/registrations${regFilter ? `?status=${regFilter}` : ''}`); }
  catch (err) { if (err.status === 401) { sessionStorage.clear(); token = null; show('login'); } return; }

  const pending = regs.filter(r => r.status === 'pending').length;
  const pc = $('#pending-count');
  if (regFilter === '' || regFilter === 'pending') {
    pc.style.display = pending ? '' : 'none';
    pc.textContent = pending;
  }

  $('#reg-rows').innerHTML = regs.length ? regs.map(r => `
    <tr>
      <td><strong>${esc(r.first_name)} ${esc(r.last_name)}</strong><br>
        <span style="font-size:13px;color:var(--ink-soft)">${esc(r.cert_level) || 'New diver'}</span></td>
      <td>${esc(r.course_name)}<br>
        <span style="font-size:13px;color:var(--ink-soft)">${r.session_registered}/${r.capacity} enrolled</span></td>
      <td>${fmtDate(r.start_date.slice(0,10), { month: 'short', day: 'numeric', year: 'numeric' })}</td>
      <td style="font-size:14px"><a href="mailto:${esc(r.email)}">${esc(r.email)}</a><br>${esc(r.phone)}</td>
      <td style="font-size:14px;max-width:180px">${esc(r.notes) || '—'}</td>
      <td><span class="status-pill ${r.status}">${r.status}</span></td>
      <td><span class="form-flag ${regValidation(r, r).color}" title="Paid, medical, welcome packet & coursework">${regValidation(r, r).label}</span></td>
      <td><div class="row-actions">
        ${r.status !== 'confirmed' ? `<button class="btn btn-sm btn-red" data-act="confirmed" data-id="${r.id}">Confirm</button>` : ''}
        ${r.status !== 'cancelled' ? `<button class="btn btn-sm btn-ghost" data-act="cancelled" data-id="${r.id}">Cancel</button>` : ''}
        ${r.status === 'cancelled' ? `<button class="btn btn-sm btn-ghost" data-act="pending" data-id="${r.id}">Reopen</button>` : ''}
      </div></td>
    </tr>`).join('')
    : '<tr><td colspan="8" style="text-align:center;color:var(--ink-soft);padding:30px">No registrations here.</td></tr>';

  $$('#reg-rows [data-act]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    await authed(`/api/admin/registrations/${b.dataset.id}`, {
      method: 'PATCH', body: { status: b.dataset.act } });
    loadRegs();
  }));
}

$('#reg-filters').addEventListener('click', e => {
  const b = e.target.closest('[data-f]');
  if (!b) return;
  regFilter = b.dataset.f;
  $$('#reg-filters .btn').forEach(x => x.className = 'btn btn-sm btn-ghost');
  b.className = 'btn btn-sm btn-red';
  loadRegs();
});

// ---------- sessions ----------
const CREW_ROLES = {
  instructor: 'Instructor', divemaster: 'Divemaster',
  instructor_trainee: 'Instructor-in-Training', divemaster_trainee: 'DM-in-Training',
};
let sessionCache = [];
let crewStaffCache = [];   // active staff, for the crew picker in the detail panel

async function loadSessions() {
  const isInstructor = me?.role === 'instructor';
  const reqs = [authed('/api/admin/sessions'), api('/api/courses')];
  if (!isInstructor) reqs.push(authed('/api/admin/staff'), api('/api/sites'));
  const [sessions, courses, staff, sites] = await Promise.all(reqs);
  sessionCache = sessions;
  crewStaffCache = (staff || []).filter(p => p.active);

  if (!isInstructor) {
    $('#s-course').innerHTML = courses.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    // location typeahead: site name + city
    $('#s-locations').innerHTML = (sites || []).map(s =>
      `<option value="${esc(s.name)}${s.location ? ' — ' + esc(s.location) : ''}"></option>`).join('');
    $('#crew-role').innerHTML = Object.entries(CREW_ROLES).map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  }

  // read-only crew chips for the row expansion
  const crewChips = s => s.staff.length
    ? `<div class="crew-chips">${s.staff.map(p =>
        `<span class="chip ${p.role}">${esc(p.name)} · ${CREW_ROLES[p.role]}</span>`).join('')}</div>`
    : '<span style="color:var(--ink-soft)">No crew assigned</span>';

  $('#session-rows').innerHTML = sessions.length ? sessions.map(s => {
    const lead = s.staff.find(p => p.role === 'instructor');
    return `
    <tr class="mrow" data-x="${s.id}">
      <td class="chev">▸</td>
      <td><strong>${esc(s.title || s.course_name)}</strong>${s.title ? `<br><span style="font-size:12px;color:var(--ink-soft)">${esc(s.course_name)}</span>` : ''}</td>
      <td>${fmtRange(s.start_date.slice(0,10), s.end_date.slice(0,10))}</td>
      <td>${lead ? esc(lead.name) : '<span style="color:var(--warn);font-weight:700">Unassigned</span>'}
        ${s.staff.length > 1 ? `<span class="chip" style="font-size:10px">+${s.staff.length - 1} crew</span>` : ''}</td>
      <td>${s.registered}/${s.capacity}</td>
      <td><span class="status-pill ${s.status === 'open' ? 'confirmed' : s.status === 'cancelled' ? 'cancelled' : 'pending'}">${s.status}</span></td>
      <td><div class="row-actions">
        <button class="btn btn-sm btn-ghost" data-sdetail="${s.id}">Roster &amp; Files</button>
        ${isInstructor ? '' : `
        <button class="btn btn-sm btn-ghost" data-sedit="${s.id}">Edit</button>
        ${s.status === 'open' ? `<button class="btn btn-sm btn-ghost" data-sact="cancelled" data-id="${s.id}">Cancel</button>` : ''}
        ${s.status === 'cancelled' ? `<button class="btn btn-sm btn-red" data-sact="open" data-id="${s.id}">Reopen</button>` : ''}
        <button class="btn btn-sm btn-ghost" data-sdel="${s.id}">Delete</button>`}
      </div></td>
    </tr>
    <tr class="xrow" data-xrow="${s.id}" hidden><td colspan="7"><div class="xpand">
      <div><span class="xl">Location &amp; Time</span>${esc(s.location)} · starts ${(s.start_time || '').slice(0,5)}</div>
      ${s.notes ? `<div><span class="xl">Notes</span>${esc(s.notes)}</div>` : ''}
      <div><span class="xl">Crew</span>${crewChips(s)}</div>
    </div></td></tr>`;
  }).join('')
    : '<tr><td colspan="7" style="text-align:center;color:var(--ink-soft);padding:30px">No classes here yet.</td></tr>';
  wireExpand('#session-rows');

  $$('#session-rows [data-sedit]').forEach(b => b.addEventListener('click', () => {
    const s = sessionCache.find(x => x.id === +b.dataset.sedit);
    const f = $('#session-form').elements;
    f.id.value = s.id;
    f.course_id.value = s.course_id;
    f.course_id.disabled = true; // course can't change once scheduled
    f.title.value = s.title || '';
    f.location.value = s.location;
    f.start_date.value = s.start_date.slice(0,10);
    f.end_date.value = s.end_date.slice(0,10);
    f.start_time.value = (s.start_time || '09:00').slice(0,5);
    f.capacity.value = s.capacity;
    f.notes.value = s.notes || '';
    setSingleDay(s.start_date.slice(0,10) === s.end_date.slice(0,10));
    $('#session-form-title').textContent = `Editing: ${sessionCache.find(x=>x.id===s.id).title || s.course_name}`;
    $('#session-form button[type=submit]').textContent = 'Save Changes';
    openFormModal('session-form-card');
  }));

  $$('#session-rows [data-sdel]').forEach(b => b.addEventListener('click', async () => {
    const s = sessionCache.find(x => x.id === +b.dataset.sdel);
    if (await deleteWithForce(`/api/admin/sessions/${s.id}`,
      `Delete ${s.course_name} starting ${s.start_date.slice(0,10)}? This cannot be undone.`)) {
      loadSessions();
    }
  }));

  $$('#session-rows [data-sact]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    await authed(`/api/admin/sessions/${b.dataset.id}`, {
      method: 'PATCH', body: { status: b.dataset.sact } });
    loadSessions();
  }));

  $$('#session-rows [data-sdetail]').forEach(b =>
    b.addEventListener('click', () => openSessionDetail(+b.dataset.sdetail)));
}

// single-day toggle: hide the end-date field and mirror start → end on submit
function setSingleDay(on) {
  $('#s-singleday').checked = on;
  $('#s-enddate-field').style.display = on ? 'none' : '';
}
$('#s-singleday').addEventListener('change', e => {
  $('#s-enddate-field').style.display = e.target.checked ? 'none' : '';
});

// ---------- session detail: roster + media ----------
let detailSessionId = null;

async function openSessionDetail(id) {
  detailSessionId = id;
  const s = sessionCache.find(x => x.id === id);
  $('#sd-title').textContent = `${s.title || s.course_name} — ${fmtDate(s.start_date.slice(0,10), { month: 'long', day: 'numeric', year: 'numeric' })}`;
  $('#session-detail').style.display = '';
  renderCrew(s);
  const [roster, media] = await Promise.all([
    authed(`/api/admin/sessions/${id}/roster`),
    authed(`/api/admin/sessions/${id}/media`)]);

  $('#sd-roster').innerHTML = roster.length ? roster.map(r => `
    <tr>
      <td><strong>${esc(r.first_name)} ${esc(r.last_name)}</strong></td>
      <td style="font-size:14px"><a href="mailto:${esc(r.email)}">${esc(r.email)}</a><br>${esc(r.phone)}</td>
      <td>${esc(r.cert_level) || 'New diver'}</td>
      <td><span class="status-pill ${r.status}">${r.status}</span></td>
      <td>${r.customer_id ? `<button class="btn btn-sm btn-ghost" data-open-cust="${r.customer_id}">Record</button>` : ''}</td>
    </tr>`).join('')
    : '<tr><td colspan="5" style="text-align:center;color:var(--ink-soft);padding:20px">No students registered yet.</td></tr>';
  $$('#sd-roster [data-open-cust]').forEach(b => b.addEventListener('click', () => {
    switchTab('customers');
    openCustomerDetail(+b.dataset.openCust);
  }));

  renderSessionMedia(media);
  loadMeetings(id);
  $('#session-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- class "Sessions" (dated events) editor in the detail panel ----------
async function loadMeetings(sessionId) {
  const sec = $('#sd-sessions-section');
  if (me?.role === 'instructor') { sec.style.display = 'none'; return; }   // schedule editing is staff+
  sec.style.display = '';
  const sel = $('#m-type');
  if (!sel.dataset.filled) {
    sel.innerHTML = SESSION_TYPES.map(t => `<option value="${t.key}">${t.label}</option>`).join('');
    sel.dataset.filled = '1';
  }
  const meetings = await authed(`/api/admin/sessions/${sessionId}/meetings`);
  $('#sd-sessions').innerHTML = meetings.length ? meetings.map(m => `
    <tr>
      <td><span class="chip">${SESSION_TYPE_LABEL[m.type] || m.type}</span></td>
      <td>${esc(m.title) || '—'}</td>
      <td>${fmtDate(m.meeting_date.slice(0,10), { month:'short', day:'numeric', year:'numeric' })}</td>
      <td>${fmtTime(m.start_time) || '—'}</td>
      <td style="font-size:13.5px">${esc(m.location) || '—'}</td>
      <td>${m.enrolled}/${m.capacity}</td>
      <td><button class="btn btn-sm btn-ghost" data-mdel="${m.id}">Delete</button></td>
    </tr>`).join('')
    : '<tr><td colspan="7" style="text-align:center;color:var(--ink-soft);padding:14px">No sessions scheduled yet.</td></tr>';
  $$('#sd-sessions [data-mdel]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete this session date?')) return;
    await authed(`/api/admin/meetings/${b.dataset.mdel}`, { method: 'DELETE' });
    loadMeetings(sessionId);
  }));
}

$('#meeting-form').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#meeting-msg'), f = e.target;
  const body = {
    type: f.type.value, title: f.title.value.trim(), meeting_date: f.meeting_date.value,
    start_time: f.start_time.value || null, location: f.location.value.trim(),
    capacity: +f.capacity.value || 6,
  };
  try {
    await authed(`/api/admin/sessions/${detailSessionId}/meetings`, { method: 'POST', body });
    f.reset(); f.capacity.value = 6;
    msg.style.color = 'var(--ok)'; msg.textContent = 'Added ✓';
    setTimeout(() => { msg.textContent = ''; }, 2000);
    loadMeetings(detailSessionId);
  } catch (err) { msg.style.color = 'var(--red)'; msg.textContent = err.message; }
});

// ---------- crew management (explicit add/remove, in the detail panel) ----------
function renderCrew(s) {
  if (me?.role === 'instructor') { $('#sd-crew-section').style.display = 'none'; return; }
  $('#sd-crew-section').style.display = '';
  $('#sd-crew').innerHTML = s.staff.length ? s.staff.map(p =>
    `<span class="chip ${p.role}">${esc(p.name)} · ${CREW_ROLES[p.role]}
      <button data-crewdel="${p.staff_id}" title="Remove">✕</button></span>`).join('')
    : '<span style="color:var(--ink-soft)">No crew assigned yet.</span>';
  // populate the picker with staff not already on the crew
  const onCrew = new Set(s.staff.map(p => p.staff_id));
  $('#crew-staff').innerHTML = crewStaffCache.filter(p => !onCrew.has(p.id))
    .map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')
    || '<option value="">— everyone is assigned —</option>';
  $$('#sd-crew [data-crewdel]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    await authed(`/api/admin/sessions/${detailSessionId}/staff/${b.dataset.crewdel}`, { method: 'DELETE' });
    await refreshDetailSession();
  }));
}

// re-fetch the sessions list, update caches, and re-render the open detail crew
async function refreshDetailSession() {
  sessionCache = await authed('/api/admin/sessions');
  const s = sessionCache.find(x => x.id === detailSessionId);
  if (s) renderCrew(s);
}

$('#crew-form').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#crew-msg');
  const f = e.target.elements;
  if (!f.staff_id.value) return;
  try {
    await authed(`/api/admin/sessions/${detailSessionId}/staff`, {
      method: 'POST', body: { staff_id: +f.staff_id.value, role: f.role.value } });
    msg.style.color = 'var(--ok)'; msg.textContent = 'Added ✓';
    await refreshDetailSession();
    try { const r = await authed('/api/admin/notifications?unacked=1'); updateBadges(r.unacked); } catch {}
    setTimeout(() => msg.textContent = '', 2500);
  } catch (err) {
    msg.style.color = 'var(--red)'; msg.textContent = err.message;
  }
});

function renderSessionMedia(media) {
  $('#sd-media').innerHTML = media.length ? media.map(m => {
    const src = `/api/media/${m.id}/file?t=${encodeURIComponent(token)}`;
    return `
    <div class="media-card">
      ${m.mime.startsWith('image/')
        ? `<img src="${src}" alt="" loading="lazy" onclick="window.open('${src}','_blank')">`
        : `<div class="doc-icon" onclick="window.open('${src}','_blank')">📄</div>`}
      <div class="mc-body">
        <strong>${esc(m.title || m.original_name)}</strong>
        <span>${m.is_customer_upload ? '📷 ' : ''}${esc(m.uploaded_by_name) || ''}${m.is_customer_upload ? ' (student)' : ''}</span>
        <div style="margin-top:6px"><button class="btn btn-sm btn-ghost" data-mdel="${m.id}">Delete</button></div>
      </div>
    </div>`;
  }).join('')
    : '<p style="color:var(--ink-soft)">No files yet — upload class photos or documents above.</p>';

  $$('#sd-media [data-mdel]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete this file?')) return;
    await authed(`/api/admin/media/${b.dataset.mdel}`, { method: 'DELETE' });
    renderSessionMedia(await authed(`/api/admin/sessions/${detailSessionId}/media`));
  }));
}

$('#sd-close').addEventListener('click', () => $('#session-detail').style.display = 'none');

$('#media-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (!detailSessionId) return;
  const msg = $('#media-msg');
  const fd = new FormData(e.target);
  msg.style.color = 'var(--ink-soft)'; msg.textContent = 'Uploading…';
  const res = await fetch(`/api/admin/sessions/${detailSessionId}/media`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { msg.style.color = 'var(--red)'; msg.textContent = data.error || 'Upload failed'; return; }
  msg.style.color = 'var(--ok)'; msg.textContent = 'Uploaded ✓';
  e.target.reset();
  renderSessionMedia(await authed(`/api/admin/sessions/${detailSessionId}/media`));
  setTimeout(() => msg.textContent = '', 3000);
});

function resetSessionForm() {
  const f = $('#session-form');
  f.reset();
  f.elements.id.value = '';
  f.elements.course_id.disabled = false;
  f.elements.capacity.value = '8';
  f.elements.start_time.value = '09:00';
  f.elements.location.value = 'TexRec HQ — Burleson, TX';
  setSingleDay(false);
  $('#session-form-title').textContent = 'Add a class session';
  $('#session-form button[type=submit]').textContent = 'Add Session';
  $('#session-msg').textContent = '';
}

$('#session-form').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#session-msg');
  const data = Object.fromEntries(new FormData(e.target));
  // single-day class → end date mirrors the start date
  if ($('#s-singleday').checked || !data.end_date) data.end_date = data.start_date;
  data.capacity = +data.capacity || 8;
  const id = data.id; delete data.id;
  try {
    if (id) {
      delete data.course_id;
      await authed(`/api/admin/sessions/${id}`, { method: 'PATCH', body: data });
    } else {
      await authed('/api/admin/sessions', { method: 'POST', body: data });
    }
    resetSessionForm();
    closeAdmModal();
    loadSessions();
  } catch (err) {
    msg.style.color = 'var(--red)'; msg.textContent = err.message;
  }
});

// ---------- staff ----------
let staffCache = [];

async function loadStaff() {
  staffCache = await authed('/api/admin/staff');
  $('#staff-rows').innerHTML = staffCache.map(p => `
    <tr class="mrow" data-x="${p.id}">
      <td class="chev">▸</td>
      <td><div style="display:flex;align-items:center;gap:10px">
        <div class="avatar" style="width:40px;height:40px;font-size:15px;margin:0">${esc(p.initials)}</div>
        <strong>${esc(p.name)}</strong></div></td>
      <td style="font-size:14px">${esc(p.role)}</td>
      <td><span class="status-pill ${p.active ? 'confirmed' : 'cancelled'}">${p.active ? 'visible' : 'hidden'}</span></td>
      <td><div class="row-actions">
        <button class="btn btn-sm btn-ghost" data-staff-hist="${p.id}" data-name="${esc(p.name)}">History</button>
        <button class="btn btn-sm btn-ghost" data-staff-edit="${p.id}">Edit</button>
        <button class="btn btn-sm ${p.active ? 'btn-ghost' : 'btn-red'}" data-staff-toggle="${p.id}">
          ${p.active ? 'Hide' : 'Show'}</button>
        <button class="btn btn-sm btn-ghost" data-staff-del="${p.id}" data-name="${esc(p.name)}">Delete</button>
      </div></td>
    </tr>
    <tr class="xrow" data-xrow="${p.id}" hidden><td colspan="5"><div class="xpand">
      <div><span class="xl">Certifications</span>${esc(p.certs) || '—'}</div>
      <div><span class="xl">Teaches</span>${esc(p.teaches) || '—'}</div>
      <div><span class="xl">Bio</span>${esc(p.bio)}</div>
      <div style="display:flex;gap:26px">
        <span><span class="xl">Initials</span>${esc(p.initials)}</span>
        <span><span class="xl">Sort</span>${p.sort}</span>
      </div>
    </div></td></tr>`).join('');
  wireExpand('#staff-rows');

  $$('#staff-rows [data-staff-del]').forEach(b => b.addEventListener('click', async () => {
    if (await deleteWithForce(`/api/admin/staff/${b.dataset.staffDel}`,
      `Delete ${b.dataset.name} from staff? This cannot be undone.`)) {
      loadStaff();
    }
  }));

  $$('#staff-rows [data-staff-edit]').forEach(b => b.addEventListener('click', () => {
    const p = staffCache.find(x => x.id === +b.dataset.staffEdit);
    const f = $('#staff-form').elements;
    for (const k of ['name', 'role', 'certs', 'initials', 'teaches', 'bio', 'sort']) f[k].value = p[k] ?? '';
    f.id.value = p.id;
    f.active.value = String(p.active);
    $('#staff-form-title').textContent = `Editing: ${p.name}`;
    $('#staff-submit').textContent = 'Save Changes';
    $('#staff-cancel').style.display = '';
    openFormModal('staff-form-card');
  }));

  $$('#staff-rows [data-staff-toggle]').forEach(b => b.addEventListener('click', async () => {
    const p = staffCache.find(x => x.id === +b.dataset.staffToggle);
    b.disabled = true;
    await authed(`/api/admin/staff/${p.id}`, { method: 'PATCH', body: { active: !p.active } });
    loadStaff();
  }));

  $$('#staff-rows [data-staff-hist]').forEach(b => b.addEventListener('click', () =>
    openStaffHistory(+b.dataset.staffHist, b.dataset.name)));
}

function resetStaffForm() {
  const f = $('#staff-form');
  f.reset(); f.elements.id.value = ''; f.elements.sort.value = '99';
  $('#staff-form-title').textContent = 'Add a staff member';
  $('#staff-submit').textContent = 'Add Staff Member';
  $('#staff-cancel').style.display = 'none';
}
$('#staff-cancel').addEventListener('click', () => { resetStaffForm(); closeAdmModal(); });

$('#staff-form').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#staff-msg');
  const f = e.target.elements;
  const body = {
    name: f.name.value, role: f.role.value, certs: f.certs.value,
    initials: f.initials.value.toUpperCase(), teaches: f.teaches.value,
    bio: f.bio.value, sort: +f.sort.value || 0, active: f.active.value === 'true',
  };
  try {
    if (f.id.value) {
      await authed(`/api/admin/staff/${f.id.value}`, { method: 'PATCH', body });
    } else {
      if (!body.initials) delete body.initials;
      await authed('/api/admin/staff', { method: 'POST', body });
    }
    msg.style.color = 'var(--ok)'; msg.textContent = 'Saved ✓';
    resetStaffForm();
    closeAdmModal();
    loadStaff();
    setTimeout(() => msg.textContent = '', 3000);
  } catch (err) {
    msg.style.color = 'var(--red)'; msg.textContent = err.message;
  }
});

// ---------- add/edit modal (form cards get moved in here) ----------
const admBack = $('#adm-modal-back');
let admCard = null, admHome = null;

function openFormModal(cardId) {
  closeAdmModal();
  admCard = $('#' + cardId);
  admHome = admCard.parentElement;
  $('#adm-modal-body').append(admCard);
  admBack.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeAdmModal() {
  if (admCard && admHome) admHome.append(admCard);
  admCard = admHome = null;
  admBack.classList.remove('open');
  document.body.style.overflow = '';
}
// data-entry modal: closes ONLY via its buttons (✕ / Cancel / save) — clicking
// the backdrop or pressing Escape must never wipe in-progress form data
$('#adm-modal-close').addEventListener('click', closeAdmModal);

// "+" buttons: reset the tab's form and open it in the modal
const ADD_FORMS = {
  session: ['session-form-card', () => resetSessionForm()],
  course: ['course-form-card', () => resetCourseForm()],
  staff: ['staff-form-card', () => resetStaffForm()],
  site: ['site-form-card', () => resetSiteForm()],
  trip: ['trip-form-card', () => resetTripForm()],
};
$$('[data-addform]').forEach(b => b.addEventListener('click', () => {
  const [cardId, reset] = ADD_FORMS[b.dataset.addform];
  reset();
  openFormModal(cardId);
}));

// delete with force fallback: on a guarded 409 the user may force,
// which requires re-entering their own password
async function deleteWithForce(url, confirmMsg) {
  if (!confirm(confirmMsg)) return false;
  try {
    await authed(url, { method: 'DELETE' });
    return true;
  } catch (err) {
    if (err.status !== 409 || err.data?.code !== 'force_available') {
      alert(err.message);
      return false;
    }
    if (!confirm(`${err.message}\n\n⚠ FORCE DELETE?\n${err.data.force_hint || ''}\nThis cannot be undone.`)) return false;
    const password = prompt('To confirm the force delete, enter YOUR portal password:');
    if (!password) return false;
    try {
      await authed(url, { method: 'DELETE', body: { force: true, password } });
      return true;
    } catch (err2) {
      alert(err2.message);
      return false;
    }
  }
}

// expandable list rows: a .mrow toggles its sibling .xrow detail panel
function wireExpand(tbodySel) {
  $$(`${tbodySel} tr.mrow`).forEach(tr => tr.addEventListener('click', e => {
    if (e.target.closest('button, a, select, input, label, textarea')) return;
    const xr = $(`${tbodySel} tr.xrow[data-xrow="${tr.dataset.x}"]`);
    if (!xr) return;
    const opening = xr.hidden;
    xr.hidden = !opening;
    tr.classList.toggle('open', opening);
    tr.querySelector('.chev').textContent = opening ? '▾' : '▸';
  }));
}

// ---------- inbox / notifications ----------
let inboxFilter = 'unacked';
const NOTIF_ICON = { registration: '📝', waitlist: '⏳', assignment: '🧑‍🏫', system: '⚙️' };

function ago(ts) {
  const s = Math.max(0, (Date.now() - new Date(ts)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function updateBadges(count) {
  for (const id of ['bell-badge', 'inbox-count']) {
    const el = $(`#${id}`);
    el.style.display = count ? '' : 'none';
    el.textContent = count;
  }
}

async function loadInbox() {
  const res = await authed(`/api/admin/notifications${inboxFilter === 'unacked' ? '?unacked=1' : ''}`);
  updateBadges(res.unacked);
  $('#notif-list').innerHTML = res.notifications.length ? res.notifications.map(n => `
    <div class="notif ${n.acked_at ? 'acked' : ''}">
      <div class="icon">${NOTIF_ICON[n.type] || '📣'}</div>
      <div>
        <h4>${esc(n.title)}</h4>
        ${n.body ? `<div class="body">${esc(n.body)}</div>` : ''}
        <div class="when">${ago(n.created_at)}${n.acked_at ? ` · acknowledged by ${esc(n.acked_by_name) || 'staff'} ${ago(n.acked_at)}` : ''}</div>
      </div>
      <div class="n-act">
        ${n.acked_at ? '' : `<button class="btn btn-sm btn-red" data-ack="${n.id}">Acknowledge</button>`}
        ${n.tab ? `<button class="btn btn-sm btn-ghost" data-goto="${n.tab}">View</button>` : ''}
      </div>
    </div>`).join('')
    : `<p style="color:var(--ink-soft);padding:30px;text-align:center">
        ${inboxFilter === 'unacked' ? 'All caught up — nothing needs attention. 🤿' : 'No notifications yet.'}</p>`;

  $$('#notif-list [data-ack]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    await authed(`/api/admin/notifications/${b.dataset.ack}/ack`, { method: 'POST' });
    loadInbox();
  }));
  $$('#notif-list [data-goto]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.goto)));
}

$('#inbox-filters').addEventListener('click', e => {
  const b = e.target.closest('[data-nf]');
  if (!b) return;
  inboxFilter = b.dataset.nf;
  $$('#inbox-filters .btn').forEach(x => x.className = 'btn btn-sm btn-ghost');
  b.className = 'btn btn-sm btn-red';
  loadInbox();
});

$('#ack-all').addEventListener('click', async () => {
  await authed('/api/admin/notifications/ack-all', { method: 'POST' });
  loadInbox();
});

let pollTimer = null;
function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!token) return clearInterval(pollTimer);
    try {
      const res = await authed('/api/admin/notifications?unacked=1');
      updateBadges(res.unacked);
      if ($('#tab-inbox').style.display !== 'none') loadInbox();
    } catch {}
  }, 30000);
}

// ---------- accounts ----------
let me = null;

const ACCT_ROLE_LABEL = { superadmin: 'Super Admin', admin: 'Admin', staff: 'Staff', instructor: 'Instructor' };

async function loadAccounts() {
  const [accounts, staff] = await Promise.all([
    authed('/api/admin/accounts'), authed('/api/admin/staff')]);
  $('#acct-staff').innerHTML = '<option value="">— None —</option>' +
    staff.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');

  $('#account-rows').innerHTML = accounts.map(a => `
    <tr>
      <td><strong>${esc(a.name)}</strong>${me && a.id === me.id ? ' <span class="chip red" style="font-size:10px">You</span>' : ''}</td>
      <td><a href="mailto:${esc(a.email)}">${esc(a.email)}</a></td>
      <td><span class="status-pill ${['superadmin', 'admin'].includes(a.role) ? 'confirmed' : a.role === 'staff' ? 'pending' : 'waitlist'}">${ACCT_ROLE_LABEL[a.role]}</span>
        ${a.staff_name ? `<br><span style="font-size:12px;color:var(--ink-soft)">→ ${esc(a.staff_name)}</span>` : ''}</td>
      <td>${a.last_login ? ago(a.last_login) : 'Never'}</td>
      <td><div class="row-actions">
        <button class="btn btn-sm btn-ghost" data-acct-pw="${a.id}">Reset Password</button>
        ${me && a.id === me.id ? '' : `<button class="btn btn-sm btn-ghost" data-acct-role="${a.id}" data-role="${a.role}">Change Role</button>
        <button class="btn btn-sm btn-ghost" data-acct-del="${a.id}" data-name="${esc(a.name)}">Delete</button>`}
      </div></td>
    </tr>`).join('');

  $$('#account-rows [data-acct-role]').forEach(b => b.addEventListener('click', async () => {
    const next = prompt(`Role for this account — superadmin, admin, staff, or instructor?`, b.dataset.role);
    if (!next || !['superadmin', 'admin', 'staff', 'instructor'].includes(next)) return;
    try {
      await authed(`/api/admin/accounts/${b.dataset.acctRole}`, { method: 'PATCH', body: { role: next } });
      loadAccounts();
    } catch (err) { alert(err.message); }
  }));

  $$('#account-rows [data-acct-pw]').forEach(b => b.addEventListener('click', async () => {
    const pw = prompt('New password (min 8 characters):');
    if (!pw) return;
    try {
      await authed(`/api/admin/accounts/${b.dataset.acctPw}`, { method: 'PATCH', body: { password: pw } });
      alert('Password reset. That account has been signed out everywhere.');
    } catch (err) { alert(err.message); }
  }));
  $$('#account-rows [data-acct-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm(`Delete the admin account for ${b.dataset.name}? This cannot be undone.`)) return;
    try {
      await authed(`/api/admin/accounts/${b.dataset.acctDel}`, { method: 'DELETE' });
      loadAccounts();
    } catch (err) { alert(err.message); }
  }));
}

$('#account-form').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#account-msg');
  try {
    await authed('/api/admin/accounts', {
      method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
    msg.style.color = 'var(--ok)'; msg.textContent = 'Account created ✓';
    e.target.reset();
    loadAccounts();
    setTimeout(() => msg.textContent = '', 3000);
  } catch (err) {
    msg.style.color = 'var(--red)'; msg.textContent = err.message;
  }
});

// ---------- my profile ----------
async function loadProfile() {
  me = await authed('/api/admin/me');
  const f = $('#profile-form').elements;
  f.name.value = me.name;
  f.email.value = me.email;
}

$('#profile-form').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#profile-msg');
  const f = e.target.elements;
  try {
    me = await authed('/api/admin/me', {
      method: 'PATCH', body: { name: f.name.value, email: f.email.value } });
    sessionStorage.setItem('texrec_name', me.name);
    $('#admin-name').textContent = me.name;
    msg.style.color = 'var(--ok)'; msg.textContent = 'Saved ✓';
    setTimeout(() => msg.textContent = '', 3000);
  } catch (err) {
    msg.style.color = 'var(--red)'; msg.textContent = err.message;
  }
});

$('#password-form').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#password-msg');
  const f = e.target.elements;
  if (f.new_password.value !== f.confirm_password.value) {
    msg.style.color = 'var(--red)'; msg.textContent = 'New passwords do not match.';
    return;
  }
  try {
    await authed('/api/admin/me/password', {
      method: 'POST',
      body: { current_password: f.current_password.value, new_password: f.new_password.value } });
    msg.style.color = 'var(--ok)'; msg.textContent = 'Password updated ✓';
    e.target.reset();
    setTimeout(() => msg.textContent = '', 4000);
  } catch (err) {
    msg.style.color = 'var(--red)'; msg.textContent = err.message;
  }
});

// ---------- photos ----------
let photoCache = [];

// when a file is picked, try to read GPS + date from its EXIF right in the browser
$('#photo-form input[name=photo]').addEventListener('change', async e => {
  const file = e.target.files[0];
  const status = $('#gps-status');
  const f = $('#photo-form').elements;
  status.className = 'form-msg';
  if (!file) return;
  try {
    const gps = await exifr.gps(file);
    if (gps && isFinite(gps.latitude)) {
      f.gps.value = `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}`;
      status.className = 'form-msg ok';
      status.textContent = `GPS found in EXIF: ${gps.latitude.toFixed(4)}, ${gps.longitude.toFixed(4)} ✓`;
    } else {
      f.gps.value = '';
      status.className = 'form-msg err';
      status.textContent = 'No GPS data in this photo’s EXIF — please enter the coordinates below (lat, lng).';
    }
    const meta = await exifr.parse(file, ['DateTimeOriginal']).catch(() => null);
    if (meta?.DateTimeOriginal && !f.taken_at.value) {
      f.taken_at.value = new Date(meta.DateTimeOriginal).toISOString().slice(0, 10);
    }
  } catch {
    status.className = 'form-msg err';
    status.textContent = 'Could not read EXIF from this file — enter coordinates manually if known.';
  }
});

async function loadPhotos() {
  photoCache = await authed('/api/admin/photos');
  $('#photo-rows').innerHTML = photoCache.length ? photoCache.map(p => `
    <tr>
      <td><img class="thumb" src="/uploads/${encodeURIComponent(p.filename)}" alt=""></td>
      <td><strong>${esc(p.title)}</strong>
        ${p.description ? `<br><span style="font-size:13px;color:var(--ink-soft)">${esc(p.description.slice(0, 80))}${p.description.length > 80 ? '…' : ''}</span>` : ''}</td>
      <td style="font-size:14px">${esc(p.location_name) || '—'}</td>
      <td style="font-size:13px">${hasCoords(p.lat, p.lng) ? `${(+p.lat).toFixed(4)}, ${(+p.lng).toFixed(4)}` : '—'}</td>
      <td><span class="status-pill ${p.active ? 'confirmed' : 'cancelled'}">${p.active ? 'visible' : 'hidden'}</span></td>
      <td><div class="row-actions">
        <button class="btn btn-sm btn-ghost" data-photo-edit="${p.id}">Edit</button>
        <button class="btn btn-sm btn-ghost" data-photo-toggle="${p.id}">${p.active ? 'Hide' : 'Show'}</button>
        <button class="btn btn-sm btn-ghost" data-photo-del="${p.id}" data-title="${esc(p.title)}">Delete</button>
      </div></td>
    </tr>`).join('')
    : '<tr><td colspan="6" style="text-align:center;color:var(--ink-soft);padding:30px">No photos yet — upload the first one above.</td></tr>';

  $$('#photo-rows [data-photo-edit]').forEach(b => b.addEventListener('click', () => {
    const p = photoCache.find(x => x.id === +b.dataset.photoEdit);
    const f = $('#photo-form').elements;
    f.id.value = p.id;
    f.title.value = p.title;
    f.location_name.value = p.location_name || '';
    f.description.value = p.description || '';
    f.gps.value = hasCoords(p.lat, p.lng) ? `${p.lat}, ${p.lng}` : '';
    f.taken_at.value = p.taken_at ? p.taken_at.slice(0, 10) : '';
    f.active.value = String(p.active);
    f.photo.required = false;
    $('#photo-file-field').style.display = 'none';
    $('#photo-form-title').textContent = `Editing: ${p.title}`;
    $('#photo-submit').textContent = 'Save Changes';
    $('#photo-cancel').style.display = '';
    $('#photo-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  $$('#photo-rows [data-photo-toggle]').forEach(b => b.addEventListener('click', async () => {
    const p = photoCache.find(x => x.id === +b.dataset.photoToggle);
    b.disabled = true;
    await authed(`/api/admin/photos/${p.id}`, { method: 'PATCH', body: { active: !p.active } });
    loadPhotos();
  }));
  $$('#photo-rows [data-photo-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm(`Delete "${b.dataset.title}"? The image file will be removed too.`)) return;
    await authed(`/api/admin/photos/${b.dataset.photoDel}`, { method: 'DELETE' });
    loadPhotos();
  }));
}

function resetPhotoForm() {
  const f = $('#photo-form');
  f.reset(); f.elements.id.value = '';
  f.elements.photo.required = true;
  $('#photo-file-field').style.display = '';
  $('#gps-status').className = 'form-msg';
  $('#photo-form-title').textContent = 'Upload a photo';
  $('#photo-submit').textContent = 'Upload Photo';
  $('#photo-cancel').style.display = 'none';
}
$('#photo-cancel').addEventListener('click', resetPhotoForm);

$('#photo-form').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#photo-msg');
  const f = e.target.elements;
  const btn = $('#photo-submit');
  const gps = parseLatLng(f.gps.value);
  if (f.gps.value.trim() && !gps) {
    msg.style.color = 'var(--red)';
    msg.textContent = 'Couldn\'t parse the GPS field — use "lat, lng" like 32.7357, -96.2153.';
    return;
  }
  btn.disabled = true;
  try {
    if (f.id.value) { // metadata edit
      await authed(`/api/admin/photos/${f.id.value}`, { method: 'PATCH', body: {
        title: f.title.value, description: f.description.value,
        location_name: f.location_name.value,
        lat: gps ? gps.lat : '', lng: gps ? gps.lng : '', taken_at: f.taken_at.value,
        active: f.active.value === 'true',
      }});
    } else { // new upload — multipart, so bypass the JSON api() helper
      const fd = new FormData(e.target);
      fd.delete('gps');
      if (gps) { fd.set('lat', gps.lat); fd.set('lng', gps.lng); }
      const res = await fetch('/api/admin/photos', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'gps_required') {
          $('#gps-status').className = 'form-msg err';
          $('#gps-status').textContent = data.error;
          $('#photo-form').elements.gps.focus();
        }
        throw new Error(data.error || 'Upload failed');
      }
      msg.style.color = 'var(--ok)';
      msg.textContent = data.gps_source === 'exif' ? 'Uploaded — GPS read from EXIF ✓' : 'Uploaded ✓';
    }
    if (f.id.value) { msg.style.color = 'var(--ok)'; msg.textContent = 'Saved ✓'; }
    resetPhotoForm();
    loadPhotos();
    setTimeout(() => msg.textContent = '', 4000);
  } catch (err) {
    msg.style.color = 'var(--red)'; msg.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

// ---------- dive sites ----------
let siteCache = [];

async function loadSites() {
  siteCache = await authed('/api/admin/sites');
  $('#site-rows').innerHTML = siteCache.map(s => `
    <tr class="mrow" data-x="${s.id}">
      <td class="chev">▸</td>
      <td><strong>${esc(s.name)}</strong></td>
      <td style="font-size:14px">${esc(s.location)}</td>
      <td><span class="status-pill ${s.active ? 'confirmed' : 'cancelled'}">${s.active ? 'visible' : 'hidden'}</span></td>
      <td><div class="row-actions">
        <button class="btn btn-sm btn-ghost" data-site-edit="${s.id}">Edit</button>
        <button class="btn btn-sm ${s.active ? 'btn-ghost' : 'btn-red'}" data-site-toggle="${s.id}">${s.active ? 'Hide' : 'Show'}</button>
        <button class="btn btn-sm btn-ghost" data-site-del="${s.id}" data-name="${esc(s.name)}">Delete</button>
      </div></td>
    </tr>
    <tr class="xrow" data-xrow="${s.id}" hidden><td colspan="5"><div class="xpand">
      <div><span class="xl">Blurb</span>${esc(s.blurb)}</div>
      <div><span class="xl">Services On Site</span>${s.services?.length
        ? `<div class="meta" style="margin:4px 0 0">${s.services.map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div>` : '—'}</div>
      <div style="display:flex;gap:26px;flex-wrap:wrap">
        <span><span class="xl">Difficulty</span>${s.difficulty ? `<span class="diff-badge ${s.difficulty}">${s.difficulty}</span>` : '—'}</span>
        <span><span class="xl">Website</span>${s.website ? `<a href="${esc(s.website)}" target="_blank" rel="noopener">${esc(s.website)} ↗</a>` : '—'}</span>
        <span><span class="xl">Coordinates</span>${hasCoords(s.lat, s.lng) ? `${(+s.lat).toFixed(4)}, ${(+s.lng).toFixed(4)}` : '—'}</span>
        <span><span class="xl">Sort</span>${s.sort}</span>
      </div>
    </div></td></tr>`).join('');
  wireExpand('#site-rows');

  $$('#site-rows [data-site-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm(`Delete the site "${b.dataset.name}"? This cannot be undone.`)) return;
    try {
      await authed(`/api/admin/sites/${b.dataset.siteDel}`, { method: 'DELETE' });
      loadSites();
    } catch (err) { alert(err.message); }
  }));

  $$('#site-rows [data-site-edit]').forEach(b => b.addEventListener('click', () => {
    const s = siteCache.find(x => x.id === +b.dataset.siteEdit);
    const f = $('#site-form').elements;
    for (const k of ['name', 'location', 'blurb', 'website', 'sort']) f[k].value = s[k] ?? '';
    f.services.value = (s.services || []).join(', ');
    f.difficulty.value = s.difficulty || '';
    f.gps.value = hasCoords(s.lat, s.lng) ? `${s.lat}, ${s.lng}` : '';
    f.id.value = s.id;
    f.active.value = String(s.active);
    $('#site-form-title').textContent = `Editing: ${s.name}`;
    $('#site-submit').textContent = 'Save Changes';
    $('#site-cancel').style.display = '';
    openFormModal('site-form-card');
  }));
  $$('#site-rows [data-site-toggle]').forEach(b => b.addEventListener('click', async () => {
    const s = siteCache.find(x => x.id === +b.dataset.siteToggle);
    b.disabled = true;
    await authed(`/api/admin/sites/${s.id}`, { method: 'PATCH', body: { active: !s.active } });
    loadSites();
  }));
}

function resetSiteForm() {
  const f = $('#site-form');
  f.reset(); f.elements.id.value = ''; f.elements.sort.value = '99';
  $('#site-form-title').textContent = 'Add a training site';
  $('#site-submit').textContent = 'Add Site';
  $('#site-cancel').style.display = 'none';
  $('#site-json-toggle').checked = false;
  $('#site-form').style.display = '';
  $('#site-json-box').hidden = true;
  $('#site-json-msg').textContent = '';
}

// bulk import mode: swap the form for a JSON textarea
$('#site-json-toggle').addEventListener('change', e => {
  $('#site-form').style.display = e.target.checked ? 'none' : '';
  $('#site-json-box').hidden = !e.target.checked;
});

// "Insert Sample" puts real, editable/copyable JSON into the box
// (the placeholder can't be selected or copied)
const SITE_JSON_SAMPLE = [
  {
    name: 'Clear Springs Scuba Park',
    location: 'Terrell, TX',
    blurb: 'Spring-fed quarry with training platforms and 20+ ft vis.',
    website: 'https://www.csscuba.com',
    services: ['Air Fills', 'Gear Rental', 'Camping'],
    difficulty: 'beginner',
    gps: '32.7357, -96.2153',
    sort: 99,
    active: true,
  },
  {
    name: 'Second Site Example',
    location: 'Athens, TX',
    blurb: 'Add as many entries to this array as you need.',
    website: '',
    services: ['Air Fills'],
    difficulty: 'advanced',
    gps: '32.2124, -95.8330',
    sort: 99,
    active: true,
  },
];

function insertSample(textareaSel, sample, msgSel) {
  const ta = $(textareaSel);
  if (ta.value.trim() && !confirm('Replace the current contents of the box with the sample?')) return;
  ta.value = JSON.stringify(sample, null, 2);
  ta.focus();
  const msg = $(msgSel);
  msg.style.color = 'var(--ok)';
  msg.textContent = 'Sample inserted — edit away ✓';
  setTimeout(() => msg.textContent = '', 3000);
}

$('#site-json-sample').addEventListener('click', () =>
  insertSample('#site-json', SITE_JSON_SAMPLE, '#site-json-msg'));

$('#site-json-import').addEventListener('click', async () => {
  const msg = $('#site-json-msg');
  let entries;
  try {
    const parsed = JSON.parse($('#site-json').value);
    entries = Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    msg.style.color = 'var(--red)'; msg.textContent = `Invalid JSON: ${err.message}`;
    return;
  }
  if (!entries.length) { msg.style.color = 'var(--red)'; msg.textContent = 'Nothing to import.'; return; }
  // pre-parse gps client-side so bad coordinates fail with a clear message
  const prepared = [], gpsFailures = [];
  for (const [i, entry] of entries.entries()) {
    const gps = entry.gps ? parseLatLng(String(entry.gps)) : null;
    if (entry.gps && !gps) {
      gpsFailures.push(`#${i + 1} (${entry.name || 'unnamed'}): bad gps "${entry.gps}"`);
      continue;
    }
    prepared.push({
      name: entry.name, location: entry.location, blurb: entry.blurb,
      website: entry.website || '', services: entry.services || '',
      lat: gps ? gps.lat : (entry.lat ?? ''), lng: gps ? gps.lng : (entry.lng ?? ''),
      sort: entry.sort ?? 99, active: entry.active ?? true,
    });
  }
  msg.style.color = 'var(--ink-soft)'; msg.textContent = `Importing ${prepared.length}…`;
  try {
    const res = prepared.length
      ? await authed('/api/admin/sites/bulk', { method: 'POST', body: { entries: prepared } })
      : { ok: 0, failures: [] };
    const failures = [...gpsFailures, ...res.failures.map(f => `#${f.index} (${f.name}): ${f.error}`)];
    msg.style.color = failures.length ? 'var(--warn)' : 'var(--ok)';
    msg.textContent = `${res.ok} imported${failures.length ? ` · ${failures.length} failed — ${failures.join('; ')}` : ' ✓'}`;
    if (res.ok) { $('#site-json').value = ''; loadSites(); }
  } catch (err) {
    msg.style.color = 'var(--red)'; msg.textContent = err.message;
  }
});
$('#site-cancel').addEventListener('click', () => { resetSiteForm(); closeAdmModal(); });

$('#site-form').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#site-msg');
  const f = e.target.elements;
  const gps = parseLatLng(f.gps.value);
  if (f.gps.value.trim() && !gps) {
    msg.style.color = 'var(--red)';
    msg.textContent = 'Couldn\'t parse the GPS field — use "lat, lng" like 32.7357, -96.2153.';
    return;
  }
  const body = {
    name: f.name.value, location: f.location.value, blurb: f.blurb.value,
    website: f.website.value, services: f.services.value, difficulty: f.difficulty.value,
    lat: gps ? gps.lat : '', lng: gps ? gps.lng : '',
    sort: +f.sort.value || 0, active: f.active.value === 'true',
  };
  try {
    if (f.id.value) await authed(`/api/admin/sites/${f.id.value}`, { method: 'PATCH', body });
    else await authed('/api/admin/sites', { method: 'POST', body });
    msg.style.color = 'var(--ok)'; msg.textContent = 'Saved ✓';
    resetSiteForm();
    closeAdmModal();
    loadSites();
    setTimeout(() => msg.textContent = '', 3000);
  } catch (err) {
    msg.style.color = 'var(--red)'; msg.textContent = err.message;
  }
});

// ---------- course catalog ----------
let courseCache = [];

async function loadCourses() {
  courseCache = await authed('/api/admin/courses');
  $('#c-prereq').innerHTML = '<option value="">— Start of progression —</option>' +
    courseCache.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');

  $('#course-rows').innerHTML = courseCache.map(c => `
    <tr class="mrow" data-x="${c.id}">
      <td class="chev">▸</td>
      <td><strong>${esc(c.name)}</strong></td>
      <td>${esc(c.level)}</td>
      <td>${priceLabel(c.price_cents, c.call_for_price)}</td>
      <td><span class="status-pill ${c.active ? 'confirmed' : 'cancelled'}">${c.active ? 'visible' : 'hidden'}</span></td>
      <td><div class="row-actions">
        <button class="btn btn-sm btn-ghost" data-course-edit="${c.id}">Edit</button>
        <button class="btn btn-sm ${c.active ? 'btn-ghost' : 'btn-red'}" data-course-toggle="${c.id}">${c.active ? 'Hide' : 'Show'}</button>
        <button class="btn btn-sm btn-ghost" data-course-del="${c.id}" data-name="${esc(c.name)}">Delete</button>
      </div></td>
    </tr>
    <tr class="xrow" data-xrow="${c.id}" hidden><td colspan="6"><div class="xpand">
      <div><span class="xl">Blurb</span>${esc(c.blurb)}</div>
      <div><span class="xl">Description</span>${esc(c.description)}</div>
      <div><span class="xl">Prerequisites</span>${esc(c.prerequisites) || 'None'}</div>
      <div style="display:flex;gap:26px;flex-wrap:wrap">
        <span><span class="xl">Agency</span>${esc(c.agency)}</span>
        <span><span class="xl">Duration</span>${esc(c.duration) || '—'}</span>
        <span><span class="xl">Comes After</span>${esc(c.prereq_course_name) || 'Start of progression'}</span>
        <span><span class="xl">Sort</span>${c.sort}</span>
        <span><span class="xl">Slug</span>${esc(c.slug)}</span>
      </div>
    </div></td></tr>`).join('');
  wireExpand('#course-rows');

  $$('#course-rows [data-course-del]').forEach(b => b.addEventListener('click', async () => {
    if (await deleteWithForce(`/api/admin/courses/${b.dataset.courseDel}`,
      `Delete the course "${b.dataset.name}"? This cannot be undone.`)) {
      loadCourses();
    }
  }));

  $$('#course-rows [data-course-edit]').forEach(b => b.addEventListener('click', () => {
    const c = courseCache.find(x => x.id === +b.dataset.courseEdit);
    const f = $('#course-form').elements;
    for (const k of ['name', 'level', 'agency', 'blurb', 'description', 'prerequisites', 'duration', 'sort']) f[k].value = c[k] ?? '';
    f.id.value = c.id;
    f.price.value = Math.round(c.price_cents / 100);
    f.call_for_price.checked = !!c.call_for_price;
    f.prereq_course_id.value = c.prereq_course_id ?? '';
    f.active.value = String(c.active);
    setRequirements(c.requirements);
    $('#course-form-title').textContent = `Editing: ${c.name}`;
    $('#course-submit').textContent = 'Save Changes';
    $('#course-cancel').style.display = '';
    openFormModal('course-form-card');
  }));
  $$('#course-rows [data-course-toggle]').forEach(b => b.addEventListener('click', async () => {
    const c = courseCache.find(x => x.id === +b.dataset.courseToggle);
    b.disabled = true;
    await authed(`/api/admin/courses/${c.id}`, { method: 'PATCH', body: { active: !c.active } });
    loadCourses();
  }));
}

// ---------- course session-requirements editor ----------
function reqRowHTML(type = 'pool', count = 1) {
  const opts = SESSION_TYPES.map(t => `<option value="${t.key}" ${t.key === type ? 'selected' : ''}>${t.label}</option>`).join('');
  return `<div class="req-row" style="display:flex;gap:8px;align-items:center">
    <select class="req-type" style="flex:1;font-family:var(--font-body);font-size:14px;padding:8px 10px;border:1.5px solid var(--line);border-radius:6px;background:#fff">${opts}</select>
    <input class="req-count" type="number" min="1" value="${count}" title="How many required"
      style="width:80px;font-family:var(--font-body);font-size:14px;padding:8px 10px;border:1.5px solid var(--line);border-radius:6px">
    <button type="button" class="btn btn-sm btn-ghost req-del" title="Remove">✕</button>
  </div>`;
}
function addReqRow(type, count) {
  $('#req-rows').insertAdjacentHTML('beforeend', reqRowHTML(type, count));
  const row = $('#req-rows').lastElementChild;
  row.querySelector('.req-del').addEventListener('click', () => row.remove());
}
function setRequirements(reqs) {
  $('#req-rows').innerHTML = '';
  (reqs || []).forEach(r => addReqRow(r.type, r.count));
}
function gatherRequirements() {
  return $$('#req-rows .req-row').map(row => ({
    type: row.querySelector('.req-type').value,
    count: parseInt(row.querySelector('.req-count').value, 10) || 1,
  }));
}
$('#req-add').addEventListener('click', () => addReqRow());

function resetCourseForm() {
  const f = $('#course-form');
  f.reset(); f.elements.id.value = ''; f.elements.sort.value = '99'; f.elements.agency.value = 'SDI';
  setRequirements([]);
  $('#course-form-title').textContent = 'Add a course';
  $('#course-submit').textContent = 'Add Course';
  $('#course-cancel').style.display = 'none';
  $('#course-json-toggle').checked = false;
  $('#course-form').style.display = '';
  $('#course-json-box').hidden = true;
  $('#course-json-msg').textContent = '';
}

$('#course-json-toggle').addEventListener('change', e => {
  $('#course-form').style.display = e.target.checked ? 'none' : '';
  $('#course-json-box').hidden = !e.target.checked;
});

const COURSE_JSON_SAMPLE = [
  {
    name: 'Open Water Diver',
    level: 'Beginner',
    agency: 'SDI · RAID',
    blurb: 'The certification that starts it all.',
    description: 'Full course description shown on the Courses page.',
    prerequisites: 'None. Ages 10+.',
    duration: '3 weekends',
    price: 449,
    comes_after: '',
    sort: 99,
    active: true,
  },
  {
    name: 'Advanced Adventure Diver',
    level: 'Continuing',
    agency: 'SDI',
    blurb: 'Five adventure dives to extend your depth to 100 ft.',
    description: 'Entries import in order — comes_after can name a course above it.',
    prerequisites: 'Open Water Diver.',
    duration: '1 weekend',
    price: 379,
    comes_after: 'Open Water Diver',
    sort: 99,
    active: true,
  },
];

$('#course-json-sample').addEventListener('click', () =>
  insertSample('#course-json', COURSE_JSON_SAMPLE, '#course-json-msg'));

$('#course-json-import').addEventListener('click', async () => {
  const msg = $('#course-json-msg');
  let entries;
  try {
    const parsed = JSON.parse($('#course-json').value);
    entries = Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    msg.style.color = 'var(--red)'; msg.textContent = `Invalid JSON: ${err.message}`;
    return;
  }
  if (!entries.length) { msg.style.color = 'var(--red)'; msg.textContent = 'Nothing to import.'; return; }
  msg.style.color = 'var(--ink-soft)'; msg.textContent = `Importing ${entries.length}…`;
  // the server resolves comes_after by name (incl. courses created earlier in the batch)
  try {
    const res = await authed('/api/admin/courses/bulk', { method: 'POST', body: { entries } });
    const failures = res.failures.map(f => `#${f.index} (${f.name}): ${f.error}`);
    msg.style.color = failures.length ? 'var(--warn)' : 'var(--ok)';
    msg.textContent = `${res.ok} imported${failures.length ? ` · ${failures.length} failed — ${failures.join('; ')}` : ' ✓'}`;
    if (res.ok) { $('#course-json').value = ''; loadCourses(); }
  } catch (err) {
    msg.style.color = 'var(--red)'; msg.textContent = err.message;
  }
});
$('#course-cancel').addEventListener('click', () => { resetCourseForm(); closeAdmModal(); });

$('#course-form').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#course-msg');
  const f = e.target.elements;
  const body = {
    name: f.name.value, level: f.level.value, agency: f.agency.value,
    blurb: f.blurb.value, description: f.description.value,
    prerequisites: f.prerequisites.value, duration: f.duration.value,
    price_cents: Math.round(+f.price.value * 100), call_for_price: f.call_for_price.checked,
    prereq_course_id: f.prereq_course_id.value ? +f.prereq_course_id.value : '',
    sort: +f.sort.value || 0, active: f.active.value === 'true',
    requirements: gatherRequirements(),
  };
  try {
    if (f.id.value) await authed(`/api/admin/courses/${f.id.value}`, { method: 'PATCH', body });
    else await authed('/api/admin/courses', { method: 'POST', body });
    msg.style.color = 'var(--ok)'; msg.textContent = 'Saved ✓';
    resetCourseForm();
    closeAdmModal();
    loadCourses();
    setTimeout(() => msg.textContent = '', 3000);
  } catch (err) {
    msg.style.color = 'var(--red)'; msg.textContent = err.message;
  }
});

// ---------- trips ----------
let tripCache = [];

async function loadTrips() {
  tripCache = await authed('/api/admin/trips');
  $('#trip-rows').innerHTML = tripCache.length ? tripCache.map(t => `
    <tr class="mrow" data-x="${t.id}">
      <td class="chev">▸</td>
      <td><strong>${esc(t.title)}</strong></td>
      <td>${fmtRange(t.start_date.slice(0,10), t.end_date.slice(0,10))}</td>
      <td>${money(t.price_cents)}</td>
      <td>${t.spots_taken}/${t.spots_total}</td>
      <td><span class="status-pill ${t.active ? 'confirmed' : 'cancelled'}">${t.active ? 'visible' : 'hidden'}</span></td>
      <td><div class="row-actions">
        <button class="btn btn-sm btn-ghost" data-trip-edit="${t.id}">Edit</button>
        <button class="btn btn-sm ${t.active ? 'btn-ghost' : 'btn-red'}" data-trip-toggle="${t.id}">${t.active ? 'Hide' : 'Show'}</button>
        <button class="btn btn-sm btn-ghost" data-trip-del="${t.id}" data-name="${esc(t.title)}">Delete</button>
      </div></td>
    </tr>
    <tr class="xrow" data-xrow="${t.id}" hidden><td colspan="7"><div class="xpand">
      <div><span class="xl">Destination</span>${esc(t.destination)}</div>
      <div><span class="xl">Description</span>${esc(t.description)}</div>
    </div></td></tr>`).join('')
    : '<tr><td colspan="7" style="text-align:center;color:var(--ink-soft);padding:30px">No trips yet — add the first one.</td></tr>';
  wireExpand('#trip-rows');

  $$('#trip-rows [data-trip-edit]').forEach(b => b.addEventListener('click', () => {
    const t = tripCache.find(x => x.id === +b.dataset.tripEdit);
    const f = $('#trip-form').elements;
    f.id.value = t.id;
    f.title.value = t.title;
    f.destination.value = t.destination;
    f.start_date.value = t.start_date.slice(0,10);
    f.end_date.value = t.end_date.slice(0,10);
    f.description.value = t.description;
    f.price.value = Math.round(t.price_cents / 100);
    f.call_for_price.checked = !!t.call_for_price;
    f.spots_total.value = t.spots_total;
    f.spots_taken.value = t.spots_taken;
    f.active.value = String(t.active);
    $('#trip-form-title').textContent = `Editing: ${t.title}`;
    $('#trip-submit').textContent = 'Save Changes';
    openFormModal('trip-form-card');
  }));
  $$('#trip-rows [data-trip-toggle]').forEach(b => b.addEventListener('click', async () => {
    const t = tripCache.find(x => x.id === +b.dataset.tripToggle);
    b.disabled = true;
    await authed(`/api/admin/trips/${t.id}`, { method: 'PATCH', body: { active: !t.active } });
    loadTrips();
  }));
  $$('#trip-rows [data-trip-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm(`Delete the trip "${b.dataset.name}"? This cannot be undone.`)) return;
    try {
      await authed(`/api/admin/trips/${b.dataset.tripDel}`, { method: 'DELETE' });
      loadTrips();
    } catch (err) { alert(err.message); }
  }));
}

function resetTripForm() {
  const f = $('#trip-form');
  f.reset(); f.elements.id.value = '';
  f.elements.spots_total.value = '12'; f.elements.spots_taken.value = '0';
  $('#trip-form-title').textContent = 'Add a trip';
  $('#trip-submit').textContent = 'Add Trip';
  $('#trip-msg').textContent = '';
}

$('#trip-form').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#trip-msg');
  const f = e.target.elements;
  const body = {
    title: f.title.value, destination: f.destination.value,
    start_date: f.start_date.value, end_date: f.end_date.value,
    description: f.description.value,
    price_cents: Math.round(+f.price.value * 100), call_for_price: f.call_for_price.checked,
    spots_total: +f.spots_total.value || 1, spots_taken: +f.spots_taken.value || 0,
    active: f.active.value === 'true',
  };
  try {
    if (f.id.value) await authed(`/api/admin/trips/${f.id.value}`, { method: 'PATCH', body });
    else await authed('/api/admin/trips', { method: 'POST', body });
    resetTripForm();
    closeAdmModal();
    loadTrips();
  } catch (err) {
    msg.style.color = 'var(--red)'; msg.textContent = err.message;
  }
});

// ---------- customers ----------
async function loadCustomers() {
  const q = $('#cust-search').value.trim();
  const customers = await authed(`/api/admin/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  $('#cust-rows').innerHTML = customers.length ? customers.map(c => `
    <tr>
      <td><div style="display:flex;align-items:center;gap:10px">${avatarHTML(c, 40)}
        <strong>${esc(c.first_name)} ${esc(c.last_name)}</strong></div></td>
      <td style="font-size:14px"><a href="mailto:${esc(c.email)}">${esc(c.email)}</a><br>${esc(c.phone) || ''}</td>
      <td>${c.registration_count}</td>
      <td>${c.cert_count}</td>
      <td>${medicalFlag(c, true)}</td>
      <td><span class="status-pill ${c.has_account ? 'confirmed' : 'cancelled'}">${c.has_account ? 'account' : 'no account'}</span></td>
      <td><button class="btn btn-sm btn-red" data-cust="${c.id}">Open Record</button></td>
    </tr>`).join('')
    : '<tr><td colspan="7" style="text-align:center;color:var(--ink-soft);padding:30px">No customers found.</td></tr>';
  $$('#cust-rows [data-cust]').forEach(b =>
    b.addEventListener('click', () => openCustomerDetail(+b.dataset.cust)));
}
$('#cust-search-btn').addEventListener('click', loadCustomers);
$('#cust-search').addEventListener('keydown', e => { if (e.key === 'Enter') loadCustomers(); });

let detailCustomerId = null;

const DOC_LABELS = { cert_card: 'Cert Card', medical: 'Medical', waiver: 'Waiver', other: 'Other' };

function avatarHTML(cust, size = 64) {
  const initials = `${cust.first_name[0] || ''}${cust.last_name[0] || ''}`.toUpperCase();
  return cust.has_avatar
    ? `<img src="/api/customers/${cust.id}/avatar?t=${encodeURIComponent(token)}&v=${Date.now()}"
        style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;box-shadow:var(--shadow)" alt="">`
    : `<div class="avatar" style="width:${size}px;height:${size}px;font-size:${size / 2.6}px;margin:0">${esc(initials)}</div>`;
}

let curDetail = null;   // last-loaded customer detail, for in-place checklist updates

async function openCustomerDetail(id) {
  detailCustomerId = id;
  let d;
  try { d = await authed(`/api/admin/customers/${id}`); }
  catch (err) { alert(err.message); return; }
  curDetail = d;
  $('#cust-detail').style.display = '';
  $('#cd-delete').style.display = me?.role === 'admin' ? '' : 'none';
  $('#cd-title').textContent = `${d.customer.first_name} ${d.customer.last_name}`;
  $('#cd-avatar').innerHTML = avatarHTML(d.customer);
  $('#cd-share').checked = !!d.customer.share_contact;
  $('#cd-contact').innerHTML = `${esc(d.customer.email)} · ${esc(d.customer.phone) || 'no phone'} ·
    ${d.customer.has_account ? 'has portal account' : 'no portal account'} ·
    customer since ${fmtDate(d.customer.created_at.slice(0,10), { month: 'long', year: 'numeric' })}`;

  $('#cd-docs').innerHTML = d.documents.length ? d.documents.map(doc => {
    const src = `/api/documents/${doc.id}/file?t=${encodeURIComponent(token)}`;
    return `
    <div class="media-card">
      ${doc.mime.startsWith('image/')
        ? `<img src="${src}" alt="" loading="lazy" onclick="window.open('${src}','_blank')">`
        : `<div class="doc-icon" onclick="window.open('${src}','_blank')">📄</div>`}
      <div class="mc-body">
        <strong>${esc(doc.title || doc.original_name)}</strong>
        <span>${DOC_LABELS[doc.category]} · ${doc.uploaded_by_customer ? 'customer upload' : esc(doc.uploaded_by_name) || 'staff'}</span>
        ${me?.role !== 'instructor' ? `<div style="margin-top:6px"><button class="btn btn-sm btn-ghost" data-doc-del="${doc.id}">Delete</button></div>` : ''}
      </div>
    </div>`;
  }).join('')
    : '<p style="color:var(--ink-soft)">No documents on file.</p>';
  $$('#cd-docs [data-doc-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete this document?')) return;
    await authed(`/api/admin/documents/${b.dataset.docDel}`, { method: 'DELETE' });
    openCustomerDetail(detailCustomerId);
  }));

  // medical & forms controls
  const cust = d.customer;
  $('#cd-med-flag').innerHTML = medicalFlag(cust);
  $('#med-onfile').checked = !!cust.medical_date;
  $('#med-date').value = cust.medical_date ? cust.medical_date.slice(0, 10) : '';
  $('#med-waiver-req').checked = !!cust.medical_waiver_required;
  $('#med-waiver-onfile').checked = !!cust.waiver_date;
  $('#med-waiver-date').value = cust.waiver_date ? cust.waiver_date.slice(0, 10) : '';

  $('#cd-sessions-panel').style.display = 'none';   // collapse the per-reg scheduler on (re)open
  renderRegsTable();

  $('#note-session').innerHTML = '<option value="">— None —</option>' +
    d.registrations.map(r =>
      `<option value="${r.session_id}">${esc(r.course_name)} (${fmtDate(r.start_date.slice(0,10), { month: 'short', day: 'numeric', year: 'numeric' })})</option>`).join('');

  renderCustomerNotes(d.notes);
  $('#cust-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderCustomerNotes(notes) {
  const canDelete = me?.role !== 'instructor';
  $('#cd-notes').innerHTML = notes.length ? notes.map(n => `
    <div class="notif">
      <div class="icon">${n.kind === 'certification' ? '📜' : '📝'}</div>
      <div>
        <h4>${n.kind === 'certification'
          ? `Certification: ${esc(n.cert_agency) || ''} ${esc(n.cert_number) || ''}`
          : `Note${n.course_name ? ` — ${esc(n.course_name)}` : ''}`}
          ${n.visible_to_customer ? '' : ' <span class="chip" style="font-size:10px">internal</span>'}</h4>
        <div class="body">${esc(n.body)}</div>
        <div class="when">${esc(n.author_name) || 'Staff'} · ${ago(n.created_at)}
          ${n.cert_date ? ` · cert date ${fmtDate(n.cert_date.slice(0,10), { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}</div>
      </div>
      <div class="n-act">${canDelete ? `<button class="btn btn-sm btn-ghost" data-ndel="${n.id}">Delete</button>` : ''}</div>
    </div>`).join('')
    : '<p style="color:var(--ink-soft)">No notes or certifications on file.</p>';

  $$('#cd-notes [data-ndel]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete this entry?')) return;
    await authed(`/api/admin/notes/${b.dataset.ndel}`, { method: 'DELETE' });
    openCustomerDetail(detailCustomerId);
  }));
}

$('#cd-close').addEventListener('click', () => $('#cust-detail').style.display = 'none');

const todayISO = () => {
  const d = new Date();   // local date, not UTC — avoids an evening off-by-one
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// render the customer's Class History & Verification table from curDetail
function renderRegsTable() {
  const d = curDetail; if (!d) return;
  const cust = d.customer;
  const canEdit = me?.role !== 'instructor';
  const mstat = medicalStatus(cust);
  const box = (r, field) =>
    `<input type="checkbox" data-chk="${field}" data-reg="${r.id}" ${r[field] ? 'checked' : ''}
      ${canEdit ? '' : 'disabled'} style="width:17px;height:17px;accent-color:var(--red);cursor:${canEdit ? 'pointer' : 'default'}">`;
  $('#cd-regs').innerHTML = d.registrations.length ? d.registrations.map(r => {
    const v = regValidation(r, cust);
    // courses with session requirements show computed progress; others keep the manual checkbox
    const cw = r.requirement_progress?.length
      ? r.requirement_progress.map(p => `<span class="form-flag ${p.done >= p.required ? 'green' : 'yellow'}"
          style="font-size:11px;padding:2px 7px">${SESSION_TYPE_SHORT[p.type] || p.type} ${p.done}/${p.required}</span>`).join(' ')
      : `<div style="text-align:center">${box(r, 'coursework_complete')}</div>`;
    const sessBtn = r.requirement_progress?.length && canEdit
      ? `<button class="btn btn-sm btn-ghost" data-regsess="${r.id}" data-course="${esc(r.course_name)}">Sessions</button>` : '';
    return `
    <tr data-regrow="${r.id}">
      <td>${esc(r.course_name)}</td>
      <td>${fmtRange(r.start_date.slice(0,10), r.end_date.slice(0,10))}</td>
      <td><span class="status-pill ${r.status}">${r.status}</span></td>
      <td style="text-align:center">${box(r, 'paid')}</td>
      <td>${cw}</td>
      <td style="text-align:center">${box(r, 'welcome_packet_sent')}</td>
      <td><span class="form-flag ${mstat.color}">${mstat.icon} ${mstat.badge}</span></td>
      <td data-valcell="${r.id}"><span class="form-flag ${v.color}">${v.label}</span></td>
      <td>${sessBtn}</td>
    </tr>`;
  }).join('')
    : '<tr><td colspan="9" style="text-align:center;color:var(--ink-soft);padding:16px">No registrations.</td></tr>';
  $$('#cd-regs [data-chk]').forEach(cb => cb.addEventListener('change', onChecklistToggle));
  $$('#cd-regs [data-regsess]').forEach(b =>
    b.addEventListener('click', () => openRegSessions(+b.dataset.regsess, b.dataset.course)));
}

// ---------- per-registration session scheduler (in the customer detail) ----------
let cdsRegId = null;
const ATT_LABELS = { scheduled: 'Scheduled', attended: 'Attended', completed: 'Completed', no_show: 'No-show', excused: 'Excused' };

async function openRegSessions(regId, courseName) {
  cdsRegId = regId;
  $('#cds-title').textContent = `Sessions — ${courseName}`;
  $('#cds-msg').textContent = '';
  $('#cd-sessions-panel').style.display = '';
  renderRegSessions(await authed(`/api/admin/registrations/${regId}/sessions`));
  $('#cd-sessions-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderRegSessions(data) {
  const prog = curDetail?.registrations.find(r => r.id === cdsRegId)?.requirement_progress || [];
  $('#cds-progress').innerHTML = prog.map(p =>
    `<span class="form-flag ${p.done >= p.required ? 'green' : 'yellow'}" style="margin-right:6px">${
      SESSION_TYPE_LABEL[p.type] || p.type}: ${p.done}/${p.required}</span>`).join('');
  $('#cds-scheduled').innerHTML = data.scheduled.length ? data.scheduled.map(s => `
    <tr>
      <td><span class="chip">${SESSION_TYPE_LABEL[s.type] || s.type}</span></td>
      <td>${esc(s.title) || '—'}</td>
      <td>${fmtDate(s.meeting_date.slice(0,10), { month:'short', day:'numeric', year:'numeric' })}${s.start_time ? ' · ' + fmtTime(s.start_time) : ''}</td>
      <td>${s.own_class ? '<span style="color:var(--ink-soft)">Own group</span>'
        : `<span class="form-flag yellow" style="font-size:11px;padding:2px 7px">Makeup · ${esc(s.class_title) || 'other'}</span>`}</td>
      <td><select data-att="${s.attendance_id}" style="font-family:var(--font-body);font-size:13px;padding:5px 7px;border:1.5px solid var(--line);border-radius:6px;background:#fff">
        ${Object.entries(ATT_LABELS).map(([k, l]) => `<option value="${k}" ${s.status === k ? 'selected' : ''}>${l}</option>`).join('')}
      </select></td>
      <td><button class="btn btn-sm btn-ghost" data-attdel="${s.attendance_id}">Remove</button></td>
    </tr>`).join('')
    : '<tr><td colspan="6" style="text-align:center;color:var(--ink-soft);padding:12px">No sessions scheduled yet.</td></tr>';
  $('#cds-candidate').innerHTML = data.candidates.length
    ? '<option value="">— choose a session to add —</option>' + data.candidates.map(c =>
        `<option value="${c.meeting_id}">${c.own_class ? '' : '[Makeup] '}${SESSION_TYPE_LABEL[c.type] || c.type} · ${
          esc(c.title) || 'session'} · ${fmtDate(c.meeting_date.slice(0,10), { month:'short', day:'numeric' })} · ${
          c.enrolled}/${c.capacity} full${c.own_class ? '' : ' · ' + esc(c.class_title)}</option>`).join('')
    : '<option value="">— no more sessions available —</option>';
  $$('#cds-scheduled [data-att]').forEach(sel => sel.addEventListener('change', async () => {
    try { await authed(`/api/admin/attendance/${sel.dataset.att}`, { method: 'PATCH', body: { status: sel.value } }); await afterSessionChange(); }
    catch (err) { alert(err.message); }
  }));
  $$('#cds-scheduled [data-attdel]').forEach(b => b.addEventListener('click', async () => {
    await authed(`/api/admin/attendance/${b.dataset.attdel}`, { method: 'DELETE' });
    await afterSessionChange();
  }));
}

// after any session change, refresh both the scheduler and the detail table (coursework/validation recompute server-side)
async function afterSessionChange() {
  const [sessions, detail] = await Promise.all([
    authed(`/api/admin/registrations/${cdsRegId}/sessions`),
    authed(`/api/admin/customers/${detailCustomerId}`),
  ]);
  curDetail = detail;
  renderRegsTable();
  renderRegSessions(sessions);
}

$('#cds-close').addEventListener('click', () => { $('#cd-sessions-panel').style.display = 'none'; });
$('#cds-autofill').addEventListener('click', async () => {
  const msg = $('#cds-msg');
  msg.style.color = 'var(--ink-soft)'; msg.textContent = 'Filling…';
  try {
    const res = await authed(`/api/admin/registrations/${cdsRegId}/autofill`, { method: 'POST' });
    msg.style.color = 'var(--ok)'; msg.textContent = `Added ${res.added} session${res.added === 1 ? '' : 's'}`;
    await afterSessionChange();
    setTimeout(() => { msg.textContent = ''; }, 2500);
  } catch (err) { msg.style.color = 'var(--red)'; msg.textContent = err.message; }
});
$('#cds-add').addEventListener('click', async () => {
  const mid = $('#cds-candidate').value, msg = $('#cds-msg');
  if (!mid) return;
  try {
    await authed(`/api/admin/registrations/${cdsRegId}/sessions`, { method: 'POST', body: { meeting_id: +mid } });
    msg.textContent = '';
    await afterSessionChange();
  } catch (err) { msg.style.color = 'var(--red)'; msg.textContent = err.message; }
});

// re-render every derived validation pill (and the medical column) in the detail table
function refreshValidationCells() {
  if (!curDetail) return;
  const s = medicalStatus(curDetail.customer);
  curDetail.registrations.forEach(r => {
    const v = regValidation(r, curDetail.customer);
    const vc = $(`[data-valcell="${r.id}"]`);
    if (vc) vc.innerHTML = `<span class="form-flag ${v.color}">${v.label}</span>`;
  });
  $$('#cd-regs [data-regrow]').forEach(row => {
    const mcell = row.children[6];
    if (mcell) mcell.innerHTML = `<span class="form-flag ${s.color}">${s.icon} ${s.badge}</span>`;
  });
}

// toggle one registration checklist box; validation pill updates live
async function onChecklistToggle(e) {
  const cb = e.target;
  const regId = +cb.dataset.reg, field = cb.dataset.chk;
  cb.disabled = true;
  try {
    await authed(`/api/admin/registrations/${regId}/checklist`, {
      method: 'PATCH', body: { [field]: cb.checked } });
    const r = curDetail?.registrations.find(x => x.id === regId);
    if (r) { r[field] = cb.checked; refreshValidationCells(); }
  } catch (err) {
    cb.checked = !cb.checked;   // revert on failure
    alert(err.message);
  } finally {
    cb.disabled = false;
  }
}

// auto-stamp today's date when a box is first ticked
$('#med-onfile').addEventListener('change', e => {
  if (e.target.checked && !$('#med-date').value) $('#med-date').value = todayISO();
});
$('#med-waiver-onfile').addEventListener('change', e => {
  if (e.target.checked && !$('#med-waiver-date').value) $('#med-waiver-date').value = todayISO();
});

$('#med-form').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#med-msg');
  const body = {
    medical_date: $('#med-onfile').checked ? ($('#med-date').value || todayISO()) : null,
    medical_waiver_required: $('#med-waiver-req').checked,
    waiver_date: $('#med-waiver-onfile').checked ? ($('#med-waiver-date').value || todayISO()) : null,
  };
  try {
    const updated = await authed(`/api/admin/customers/${detailCustomerId}/medical`, { method: 'PATCH', body });
    Object.assign(curDetail.customer, updated);
    $('#cd-med-flag').innerHTML = medicalFlag(curDetail.customer);
    refreshValidationCells();
    msg.style.color = 'var(--ok)'; msg.textContent = 'Saved ✓';
    setTimeout(() => { msg.textContent = ''; }, 2500);
  } catch (err) {
    msg.style.color = 'var(--red)'; msg.textContent = err.message;
  }
});

$('#cd-delete').addEventListener('click', async () => {
  const name = $('#cd-title').textContent;
  if (!confirm(`Delete ${name} entirely? Their notes, documents, avatar, and portal access are removed; past registrations are kept but unlinked. This cannot be undone.`)) return;
  try {
    await authed(`/api/admin/customers/${detailCustomerId}`, { method: 'DELETE' });
    $('#cust-detail').style.display = 'none';
    loadCustomers();
  } catch (err) { alert(err.message); }
});

$('#cd-share').addEventListener('change', async e => {
  const msg = $('#cd-share-msg');
  try {
    const res = await authed(`/api/admin/customers/${detailCustomerId}`, {
      method: 'PATCH', body: { share_contact: e.target.checked } });
    msg.style.color = 'var(--ok)';
    msg.textContent = res.share_contact ? 'Sharing ✓' : 'Private ✓';
    setTimeout(() => msg.textContent = '', 2500);
  } catch (err) {
    e.target.checked = !e.target.checked;
    msg.style.color = 'var(--red)'; msg.textContent = err.message;
  }
});

$('#cd-avatar-input').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file || !detailCustomerId) return;
  const msg = $('#cd-avatar-msg');
  const fd = new FormData();
  fd.append('avatar', file);
  const res = await fetch(`/api/admin/customers/${detailCustomerId}/avatar`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { msg.style.color = 'var(--red)'; msg.textContent = data.error || 'Upload failed'; return; }
  msg.style.color = 'var(--ok)'; msg.textContent = 'Updated ✓';
  e.target.value = '';
  openCustomerDetail(detailCustomerId);
  setTimeout(() => msg.textContent = '', 3000);
});

$('#doc-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (!detailCustomerId) return;
  const msg = $('#doc-msg');
  const fd = new FormData(e.target);
  msg.style.color = 'var(--ink-soft)'; msg.textContent = 'Uploading…';
  const res = await fetch(`/api/admin/customers/${detailCustomerId}/documents`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { msg.style.color = 'var(--red)'; msg.textContent = data.error || 'Upload failed'; return; }
  msg.style.color = 'var(--ok)'; msg.textContent = 'Uploaded ✓';
  e.target.reset();
  openCustomerDetail(detailCustomerId);
  setTimeout(() => msg.textContent = '', 3000);
});
$('#note-kind').addEventListener('change', e =>
  $('#cert-fields').style.display = e.target.value === 'certification' ? '' : 'none');

$('#note-form').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#note-msg');
  const f = e.target.elements;
  try {
    await authed(`/api/admin/customers/${detailCustomerId}/notes`, { method: 'POST', body: {
      kind: f.kind.value, body: f.body.value,
      session_id: f.session_id.value ? +f.session_id.value : null,
      cert_agency: f.cert_agency.value, cert_number: f.cert_number.value,
      cert_date: f.cert_date.value || null,
      visible_to_customer: f.visible_to_customer.value === 'true',
    }});
    msg.style.color = 'var(--ok)'; msg.textContent = 'Added ✓';
    e.target.reset();
    $('#cert-fields').style.display = 'none';
    openCustomerDetail(detailCustomerId);
    setTimeout(() => msg.textContent = '', 3000);
  } catch (err) {
    msg.style.color = 'var(--red)'; msg.textContent = err.message;
  }
});

// ---------- staff work history ----------
async function openStaffHistory(staffId, name) {
  const h = await authed(`/api/admin/staff/${staffId}/history`);
  $('#staff-history').style.display = '';
  $('#sh-title').textContent = `Work History: ${name}`;
  $('#sh-sessions').innerHTML = h.sessions.length ? h.sessions.map(s => `
    <tr>
      <td>${esc(s.course_name)}</td>
      <td>${fmtRange(s.start_date.slice(0,10), s.end_date.slice(0,10))}</td>
      <td>${CREW_ROLES[s.role] || s.role}</td>
      <td>${s.confirmed_students} confirmed</td>
      <td><span class="status-pill ${s.status === 'open' ? 'confirmed' : 'cancelled'}">${s.status}</span></td>
    </tr>`).join('')
    : '<tr><td colspan="5" style="text-align:center;color:var(--ink-soft);padding:16px">No classes worked yet.</td></tr>';
  $('#sh-students').innerHTML = h.students.length ? h.students.map(st => `
    <tr>
      <td><strong>${esc(st.first_name)} ${esc(st.last_name)}</strong><br>
        <span style="font-size:13px"><a href="mailto:${esc(st.email)}">${esc(st.email)}</a></span></td>
      <td>${esc(st.course_name)}</td>
      <td>${fmtDate(st.start_date.slice(0,10), { month: 'short', day: 'numeric', year: 'numeric' })}</td>
      <td><span class="status-pill ${st.status}">${st.status}</span></td>
    </tr>`).join('')
    : '<tr><td colspan="4" style="text-align:center;color:var(--ink-soft);padding:16px">No students yet.</td></tr>';
  $('#staff-history').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#sh-close').addEventListener('click', () => $('#staff-history').style.display = 'none');

// ---------- home stats (editable homepage metric cards) ----------
const HS_INPUT = 'font-family:var(--font-body);font-size:14px;padding:7px 9px;border:1.5px solid var(--line);border-radius:6px;background:#fff';

async function loadHomeStats() {
  const stats = await authed('/api/admin/home-stats');
  $('#homestat-rows').innerHTML = stats.map(s => `
    <tr data-hs="${s.id}">
      <td><input data-f="num" value="${esc(s.num)}" style="${HS_INPUT};width:80px"></td>
      <td><input data-f="suffix" value="${esc(s.suffix)}" style="${HS_INPUT};width:52px"></td>
      <td><input data-f="label" value="${esc(s.label)}" style="${HS_INPUT};width:220px"></td>
      <td><input data-f="sort" type="number" value="${s.sort}" style="${HS_INPUT};width:64px"></td>
      <td style="text-align:center"><input data-f="active" type="checkbox" ${s.active ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--red)"></td>
      <td><div class="row-actions">
        <button class="btn btn-sm btn-red" data-hs-save="${s.id}">Save</button>
        <button class="btn btn-sm btn-ghost" data-hs-del="${s.id}">Delete</button>
      </div></td>
    </tr>`).join('')
    || '<tr><td colspan="6" style="text-align:center;color:var(--ink-soft);padding:24px">No stats — add one below.</td></tr>';

  $$('#homestat-rows [data-hs-save]').forEach(b => b.addEventListener('click', async () => {
    const tr = b.closest('tr');
    const body = {
      num: tr.querySelector('[data-f=num]').value,
      suffix: tr.querySelector('[data-f=suffix]').value,
      label: tr.querySelector('[data-f=label]').value,
      sort: +tr.querySelector('[data-f=sort]').value || 0,
      active: tr.querySelector('[data-f=active]').checked,
    };
    const msg = $('#homestat-msg');
    try {
      await authed(`/api/admin/home-stats/${b.dataset.hsSave}`, { method: 'PATCH', body });
      msg.style.color = 'var(--ok)'; msg.textContent = 'Saved ✓';
      setTimeout(() => msg.textContent = '', 2500);
    } catch (err) { msg.style.color = 'var(--red)'; msg.textContent = err.message; }
  }));
  $$('#homestat-rows [data-hs-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete this stat card?')) return;
    await authed(`/api/admin/home-stats/${b.dataset.hsDel}`, { method: 'DELETE' });
    loadHomeStats();
  }));
}
$('#homestat-add').addEventListener('click', async () => {
  await authed('/api/admin/home-stats', { method: 'POST', body: { num: '0', suffix: '', label: 'New Stat', sort: 99 } });
  loadHomeStats();
});

// ---------- tabs ----------
const TAB_LOADERS = {
  inbox: loadInbox, regs: loadRegs, sessions: loadSessions, courses: loadCourses,
  trips: loadTrips, customers: loadCustomers, staff: loadStaff, photos: loadPhotos,
  sites: loadSites, homestats: loadHomeStats, accounts: loadAccounts, profile: loadProfile,
};

const ROLE_TABS = {
  superadmin: ['inbox', 'regs', 'sessions', 'courses', 'trips', 'customers', 'staff', 'photos', 'sites', 'homestats', 'accounts', 'profile'],
  admin: ['inbox', 'regs', 'sessions', 'courses', 'trips', 'customers', 'staff', 'photos', 'sites', 'homestats', 'accounts', 'profile'],
  staff: ['inbox', 'regs', 'sessions', 'customers', 'profile'],
  instructor: ['inbox', 'sessions', 'customers', 'profile'],
};

function switchTab(name) {
  const visible = ROLE_TABS[me?.role] || ROLE_TABS.admin;
  if (!TAB_LOADERS[name] || !visible.includes(name)) return;
  $$('.tabs button').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
  for (const t of Object.keys(TAB_LOADERS)) {
    $(`#tab-${t}`).style.display = t === name ? '' : 'none';
  }
  TAB_LOADERS[name]();
}

$$('.tabs button').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
$('#bell').addEventListener('click', () => switchTab('inbox'));
$('#admin-name').addEventListener('click', () => switchTab('profile'));

async function enterDash() {
  try { me = await authed('/api/admin/me'); }
  catch { // stale or expired token — back to login
    sessionStorage.clear(); token = null;
    show('login');
    return;
  }
  show('dash');
  $('#admin-name').textContent = me.name;
  sessionStorage.setItem('texrec_name', me.name);
  // role-scoped UI: hide tabs and staff-only widgets this role can't use
  const visible = ROLE_TABS[me.role] || ROLE_TABS.admin;
  $$('.tabs button').forEach(b => b.style.display = visible.includes(b.dataset.tab) ? '' : 'none');
  $$('.staff-only').forEach(el => el.style.display = me.role === 'instructor' ? 'none' : '');
  $$('.super-only').forEach(el => el.style.display = me.role === 'superadmin' ? '' : 'none');
  switchTab(me.role === 'instructor' ? 'inbox' : 'regs');
  try {
    const res = await authed('/api/admin/notifications?unacked=1');
    updateBadges(res.unacked);
  } catch {}
  startPolling();
}

if (token) enterDash(); else show('login');
