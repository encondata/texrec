// TexRec session calendar. Two modes:
//   browse  — every dated session (+ trips) on the calendar; click for details
//   enroll  — ?course=<slug>: pick one session per required slot, then check out
let view = new Date(); view.setDate(1);
let allSessions = [], allTrips = [];
const params = new URLSearchParams(location.search);
const enrollSlug = params.get('course') || '';
let filterKind = params.get('kind') || 'all';    // all | sessions | trips
let filterType = '';                              // session type slug (browse filter)
let course = null;                                // the course being enrolled in (enroll mode)
let requiredByType = {};                          // {typeSlug: count} from the recipe
let selected = {};                                // {typeSlug: [sessionId,...]} capped at required

const iso = d => d.toISOString().slice(0, 10);
const sName = s => s.title || s.type_name;
const enrollMode = () => !!course;

async function loadData() {
  const from = new Date(); from.setMonth(from.getMonth() - 1);
  const to = new Date(); to.setMonth(to.getMonth() + 9);
  const sessUrl = `/api/sessions?from=${iso(from)}&to=${iso(to)}${enrollSlug ? `&course=${encodeURIComponent(enrollSlug)}` : ''}`;
  [allSessions, allTrips] = await Promise.all([api(sessUrl), api('/api/trips')]);

  if (enrollSlug) {
    const courses = await api('/api/courses');
    course = courses.find(c => c.slug === enrollSlug) || null;
  }
  if (enrollMode()) {
    document.body.classList.add('enrolling');
    requiredByType = {};
    course.slots.forEach(sl => { requiredByType[sl.type_slug] = (requiredByType[sl.type_slug] || 0) + 1; });
    course.slots.forEach(sl => { selected[sl.type_slug] = selected[sl.type_slug] || []; });
    $('#cal-hero-title').textContent = `Enroll — ${course.name}`;
    $('#cal-hero-sub').textContent = 'Pick a date for each required session below, then continue to sign up.';
    $('#browse-filters').style.display = 'none';
    $('#enroll-panel').style.display = '';
    renderBundles();
  } else {
    // browse: a session-type filter
    const types = await api('/api/session-types');
    $('#type-filter').innerHTML = '<option value="">All session types</option>' +
      types.map(t => `<option value="${t.slug}">${esc(t.name)}</option>`).join('');
    $('#kind-filter').value = filterKind;
  }
}

async function renderBundles() {
  let bundles = [];
  try { bundles = await api(`/api/courses/${course.id}/bundles`); } catch {}
  if (!bundles.length) { $('#bundle-row').innerHTML = ''; return; }
  $('#bundle-row').innerHTML = `<div class="det" style="margin-bottom:6px;font-weight:700">Or grab a ready-made group:</div>` +
    bundles.map(b => `<button class="btn btn-sm btn-ghost" data-bundle="${b.id}" style="margin:0 6px 6px 0">${
      esc(b.name)} — ${b.sessions.map(s => fmtDate(s.session_date.slice(0,10), { month:'short', day:'numeric' })).join(', ')}</button>`).join('');
  $$('#bundle-row [data-bundle]').forEach(btn => btn.addEventListener('click', () => {
    const b = bundles.find(x => x.id === +btn.dataset.bundle);
    // apply the bundle's sessions into the selection
    Object.keys(selected).forEach(k => selected[k] = []);
    b.sessions.forEach(s => { (selected[s.type_slug] ||= []).push(s.session_id); });
    render();
  }));
}

// events for a given day
function items() {
  let list = [];
  if (filterKind !== 'trips') {
    const cs = filterType ? allSessions.filter(s => s.type_slug === filterType) : allSessions;
    list = list.concat(cs.map(s => ({
      kind: 'session', id: s.id, ref: s, name: sName(s), typeSlug: s.type_slug,
      sd: s.session_date.slice(0, 10), full: s.enrolled >= s.capacity,
    })));
  }
  if (!enrollMode() && filterKind !== 'sessions') {
    list = list.concat(allTrips.map(t => ({
      kind: 'trip', id: t.id, ref: t, name: t.title,
      sd: t.start_date.slice(0, 10), ed: t.end_date.slice(0, 10),
      full: t.spots_taken >= t.spots_total,
    })));
  }
  return list;
}

const isPicked = s => (selected[s.type_slug] || []).includes(s.id);

function render() {
  const y = view.getFullYear(), m = view.getMonth();
  const monthName = view.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  $('#cal-title').textContent = monthName;
  $('#list-title').textContent = enrollMode() ? `Available sessions in ${monthName}` : `In ${monthName}`;

  const first = new Date(y, m, 1);
  const gridStart = new Date(y, m, 1 - first.getDay());
  const todayIso = iso(new Date());
  const cells = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div class="cal-dow">${d}</div>`);

  const list = items();
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i);
    const dIso = iso(d);
    const dim = d.getMonth() !== m ? 'dim' : '';
    const today = dIso === todayIso ? 'today' : '';
    const evts = list.filter(it => {
      if (it.sd === dIso) return true;
      if (it.kind !== 'trip') return false;
      const span = (new Date(it.ed) - new Date(it.sd)) / 86400000;
      return it.sd < dIso && it.ed >= dIso && span <= 4;
    });
    const html = evts.map(it => {
      const picked = it.kind === 'session' && enrollMode() && isPicked(it.ref);
      return `<button class="cal-evt ${it.kind === 'trip' ? 'trip' : ''} ${it.full && !picked ? 'full' : ''} ${picked ? 'picked' : ''}"
        data-kind="${it.kind}" data-id="${it.id}" title="${esc(it.name)}">${picked ? '✓ ' : ''}${esc(it.name)}</button>`;
    }).join('');
    cells.push(`<div class="cal-cell ${dim} ${today}"><span class="dnum">${d.getDate()}</span>${html}</div>`);
  }
  $('#cal-grid').innerHTML = cells.join('');

  const inMonth = list.filter(it => {
    const sd = new Date(it.sd + 'T12:00:00');
    return sd.getFullYear() === y && sd.getMonth() === m;
  }).sort((a, b) => a.sd < b.sd ? -1 : 1);
  $('#session-list').innerHTML = inMonth.length
    ? inMonth.map(it => it.kind === 'session' ? sessionRow(it.ref) : tripRow(it.ref)).join('')
    : `<p style="color:var(--ink-soft)">Nothing scheduled this month. Try the next month →</p>`;

  $$('#cal-grid .cal-evt, #session-list [data-id]').forEach(el =>
    el.addEventListener('click', () => onEventClick(el.dataset.kind, +el.dataset.id)));

  if (enrollMode()) renderSelection();
}

function dateBadge(dIso) {
  return `<div class="session-date">
    <span class="mon">${fmtDate(dIso, { month: 'short' }).toUpperCase()}</span>
    <span class="day">${new Date(dIso + 'T12:00:00').getDate()}</span></div>`;
}

function sessionRow(s) {
  const left = s.capacity - s.enrolled;
  const picked = enrollMode() && isPicked(s);
  const btn = enrollMode()
    ? `<button class="btn btn-sm ${picked ? 'btn-ghost' : 'btn-red'}" data-kind="session" data-id="${s.id}" ${left <= 0 && !picked ? 'disabled' : ''}>${
        picked ? 'Remove' : left > 0 ? 'Pick this' : 'Full'}</button>`
    : `<button class="btn btn-sm btn-ghost" data-kind="session" data-id="${s.id}">Details</button>`;
  return `
    <div class="session-row">${dateBadge(s.session_date.slice(0,10))}
      <div>
        <h3>${esc(s.title || s.type_name)} <span class="chip">${esc(s.type_name)}</span></h3>
        <div class="det">${fmtDate(s.session_date.slice(0,10), { weekday:'short', month:'long', day:'numeric' })}${
          s.start_time ? ' · ' + s.start_time : ''}${s.location ? ' · ' + esc(s.location) : ''}</div>
        <div class="seats">${left > 0 ? `${left} of ${s.capacity} spots left` : 'Full'}</div>
      </div>
      <div class="act">${btn}</div>
    </div>`;
}

function tripRow(t) {
  const left = t.spots_total - t.spots_taken;
  const sd = t.start_date.slice(0, 10), ed = t.end_date.slice(0, 10);
  return `
    <div class="session-row">${dateBadge(sd)}
      <div>
        <h3>${esc(t.title)} <span class="chip" style="background:var(--ocean);color:#fff;border-color:var(--ocean)">Trip</span></h3>
        <div class="det">${esc(t.destination)} · ${fmtRange(sd, ed)}</div>
        <div class="seats">${left > 0 ? `${left} of ${t.spots_total} spots left` : 'Sold out'} · ${
          priceLabel(t.price_cents, t.call_for_price)}${t.call_for_price ? '' : ' / diver'}</div>
      </div>
      <div class="act"><button class="btn btn-sm" style="background:var(--ocean);color:#fff" data-kind="trip" data-id="${t.id}">View Trip</button></div>
    </div>`;
}

function onEventClick(kind, id) {
  if (kind === 'trip') return openTrip(id);
  const s = allSessions.find(x => x.id === id);
  if (!s) return;
  if (enrollMode()) togglePick(s);
  else openSession(s);
}

// enroll: pick/unpick a session for its slot (capped at the required count for that type)
function togglePick(s) {
  const arr = selected[s.type_slug] || (selected[s.type_slug] = []);
  const at = arr.indexOf(s.id);
  if (at >= 0) { arr.splice(at, 1); }
  else if (s.enrolled >= s.capacity) { return; }
  else if (arr.length < (requiredByType[s.type_slug] || 1)) { arr.push(s.id); }
  else { arr.shift(); arr.push(s.id); }   // replace oldest for that slot
  render();
}

// ---------- enroll selection summary + checkout ----------
function renderSelection() {
  const sel = $('#enroll-slots');
  const done = course.slots.every((sl, i) => nthSlotFilled(sl, i));
  const seen = {};
  sel.innerHTML = course.slots.map(sl => {
    const n = (seen[sl.type_slug] = (seen[sl.type_slug] || 0) + 1);
    const ids = selected[sl.type_slug] || [];
    const sid = ids[n - 1];
    const s = sid && allSessions.find(x => x.id === sid);
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)">
      <div><strong>${esc(sl.type_name)}</strong><br>
        <span class="det" style="color:${s ? 'var(--ink)' : 'var(--ink-soft)'}">${
          s ? fmtDate(s.session_date.slice(0,10), { weekday:'short', month:'short', day:'numeric' }) + (s.start_time ? ' · ' + s.start_time : '') : 'Not chosen yet'}</span></div>
      ${s ? `<span class="form-flag green" style="font-size:11px;padding:2px 7px">Chosen</span>` : `<span class="form-flag red" style="font-size:11px;padding:2px 7px">Pick one</span>`}
    </div>`;
  }).join('');
  $('#enroll-continue').disabled = !done;
  $('#enroll-continue').textContent = done ? 'Continue to sign up →' : 'Pick every session to continue';
}
function nthSlotFilled(sl, i) {
  const before = course.slots.slice(0, i).filter(x => x.type_slug === sl.type_slug).length;
  return (selected[sl.type_slug] || []).length > before;
}
const selectedSessionIds = () => Object.values(selected).flat();

// ---------- modal (session details in browse; checkout in enroll) ----------
const back = $('#modal-back');

function openSession(s) {
  $('#m-title').textContent = s.title || s.type_name;
  $('#m-sub').textContent = s.type_name + ' session';
  const left = s.capacity - s.enrolled;
  $('#m-details').innerHTML = `
    <dt>Date</dt><dd>${fmtDate(s.session_date.slice(0,10), { weekday:'long', month:'long', day:'numeric', year:'numeric' })}</dd>
    ${s.start_time ? `<dt>Time</dt><dd>${s.start_time}${s.end_time ? ' – ' + s.end_time : ''}</dd>` : ''}
    ${s.location ? `<dt>Location</dt><dd>${esc(s.location)}</dd>` : ''}
    ${s.staff?.length ? `<dt>Crew</dt><dd>${s.staff.map(p => esc(p.name)).join(', ')}</dd>` : ''}
    <dt>Spots</dt><dd>${left > 0 ? `${left} of ${s.capacity} open` : 'Full'}</dd>
    ${s.notes ? `<dt>Notes</dt><dd>${esc(s.notes)}</dd>` : ''}`;
  $('#reg-form').style.display = 'none';
  $('#trip-cta').style.display = '';
  $('#trip-cta').innerHTML = `<a class="btn btn-red" style="width:100%" href="/courses">Browse Courses to Enroll</a>
    <p style="font-size:13px;color:var(--ink-soft);margin-top:12px;text-align:center">Sessions are booked by enrolling in a course, then choosing your dates.</p>`;
  openBack();
}

function openTrip(id) {
  const t = allTrips.find(x => x.id === id);
  if (!t) return;
  const left = t.spots_total - t.spots_taken;
  $('#m-title').textContent = t.title;
  $('#m-sub').textContent = t.description;
  $('#m-details').innerHTML = `
    <dt>Destination</dt><dd>${esc(t.destination)}</dd>
    <dt>Dates</dt><dd>${fmtRange(t.start_date.slice(0,10), t.end_date.slice(0,10))}</dd>
    <dt>Price</dt><dd><strong>${priceLabel(t.price_cents, t.call_for_price)}${t.call_for_price ? '' : ' / diver'}</strong></dd>
    <dt>Spots</dt><dd>${left > 0 ? `${left} of ${t.spots_total} open` : 'Sold out'}</dd>`;
  $('#reg-form').style.display = 'none';
  $('#trip-cta').style.display = '';
  $('#trip-cta').innerHTML = `<a class="btn btn-red" style="width:100%" href="/trips">See All Trip Details</a>`;
  openBack();
}

// checkout: contact form with the selected sessions summarized
function openCheckout() {
  $('#m-title').textContent = `Enroll in ${course.name}`;
  $('#m-sub').textContent = 'Confirm your details — no payment due now.';
  const chosen = selectedSessionIds().map(id => allSessions.find(s => s.id === id)).filter(Boolean);
  $('#m-details').innerHTML = `<dt>Your sessions</dt><dd>${chosen.map(s =>
    `${esc(s.type_name)}: ${fmtDate(s.session_date.slice(0,10), { month:'short', day:'numeric' })}`).join('<br>')}</dd>`;
  $('#trip-cta').style.display = 'none';
  $('#form-msg').className = 'form-msg';
  $('#reg-form').reset();
  $('#reg-form').style.display = '';
  $('#reg-submit').textContent = 'Complete Enrollment';
  $('#reg-submit').disabled = false;
  openBack();
}

function openBack() { back.classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeModal() { back.classList.remove('open'); document.body.style.overflow = ''; }
$('#modal-close').addEventListener('click', closeModal);

$('#reg-form').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#form-msg'), btn = $('#reg-submit');
  btn.disabled = true; btn.textContent = 'Sending…';
  const data = Object.fromEntries(new FormData(e.target));
  try {
    const res = await api('/api/enrollments', {
      method: 'POST', body: { ...data, course_id: course.id, session_ids: selectedSessionIds() } });
    msg.className = 'form-msg ok';
    msg.textContent = res.message;
    $('#reg-form').style.display = 'none';
  } catch (err) {
    msg.className = 'form-msg err';
    msg.textContent = err.message;
    btn.disabled = false; btn.textContent = 'Complete Enrollment';
  }
});

// ---------- nav + filters ----------
$('#prev').addEventListener('click', () => { view.setMonth(view.getMonth() - 1); render(); });
$('#next').addEventListener('click', () => { view.setMonth(view.getMonth() + 1); render(); });
$('#today').addEventListener('click', () => { view = new Date(); view.setDate(1); render(); });
$('#kind-filter').addEventListener('change', e => { filterKind = e.target.value; render(); });
$('#type-filter').addEventListener('change', e => { filterType = e.target.value; render(); });
$('#enroll-continue').addEventListener('click', () => { if (!$('#enroll-continue').disabled) openCheckout(); });

(async () => {
  await loadData();
  // jump to the month of the earliest upcoming session so there's something to see/pick
  const upcoming = allSessions.map(s => s.session_date.slice(0, 10)).filter(d => d >= iso(new Date())).sort()[0];
  if (upcoming) { view = new Date(upcoming + 'T12:00:00'); view.setDate(1); }
  render();
})();
