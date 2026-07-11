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

  // classes
  $('#my-classes').innerHTML = me.registrations.length ? me.registrations.map(r => `
    <div class="session-row">
      <div class="session-date">
        <span class="mon">${fmtDate(r.start_date.slice(0,10), { month: 'short' }).toUpperCase()}</span>
        <span class="day">${new Date(r.start_date.slice(0,10) + 'T12:00:00').getDate()}</span>
      </div>
      <div>
        <h3>${esc(r.course_name)}</h3>
        <div class="det">${fmtRange(r.start_date.slice(0,10), r.end_date.slice(0,10))} · ${r.start_time} · ${esc(r.location)}</div>
        ${r.staff.length ? `<div class="det">With: ${r.staff.map(s => `${esc(s.name)} (${ROLE_LABEL[s.role] || s.role})`).join(', ')}</div>` : ''}
        ${r.classmates?.length ? `<div class="det">Classmates: ${r.classmates.map(cm =>
          `${esc(cm.name)} (<a href="mailto:${esc(cm.email)}">${esc(cm.email)}</a>${cm.phone ? `, ${esc(cm.phone)}` : ''})`).join(' · ')}</div>` : ''}
        <div class="seats" style="margin-top:6px">
          <span class="status-pill ${r.status}">${r.status}</span>
          <span style="font-weight:400;color:var(--ink-soft);margin-left:8px">${STATUS_BLURB[r.status] || ''}</span>
        </div>
      </div>
      <div></div>
    </div>`).join('')
    : '<p style="color:var(--ink-soft)">No registrations yet — <a href="/calendar">find a class</a>.</p>';

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

  // class photo upload — only for confirmed classes
  const confirmed = me.registrations.filter(r => r.status === 'confirmed');
  const photoForm = $('#my-photo-form');
  photoForm.style.display = confirmed.length ? 'flex' : 'none';
  if (confirmed.length) {
    photoForm.elements.session_id.innerHTML = confirmed.map(r =>
      `<option value="${r.session_id}">${esc(r.course_name)} (${fmtDate(r.start_date.slice(0,10), { month: 'short', day: 'numeric', year: 'numeric' })})</option>`).join('');
  }

  // media
  $('#my-media').innerHTML = me.media.length ? me.media.map(m => {
    const src = `/api/media/${m.id}/file?t=${encodeURIComponent(ctoken)}`;
    const isImg = m.mime.startsWith('image/');
    const mine = m.uploaded_by_customer_id === me.customer.id;
    return `
    <div class="media-card" data-id="${m.id}" data-img="${isImg}" data-title="${esc(m.title || m.original_name)}"
         data-meta="${esc(m.course_name)} · ${fmtDate(m.start_date.slice(0,10), { month: 'long', day: 'numeric', year: 'numeric' })}">
      ${isImg
        ? `<img src="${src}" alt="${esc(m.title || m.original_name)}" loading="lazy">`
        : `<div class="doc-icon">📄</div>`}
      <div class="mc-body">
        <strong>${esc(m.title || m.original_name)}</strong>
        <span>${esc(m.course_name)}${mine ? ' · yours' : ''}</span>
        ${mine ? `<div style="margin-top:6px"><button class="btn btn-sm btn-ghost" data-mymedia-del="${m.id}">Delete</button></div>` : ''}
      </div>
    </div>`;
  }).join('')
    : '<p style="color:var(--ink-soft)">Photos and files from your confirmed classes will show up here.</p>';
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
