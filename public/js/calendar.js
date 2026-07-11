// TexRec class calendar + registration
let view = new Date(); view.setDate(1);
let allSessions = [];
let filterSlug = new URLSearchParams(location.search).get('course') || '';

const iso = d => d.toISOString().slice(0, 10);

async function loadSessions() {
  const from = new Date(); from.setMonth(from.getMonth() - 1);
  const to = new Date(); to.setMonth(to.getMonth() + 7);
  allSessions = await api(`/api/sessions?from=${iso(from)}&to=${iso(to)}`);
  const slugs = new Map();
  allSessions.forEach(s => slugs.set(s.course_slug, s.course_name));
  const sel = $('#course-filter');
  sel.innerHTML = '<option value="">All courses</option>' +
    [...slugs].map(([slug, name]) =>
      `<option value="${slug}" ${slug === filterSlug ? 'selected' : ''}>${name}</option>`).join('');
}

function visible() {
  return filterSlug ? allSessions.filter(s => s.course_slug === filterSlug) : allSessions;
}

function render() {
  const y = view.getFullYear(), m = view.getMonth();
  const monthName = view.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  $('#cal-title').textContent = monthName;
  $('#list-title').textContent = `Classes in ${monthName}`;

  const first = new Date(y, m, 1);
  const startDow = first.getDay();
  const gridStart = new Date(y, m, 1 - startDow);
  const todayIso = iso(new Date());

  const cells = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    .map(d => `<div class="cal-dow">${d}</div>`);

  const sess = visible();
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i);
    const dIso = iso(d);
    const dim = d.getMonth() !== m ? 'dim' : '';
    const today = dIso === todayIso ? 'today' : '';
    // Show every class on its start date; continuation chips only for short (≤4-day) classes
    const evts = sess.filter(s => {
      const [sd, ed] = [s.start_date.slice(0,10), s.end_date.slice(0,10)];
      if (sd === dIso) return true;
      const spanDays = (new Date(ed) - new Date(sd)) / 86400000;
      return sd < dIso && ed >= dIso && spanDays <= 4;
    });
    const html = evts.map(s => {
      const starts = s.start_date.slice(0,10) === dIso;
      const full = s.registered >= s.capacity;
      return `<button class="cal-evt ${full ? 'full' : ''} ${starts ? '' : 'span'}"
        data-id="${s.id}" title="${s.course_name}">${starts ? '' : '↳ '}${s.course_name}</button>`;
    }).join('');
    cells.push(`<div class="cal-cell ${dim} ${today}"><span class="dnum">${d.getDate()}</span>${html}</div>`);
  }
  $('#cal-grid').innerHTML = cells.join('');

  // list: sessions starting this month
  const inMonth = sess.filter(s => {
    const sd = new Date(s.start_date.slice(0,10) + 'T12:00:00');
    return sd.getFullYear() === y && sd.getMonth() === m;
  });
  $('#session-list').innerHTML = inMonth.length ? inMonth.map(s => {
    const left = s.capacity - s.registered;
    const pct = Math.min(100, Math.round(s.registered / s.capacity * 100));
    return `
    <div class="session-row">
      <div class="session-date">
        <span class="mon">${fmtDate(s.start_date.slice(0,10), { month: 'short' }).toUpperCase()}</span>
        <span class="day">${new Date(s.start_date.slice(0,10) + 'T12:00:00').getDate()}</span>
      </div>
      <div>
        <h3>${s.course_name}</h3>
        <div class="det">${fmtRange(s.start_date.slice(0,10), s.end_date.slice(0,10))} · ${s.start_time} · ${s.location}</div>
        <div class="seats"><span class="bar"><i style="width:${pct}%"></i></span>
          ${left > 0 ? `${left} of ${s.capacity} seats left` : 'Full — waitlist open'}</div>
      </div>
      <div class="act"><button class="btn btn-sm btn-red" data-id="${s.id}">
        ${left > 0 ? 'Register' : 'Join Waitlist'}</button></div>
    </div>`;
  }).join('') : `<p style="color:var(--ink-soft)">No classes scheduled this month${filterSlug ? ' for this course' : ''}. Try the next month →</p>`;

  $$('#cal-grid .cal-evt, #session-list [data-id]').forEach(el =>
    el.addEventListener('click', () => openModal(+el.dataset.id)));
}

// ---------- modal ----------
const back = $('#modal-back');
let currentSession = null;

function openModal(id) {
  const s = allSessions.find(x => x.id === id);
  if (!s) return;
  currentSession = s;
  const left = s.capacity - s.registered;
  $('#m-title').textContent = s.course_name;
  $('#m-sub').textContent = s.blurb;
  $('#m-details').innerHTML = `
    <dt>Dates</dt><dd>${fmtRange(s.start_date.slice(0,10), s.end_date.slice(0,10))}</dd>
    <dt>Starts</dt><dd>${s.start_time}</dd>
    <dt>Location</dt><dd>${s.location}</dd>
    ${s.staff?.length ? `<dt>Your Crew</dt><dd>${s.staff.map(p =>
      `${esc(p.name)} <span style="color:var(--ink-soft);font-size:13px">(${{
        instructor: 'Instructor', divemaster: 'Divemaster',
        instructor_trainee: 'Instructor-in-Training', divemaster_trainee: 'DM-in-Training',
      }[p.role] || p.role})</span>`).join('<br>')}</dd>` : ''}
    <dt>Price</dt><dd><strong>${priceLabel(s.price_cents)}</strong></dd>
    <dt>Seats</dt><dd>${left > 0 ? `${left} of ${s.capacity} open` : 'Full — you can join the waitlist'}</dd>
    ${s.notes ? `<dt>Notes</dt><dd>${s.notes}</dd>` : ''}`;
  $('#form-msg').className = 'form-msg';
  $('#reg-form').reset();
  $('#reg-form').style.display = '';
  $('#reg-submit').textContent = left > 0 ? 'Request My Spot' : 'Join the Waitlist';
  $('#reg-submit').disabled = false;
  back.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  back.classList.remove('open');
  document.body.style.overflow = '';
}
// registration modal holds typed data — only the ✕ button closes it
// (backdrop clicks and Escape are ignored so a stray click/drag can't wipe the form)
$('#modal-close').addEventListener('click', closeModal);

$('#reg-form').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#form-msg');
  const btn = $('#reg-submit');
  btn.disabled = true; btn.textContent = 'Sending…';
  const data = Object.fromEntries(new FormData(e.target));
  try {
    const res = await api('/api/registrations', {
      method: 'POST', body: { ...data, session_id: currentSession.id } });
    msg.className = 'form-msg ok';
    msg.textContent = res.message;
    $('#reg-form').style.display = 'none';
    currentSession.registered += res.status !== 'waitlist' ? 1 : 0;
    render();
  } catch (err) {
    msg.className = 'form-msg err';
    msg.textContent = err.message;
    btn.disabled = false;
    btn.textContent = 'Request My Spot';
  }
});

// ---------- nav ----------
$('#prev').addEventListener('click', () => { view.setMonth(view.getMonth() - 1); render(); });
$('#next').addEventListener('click', () => { view.setMonth(view.getMonth() + 1); render(); });
$('#today').addEventListener('click', () => { view = new Date(); view.setDate(1); render(); });
$('#course-filter').addEventListener('change', e => { filterSlug = e.target.value; render(); });

(async () => {
  await loadSessions();
  // deep links: ?session=ID opens the modal; ?course=slug filters
  const sid = new URLSearchParams(location.search).get('session');
  if (sid) {
    const s = allSessions.find(x => x.id === +sid);
    if (s) { view = new Date(s.start_date.slice(0,10) + 'T12:00:00'); view.setDate(1); }
  }
  render();
  if (sid) openModal(+sid);
})();
