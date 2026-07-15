// TexRec class + trip calendar with registration
let view = new Date(); view.setDate(1);
let allSessions = [], allTrips = [];
const params = new URLSearchParams(location.search);
let filterSlug = params.get('course') || '';
let filterKind = params.get('kind') || 'all';   // all | classes | trips

const iso = d => d.toISOString().slice(0, 10);
const sessName = s => s.title || s.course_name;   // custom class name, else course name

async function loadData() {
  const from = new Date(); from.setMonth(from.getMonth() - 1);
  const to = new Date(); to.setMonth(to.getMonth() + 7);
  [allSessions, allTrips] = await Promise.all([
    api(`/api/sessions?from=${iso(from)}&to=${iso(to)}`),
    api('/api/trips'),
  ]);

  const slugs = new Map();
  allSessions.forEach(s => slugs.set(s.course_slug, s.course_name));
  const sel = $('#course-filter');
  sel.innerHTML = '<option value="">All course types</option>' +
    [...slugs].map(([slug, name]) =>
      `<option value="${slug}" ${slug === filterSlug ? 'selected' : ''}>${name}</option>`).join('');
  $('#kind-filter').value = filterKind;
  syncFilterState();
}

// disable the course-type filter when only trips are shown
function syncFilterState() {
  const cf = $('#course-filter');
  const off = filterKind === 'trips';
  cf.disabled = off;
  cf.style.opacity = off ? '.45' : '';
  cf.style.cursor = off ? 'not-allowed' : '';
}

// unified event list (classes + trips) honoring both filters
function items() {
  let list = [];
  if (filterKind !== 'trips') {
    const cs = filterSlug ? allSessions.filter(s => s.course_slug === filterSlug) : allSessions;
    list = list.concat(cs.map(s => ({
      kind: 'class', id: s.id, ref: s, name: sessName(s),
      sd: s.start_date.slice(0, 10), ed: s.end_date.slice(0, 10),
      full: s.registered >= s.capacity,
    })));
  }
  if (filterKind !== 'classes') {
    list = list.concat(allTrips.map(t => ({
      kind: 'trip', id: t.id, ref: t, name: t.title,
      sd: t.start_date.slice(0, 10), ed: t.end_date.slice(0, 10),
      full: t.spots_taken >= t.spots_total,
    })));
  }
  return list;
}

function render() {
  const y = view.getFullYear(), m = view.getMonth();
  const monthName = view.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const kindLabel = filterKind === 'classes' ? 'Classes' : filterKind === 'trips' ? 'Trips' : 'Classes & Trips';
  $('#cal-title').textContent = monthName;
  $('#list-title').textContent = `${kindLabel} in ${monthName}`;

  const first = new Date(y, m, 1);
  const startDow = first.getDay();
  const gridStart = new Date(y, m, 1 - startDow);
  const todayIso = iso(new Date());

  const cells = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    .map(d => `<div class="cal-dow">${d}</div>`);

  const list = items();
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i);
    const dIso = iso(d);
    const dim = d.getMonth() !== m ? 'dim' : '';
    const today = dIso === todayIso ? 'today' : '';
    // show every event on its start date; continuation chips only for short (≤4-day) events
    const evts = list.filter(it => {
      if (it.sd === dIso) return true;
      const spanDays = (new Date(it.ed) - new Date(it.sd)) / 86400000;
      return it.sd < dIso && it.ed >= dIso && spanDays <= 4;
    });
    const html = evts.map(it => {
      const starts = it.sd === dIso;
      return `<button class="cal-evt ${it.kind === 'trip' ? 'trip' : ''} ${it.full ? 'full' : ''} ${starts ? '' : 'span'}"
        data-kind="${it.kind}" data-id="${it.id}" title="${esc(it.name)}">${starts ? '' : '↳ '}${esc(it.name)}</button>`;
    }).join('');
    cells.push(`<div class="cal-cell ${dim} ${today}"><span class="dnum">${d.getDate()}</span>${html}</div>`);
  }
  $('#cal-grid').innerHTML = cells.join('');

  // list: events starting this month, earliest first
  const inMonth = list.filter(it => {
    const sd = new Date(it.sd + 'T12:00:00');
    return sd.getFullYear() === y && sd.getMonth() === m;
  }).sort((a, b) => a.sd < b.sd ? -1 : a.sd > b.sd ? 1 : 0);

  $('#session-list').innerHTML = inMonth.length ? inMonth.map(it =>
    it.kind === 'class' ? classRow(it.ref) : tripRow(it.ref)).join('')
    : `<p style="color:var(--ink-soft)">Nothing scheduled this month${filterSlug ? ' for this course' : ''}. Try the next month →</p>`;

  $$('#cal-grid .cal-evt, #session-list [data-id]').forEach(el =>
    el.addEventListener('click', () => openModal(el.dataset.kind, +el.dataset.id)));
}

function dateBadge(dIso) {
  return `<div class="session-date">
    <span class="mon">${fmtDate(dIso, { month: 'short' }).toUpperCase()}</span>
    <span class="day">${new Date(dIso + 'T12:00:00').getDate()}</span>
  </div>`;
}

function classRow(s) {
  const left = s.capacity - s.registered;
  const pct = Math.min(100, Math.round(s.registered / s.capacity * 100));
  const sd = s.start_date.slice(0, 10), ed = s.end_date.slice(0, 10);
  return `
    <div class="session-row">
      ${dateBadge(sd)}
      <div>
        <h3>${esc(sessName(s))}</h3>
        <div class="det">${fmtRange(sd, ed)} · ${s.start_time} · ${s.location}</div>
        <div class="seats"><span class="bar"><i style="width:${pct}%"></i></span>
          ${left > 0 ? `${left} of ${s.capacity} seats left` : 'Full — waitlist open'}</div>
      </div>
      <div class="act"><button class="btn btn-sm btn-red" data-kind="class" data-id="${s.id}">
        ${left > 0 ? 'Register' : 'Join Waitlist'}</button></div>
    </div>`;
}

function tripRow(t) {
  const left = t.spots_total - t.spots_taken;
  const sd = t.start_date.slice(0, 10), ed = t.end_date.slice(0, 10);
  return `
    <div class="session-row">
      ${dateBadge(sd)}
      <div>
        <h3>${esc(t.title)} <span class="chip" style="background:var(--ocean);color:#fff;border-color:var(--ocean)">Trip</span></h3>
        <div class="det">${esc(t.destination)} · ${fmtRange(sd, ed)}</div>
        <div class="seats">${left > 0 ? `${left} of ${t.spots_total} spots left` : 'Sold out'}
          · ${priceLabel(t.price_cents, t.call_for_price)}${t.call_for_price ? '' : ' / diver'}</div>
      </div>
      <div class="act"><button class="btn btn-sm" style="background:var(--ocean);color:#fff" data-kind="trip" data-id="${t.id}">View Trip</button></div>
    </div>`;
}

// ---------- modal ----------
const back = $('#modal-back');
let currentSession = null;

function openModal(kind, id) {
  return kind === 'trip' ? openTrip(id) : openClass(id);
}

function openClass(id) {
  const s = allSessions.find(x => x.id === id);
  if (!s) return;
  currentSession = s;
  const left = s.capacity - s.registered;
  $('#m-title').textContent = sessName(s);
  $('#m-sub').textContent = s.blurb;
  $('#m-details').innerHTML = `
    <dt>Dates</dt><dd>${fmtRange(s.start_date.slice(0, 10), s.end_date.slice(0, 10))}</dd>
    <dt>Starts</dt><dd>${s.start_time}</dd>
    <dt>Location</dt><dd>${s.location}</dd>
    ${s.staff?.length ? `<dt>Your Crew</dt><dd>${s.staff.map(p =>
      `${esc(p.name)} <span style="color:var(--ink-soft);font-size:13px">(${{
        instructor: 'Instructor', divemaster: 'Divemaster',
        instructor_trainee: 'Instructor-in-Training', divemaster_trainee: 'DM-in-Training',
      }[p.role] || p.role})</span>`).join('<br>')}</dd>` : ''}
    <dt>Price</dt><dd><strong>${priceLabel(s.price_cents, s.call_for_price)}</strong></dd>
    <dt>Seats</dt><dd>${left > 0 ? `${left} of ${s.capacity} open` : 'Full — you can join the waitlist'}</dd>
    ${s.notes ? `<dt>Notes</dt><dd>${s.notes}</dd>` : ''}`;
  // list this class's individual session dates (pool nights, lake days…) if defined
  api(`/api/sessions/${s.id}/meetings`).then(ms => {
    if (!ms.length || !currentSession || currentSession.id !== s.id) return;
    const html = ms.map(m => `${esc(SESSION_TYPE_LABEL[m.type] || m.type)}${m.title ? ' — ' + esc(m.title) : ''}: ${
      fmtDate(m.meeting_date.slice(0,10), { weekday:'short', month:'short', day:'numeric' })}${
      m.start_time ? ' · ' + m.start_time : ''}${m.location ? ' · ' + esc(m.location) : ''}`).join('<br>');
    $('#m-details').insertAdjacentHTML('beforeend', `<dt>Sessions</dt><dd>${html}</dd>`);
  }).catch(() => {});
  $('#trip-cta').style.display = 'none';
  $('#form-msg').className = 'form-msg';
  $('#reg-form').reset();
  $('#reg-form').style.display = '';
  $('#reg-submit').textContent = left > 0 ? 'Request My Spot' : 'Join the Waitlist';
  $('#reg-submit').disabled = false;
  openBack();
}

function openTrip(id) {
  const t = allTrips.find(x => x.id === id);
  if (!t) return;
  currentSession = null;
  const left = t.spots_total - t.spots_taken;
  $('#m-title').textContent = t.title;
  $('#m-sub').textContent = t.description;
  $('#m-details').innerHTML = `
    <dt>Destination</dt><dd>${esc(t.destination)}</dd>
    <dt>Dates</dt><dd>${fmtRange(t.start_date.slice(0, 10), t.end_date.slice(0, 10))}</dd>
    <dt>Price</dt><dd><strong>${priceLabel(t.price_cents, t.call_for_price)}${t.call_for_price ? '' : ' / diver'}</strong></dd>
    <dt>Spots</dt><dd>${left > 0 ? `${left} of ${t.spots_total} open` : 'Sold out — ask about the waitlist'}</dd>`;
  $('#reg-form').style.display = 'none';
  $('#form-msg').className = 'form-msg';
  $('#trip-cta').style.display = '';
  openBack();
}

function openBack() {
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

// ---------- nav + filters ----------
$('#prev').addEventListener('click', () => { view.setMonth(view.getMonth() - 1); render(); });
$('#next').addEventListener('click', () => { view.setMonth(view.getMonth() + 1); render(); });
$('#today').addEventListener('click', () => { view = new Date(); view.setDate(1); render(); });
$('#course-filter').addEventListener('change', e => { filterSlug = e.target.value; render(); });
$('#kind-filter').addEventListener('change', e => {
  filterKind = e.target.value;
  syncFilterState();
  render();
});

(async () => {
  await loadData();
  // deep links: ?session=ID or ?trip=ID opens the modal; ?course=slug / ?kind filter
  const sid = params.get('session'), tid = params.get('trip');
  if (sid) {
    const s = allSessions.find(x => x.id === +sid);
    if (s) { view = new Date(s.start_date.slice(0, 10) + 'T12:00:00'); view.setDate(1); }
  } else if (tid) {
    const t = allTrips.find(x => x.id === +tid);
    if (t) { view = new Date(t.start_date.slice(0, 10) + 'T12:00:00'); view.setDate(1); }
  }
  render();
  if (sid) openModal('class', +sid);
  else if (tid) openModal('trip', +tid);
})();
