// TexRec customer portal
let ctoken = localStorage.getItem('texrec_customer_token');

const cauthed = (path, opts = {}) => api(path, {
  ...opts, headers: { Authorization: `Bearer ${ctoken}`, ...(opts.headers || {}) } });

function show(view) {
  $('#login-view').style.display = view === 'login' ? '' : 'none';
  $('#dash-view').style.display = view === 'dash' ? '' : 'none';
}

const STATUS_BLURB = {
  pending: 'Awaiting confirmation from TexRec',
  confirmed: 'You\'re in — see you there!',
  waitlist: 'On the waitlist — we\'ll email if a spot opens',
  cancelled: 'Cancelled',
};
const ROLE_LABEL = {
  instructor: 'Instructor', divemaster: 'Divemaster',
  instructor_trainee: 'Instructor-in-Training', divemaster_trainee: 'DM-in-Training',
};

$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#login-msg');
  msg.className = 'form-msg';
  try {
    const res = await api('/api/customer/login', {
      method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
    ctoken = res.token;
    localStorage.setItem('texrec_customer_token', ctoken);
    enterDash();
  } catch (err) {
    msg.className = 'form-msg err';
    msg.textContent = err.message;
  }
});

$('#logout').addEventListener('click', async () => {
  try { await cauthed('/api/customer/logout', { method: 'POST' }); } catch {}
  localStorage.removeItem('texrec_customer_token'); ctoken = null;
  show('login');
});

async function enterDash() {
  let me;
  try { me = await cauthed('/api/customer/me'); }
  catch { localStorage.removeItem('texrec_customer_token'); ctoken = null; show('login'); return; }
  show('dash');
  $('#cust-hello').textContent = `Welcome, ${me.customer.first_name}`;
  $('#share-contact').checked = !!me.customer.share_contact;
  const initials = `${me.customer.first_name[0] || ''}${me.customer.last_name[0] || ''}`.toUpperCase();
  $('#my-avatar').innerHTML = me.customer.has_avatar
    ? `<img src="/api/customers/${me.customer.id}/avatar?t=${encodeURIComponent(ctoken)}&v=${Date.now()}"
        style="width:76px;height:76px;border-radius:50%;object-fit:cover;box-shadow:var(--shadow)" alt="">`
    : `<div class="avatar" style="margin:0">${esc(initials)}</div>`;

  // my documents
  const DOC_LABELS = { cert_card: 'Cert Card', medical: 'Medical Form', waiver: 'Waiver', other: 'Other' };
  $('#my-docs').innerHTML = me.documents.length ? me.documents.map(doc => {
    const src = `/api/documents/${doc.id}/file?t=${encodeURIComponent(ctoken)}`;
    return `
    <div class="media-card">
      ${doc.mime.startsWith('image/')
        ? `<img src="${src}" alt="" loading="lazy" onclick="window.open('${src}','_blank')">`
        : `<div class="doc-icon" onclick="window.open('${src}','_blank')">📄</div>`}
      <div class="mc-body">
        <strong>${esc(doc.title || doc.original_name)}</strong>
        <span>${DOC_LABELS[doc.category]} · ${doc.uploaded_by_customer ? 'uploaded by you' : `from ${esc(doc.uploaded_by_name) || 'TexRec'}`}</span>
        ${doc.uploaded_by_customer ? `<div style="margin-top:6px"><button class="btn btn-sm btn-ghost" data-mydoc-del="${doc.id}">Delete</button></div>` : ''}
      </div>
    </div>`;
  }).join('')
    : '<p style="color:var(--ink-soft)">Nothing uploaded yet.</p>';
  $$('#my-docs [data-mydoc-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete this document?')) return;
    await cauthed(`/api/customer/documents/${b.dataset.mydocDel}`, { method: 'DELETE' });
    enterDash();
  }));

  // enrollments
  $('#my-classes').innerHTML = me.enrollments.length ? me.enrollments.map(r => `
    <div class="session-row">
      <div style="grid-column:1 / -1">
        <h3>${esc(r.course_name)}</h3>
        <div class="det">Enrolled ${fmtDate(r.created_at.slice(0,10), { month: 'long', day: 'numeric', year: 'numeric' })}</div>
        <div class="seats" style="margin-top:6px">
          <span class="status-pill ${r.status}">${r.status}</span>
          <span style="font-weight:400;color:var(--ink-soft);margin-left:8px">${STATUS_BLURB[r.status] || ''}</span>
        </div>
        ${r.status !== 'cancelled' ? (() => {
          const v = regValidation(r, me.customer);
          return `<div class="seats" style="margin-top:6px"><span class="form-flag ${v.color}">${
            v.key === 'validated' ? 'Validated ✓' : v.label}</span></div>`;
        })() : ''}
        ${r.requirement_progress?.length ? `
          ${r.needs_scheduling
            ? `<div style="margin-top:8px"><span class="form-flag red" style="font-size:11.5px">⚠ Pick your session dates</span></div>`
            : `<div class="det" style="margin-top:8px">${r.requirement_progress.map(p =>
                `<span class="form-flag ${p.done >= p.required ? 'green' : 'yellow'}" style="font-size:11px;padding:2px 7px;margin-right:5px">${
                  esc(p.label)} ${p.done}/${p.required}</span>`).join('')}</div>`}
          <div style="margin-top:8px"><button class="btn btn-sm ${r.needs_scheduling ? 'btn-red' : 'btn-ghost'}" data-mysess="${r.id}">${
            r.needs_scheduling ? 'Choose my sessions' : 'My sessions'}</button></div>
          <div id="mysess-${r.id}" style="display:none;margin-top:10px"></div>` : ''}
      </div>
    </div>`).join('')
    : '<p style="color:var(--ink-soft)">No enrollments yet — <a href="/courses">browse courses</a>.</p>';

  // notes & certs
  $('#my-notes').innerHTML = me.notes.length ? me.notes.map(n => `
    <div class="notif">
      <div class="icon">${n.kind === 'certification' ? '📜' : '📝'}</div>
      <div>
        <h4>${n.kind === 'certification'
          ? `${esc(n.cert_agency) || 'Certification'}${n.cert_number ? ` · ${esc(n.cert_number)}` : ''}`
          : `Note${n.course_name ? ` — ${esc(n.course_name)}` : ''}`}</h4>
        <div class="body">${esc(n.body)}</div>
        <div class="when">
          ${n.cert_date ? `Certified ${fmtDate(n.cert_date.slice(0,10), { month: 'long', day: 'numeric', year: 'numeric' })} · ` : ''}
          ${n.author_name ? `from ${esc(n.author_name)}` : ''}
        </div>
      </div>
      <div></div>
    </div>`).join('')
    : '<p style="color:var(--ink-soft)">Nothing here yet — your instructor will add certifications and notes as you train.</p>';

  // photo upload — pick from the sessions this customer is enrolled in
  const photoForm = $('#my-photo-form');
  if (photoForm) {
    const sessions = me.sessions || [];
    photoForm.style.display = sessions.length ? 'flex' : 'none';
    if (sessions.length) {
      photoForm.elements.session_id.innerHTML = sessions.map(s =>
        `<option value="${s.id}">${esc(s.title || s.type_name)} · ${fmtDate(s.session_date.slice(0,10), { month: 'short', day: 'numeric', year: 'numeric' })}</option>`).join('');
    }
  }

  // media
  $('#my-media').innerHTML = me.media.length ? me.media.map(m => {
    const src = `/api/media/${m.id}/file?t=${encodeURIComponent(ctoken)}`;
    const isImg = m.mime.startsWith('image/');
    const mine = m.uploaded_by_customer_id === me.customer.id;
    return `
    <div class="media-card" data-id="${m.id}" data-img="${isImg}" data-title="${esc(m.title || m.original_name)}"
         data-meta="${esc(m.type_name)} · ${fmtDate(m.session_date.slice(0,10), { month: 'long', day: 'numeric', year: 'numeric' })}">
      ${isImg
        ? `<img src="${src}" alt="${esc(m.title || m.original_name)}" loading="lazy">`
        : `<div class="doc-icon">📄</div>`}
      <div class="mc-body">
        <strong>${esc(m.title || m.original_name)}</strong>
        <span>${esc(m.type_name)}${mine ? ' · yours' : ''}</span>
        ${mine ? `<div style="margin-top:6px"><button class="btn btn-sm btn-ghost" data-mymedia-del="${m.id}">Delete</button></div>` : ''}
      </div>
    </div>`;
  }).join('')
    : '<p style="color:var(--ink-soft)">Photos and files from your sessions will show up here.</p>';
  $$('#my-media [data-mymedia-del]').forEach(b => b.addEventListener('click', async e => {
    e.stopPropagation();
    if (!confirm('Delete this photo?')) return;
    await cauthed(`/api/customer/media/${b.dataset.mymediaDel}`, { method: 'DELETE' });
    enterDash();
  }));

  $$('#my-media .media-card').forEach(card => card.addEventListener('click', () => {
    const src = `/api/media/${card.dataset.id}/file?t=${encodeURIComponent(ctoken)}`;
    if (card.dataset.img === 'true') {
      $('#pm-img').src = src;
      $('#pm-title').textContent = card.dataset.title;
      $('#pm-meta').textContent = card.dataset.meta;
      $('#photo-back').classList.add('open');
      document.body.style.overflow = 'hidden';
    } else {
      window.open(src, '_blank');
    }
  }));
}

$('#share-contact').addEventListener('change', async e => {
  const msg = $('#share-msg');
  try {
    const res = await cauthed('/api/customer/me', {
      method: 'PATCH', body: { share_contact: e.target.checked } });
    msg.style.color = 'var(--ok)';
    msg.textContent = res.share_contact ? 'Shared ✓' : 'Private ✓';
    setTimeout(() => msg.textContent = '', 2500);
  } catch (err) {
    e.target.checked = !e.target.checked;
    msg.style.color = 'var(--red)'; msg.textContent = err.message;
  }
});

$('#my-avatar-input').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const msg = $('#my-avatar-msg');
  const fd = new FormData();
  fd.append('avatar', file);
  const res = await fetch('/api/customer/avatar', {
    method: 'POST', headers: { Authorization: `Bearer ${ctoken}` }, body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { msg.style.color = 'var(--red)'; msg.textContent = data.error || 'Upload failed'; return; }
  msg.style.color = 'var(--ok)'; msg.textContent = 'Updated ✓';
  e.target.value = '';
  enterDash();
  setTimeout(() => msg.textContent = '', 3000);
});

$('#my-photo-form').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#my-photo-msg');
  const f = e.target.elements;
  const fd = new FormData();
  fd.append('file', f.file.files[0]);
  fd.append('title', f.title.value);
  msg.style.color = 'var(--ink-soft)'; msg.textContent = 'Uploading…';
  const res = await fetch(`/api/customer/sessions/${f.session_id.value}/media`, {
    method: 'POST', headers: { Authorization: `Bearer ${ctoken}` }, body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { msg.style.color = 'var(--red)'; msg.textContent = data.error || 'Upload failed'; return; }
  msg.style.color = 'var(--ok)'; msg.textContent = 'Added ✓';
  e.target.reset();
  enterDash();
  setTimeout(() => msg.textContent = '', 3000);
});

// ---------- customer self-service: choose class sessions ----------
async function loadMySessions(regId) {
  const box = $(`#mysess-${regId}`);
  if (!box) return;
  box.dataset.loaded = '1';
  renderMySessions(regId, await cauthed(`/api/customer/enrollments/${regId}/sessions`));
}

function renderMySessions(regId, data) {
  const box = $(`#mysess-${regId}`);
  if (!box) return;
  const sched = data.scheduled.length ? data.scheduled.map(s => `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--line)">
      <div><strong>${esc(s.type_name)}</strong>${s.title ? ' · ' + esc(s.title) : ''}<br>
        <span style="font-size:13px;color:var(--ink-soft)">${fmtDate(s.session_date.slice(0,10), { weekday:'short', month:'short', day:'numeric' })}${
          s.start_time ? ' · ' + s.start_time : ''}${s.location ? ' · ' + esc(s.location) : ''}</span></div>
      <div>${['attended', 'completed'].includes(s.status)
        ? '<span class="form-flag green" style="font-size:11px;padding:2px 7px">Done</span>'
        : `<button class="btn btn-sm btn-ghost" data-mydel="${s.es_id}" data-reg="${regId}">Remove</button>`}</div>
    </div>`).join('') : '<p style="color:var(--ink-soft);font-size:14px;margin:2px 0">No sessions chosen yet — pick your dates below.</p>';
  const cands = data.candidates.length ? `
    <div style="display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap">
      <select id="mycand-${regId}" style="flex:1;min-width:220px;font-family:var(--font-body);font-size:14px;padding:9px 11px;border:1.5px solid var(--line);border-radius:7px;background:#fff">
        <option value="">— choose a date to add —</option>
        ${data.candidates.map(c => `<option value="${c.session_id}">${
          esc(c.type_name)} · ${fmtDate(c.session_date.slice(0,10), { month:'short', day:'numeric' })}${
          c.start_time ? ' ' + c.start_time : ''}${c.title ? ' · ' + esc(c.title) : ''} · ${Math.max(0, c.capacity - c.enrolled)} spots left</option>`).join('')}
      </select>
      <button class="btn btn-sm btn-red" data-myadd="${regId}">Add</button>
    </div>` : '<p style="color:var(--ink-soft);font-size:13px;margin-top:10px">No more dates available right now — call us if you need options.</p>';
  box.innerHTML = `<div style="background:var(--sand);border-radius:9px;padding:14px 16px">
    <strong style="font-size:14.5px">Your sessions</strong>
    ${sched}${cands}
    <div class="form-msg" id="mysess-msg-${regId}" style="font-size:13px;margin-top:8px"></div>
  </div>`;
}

// keep the panel open across a refresh, and refresh the class progress badges too
async function refreshAfterSess(regId) {
  await enterDash();
  const box = $(`#mysess-${regId}`);
  if (box) { box.style.display = ''; await loadMySessions(regId); }
}

// one delegated handler for all session controls (survives dashboard re-renders)
$('#my-classes').addEventListener('click', async e => {
  const t = e.target.closest('[data-mysess],[data-myadd],[data-mydel]');
  if (!t) return;
  try {
    if (t.dataset.mysess) {
      const box = $(`#mysess-${t.dataset.mysess}`);
      const opening = box.style.display === 'none';
      box.style.display = opening ? '' : 'none';
      if (opening && !box.dataset.loaded) await loadMySessions(+t.dataset.mysess);
    } else if (t.dataset.myadd) {
      const mid = $(`#mycand-${t.dataset.myadd}`).value;
      if (!mid) return;
      await cauthed(`/api/customer/enrollments/${t.dataset.myadd}/sessions`, { method: 'POST', body: { session_id: +mid } });
      await refreshAfterSess(+t.dataset.myadd);
    } else if (t.dataset.mydel) {
      await cauthed(`/api/customer/enrollment-sessions/${t.dataset.mydel}`, { method: 'DELETE' });
      await refreshAfterSess(+t.dataset.reg);
    }
  } catch (err) {
    const msg = $(`#mysess-msg-${t.dataset.myadd || t.dataset.reg || t.dataset.mysess}`);
    if (msg) { msg.className = 'form-msg err'; msg.textContent = err.message; } else alert(err.message);
  }
});

$('#my-doc-form').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#my-doc-msg');
  const fd = new FormData(e.target);
  msg.style.color = 'var(--ink-soft)'; msg.textContent = 'Uploading…';
  const res = await fetch('/api/customer/documents', {
    method: 'POST', headers: { Authorization: `Bearer ${ctoken}` }, body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { msg.style.color = 'var(--red)'; msg.textContent = data.error || 'Upload failed'; return; }
  msg.style.color = 'var(--ok)'; msg.textContent = 'Uploaded ✓';
  e.target.reset();
  enterDash();
  setTimeout(() => msg.textContent = '', 3000);
});

function closePhoto() {
  $('#photo-back').classList.remove('open');
  document.body.style.overflow = '';
}
$('#photo-close').addEventListener('click', closePhoto);
$('#photo-back').addEventListener('click', e => { if (e.target === $('#photo-back')) closePhoto(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePhoto(); });

if (ctoken) enterDash(); else show('login');
