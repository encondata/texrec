// TexRec shared layout + helpers
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

// escape user-supplied text before dropping it into innerHTML
const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// parse a single-line GPS string: "32.7357, -96.2153", "32.7357 -96.2153",
// "32.7357° N, 96.2153° W", "N32.73 W96.21" → {lat, lng} or null
function parseLatLng(str) {
  if (!str || !str.trim()) return null;
  const s = str.trim().toUpperCase().replace(/°/g, ' ');
  const m = s.match(/^\s*([NS])?\s*(-?\d+(?:\.\d+)?)\s*([NS])?\s*[,;\s]\s*([EW])?\s*(-?\d+(?:\.\d+)?)\s*([EW])?\s*$/);
  if (!m) return null;
  let lat = parseFloat(m[2]), lng = parseFloat(m[5]);
  const latH = m[1] || m[3], lngH = m[4] || m[6];
  if (latH === 'S') lat = -Math.abs(lat);
  if (latH === 'N') lat = Math.abs(lat);
  if (lngH === 'W') lng = -Math.abs(lng);
  if (lngH === 'E') lng = Math.abs(lng);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

// true only for real, present coordinates — beware isFinite(null) === true!
const hasCoords = (lat, lng) =>
  lat != null && lng != null && isFinite(+lat) && isFinite(+lng);

const money = cents => '$' + (cents / 100).toLocaleString('en-US', {
  minimumFractionDigits: 0, maximumFractionDigits: 0 });

// price for display: "Call for Pricing" when flagged, "Free" for a real $0,
// otherwise the dollar amount
const priceLabel = (cents, callForPrice) =>
  callForPrice ? 'Call for Pricing'
    : (cents && cents > 0) ? money(cents)
    : 'Free';

const fmtDate = (iso, opts = { month: 'short', day: 'numeric' }) =>
  new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-US', opts);

const fmtRange = (a, b) => a === b ? fmtDate(a, { month: 'long', day: 'numeric', year: 'numeric' })
  : `${fmtDate(a, { month: 'short', day: 'numeric' })} – ${fmtDate(b, { month: 'short', day: 'numeric', year: 'numeric' })}`;

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data });
  return data;
}

// ---------- header / footer ----------
function addFavicons() {
  if (document.querySelector('link[rel="icon"]')) return;
  const links = [
    ['icon', '/img/favicon-32.png', '32x32'],
    ['icon', '/img/favicon-64.png', '64x64'],
    ['apple-touch-icon', '/img/apple-touch-icon.png', '180x180'],
  ];
  for (const [rel, href, sizes] of links) {
    const l = document.createElement('link');
    l.rel = rel; l.href = href; l.type = 'image/png'; l.sizes = sizes;
    document.head.appendChild(l);
  }
}

function renderChrome() {
  addFavicons();
  const page = document.body.dataset.page || '';
  const links = [
    ['courses', 'Courses'], ['calendar', 'Calendar'], ['trips', 'Trips'],
    ['sites', 'Sites'], ['gallery', 'Gallery'],
    ['staff', 'Staff'], ['about', 'About'],
  ];
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <div class="wrap bar">
      <a class="logo" href="/">
        <img class="logo-mark" src="/img/texrec-logo.png" alt="TexRec" width="46" height="44">
        <span><span class="word">Tex<em>Rec</em></span>
        <span class="tag">Scuba Instruction · DFW</span></span>
      </a>
      <button class="nav-toggle" aria-label="Menu">☰</button>
      <nav class="main-nav">
        ${links.map(([href, label]) =>
          `<a href="/${href}" class="${page === href ? 'active' : ''}">${label}</a>`).join('')}
        <a href="/calendar" class="cta">Sign Up for a Class</a>
      </nav>
    </div>`;
  document.body.prepend(header);
  $('.nav-toggle', header).addEventListener('click', () =>
    $('.main-nav', header).classList.toggle('open'));

  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `
    <div class="flag-line"></div>
    <div class="wrap cols">
      <div>
        <a class="logo" href="/"><img class="logo-mark" src="/img/texrec-logo.png" alt="TexRec" width="42" height="40"><span class="word">Tex<em>Rec</em></span></a>
        <p style="margin-top:14px;font-size:15px;max-width:280px">
          Scuba instruction, gear, and travel for North Texas.
          Small classes, private instruction available. Train local, dive everywhere.</p>
        <p style="margin-top:10px;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:#8fa1ad">
          TDI-SDI &amp; RAID Training Facility</p>
      </div>
      <div><h4>Dive In</h4><ul>
        <li><a href="/courses">Courses</a></li>
        <li><a href="/calendar">Class Calendar</a></li>
        <li><a href="/trips">Trips</a></li>
        <li><a href="/sites">Training Sites</a></li>
        <li><a href="/gallery">Photo Gallery</a></li>
        <li><a href="/docs/dan-medical-form.pdf" target="_blank" rel="noopener">Diver Medical Form (PDF)</a></li>
      </ul></div>
      <div><h4>Company</h4><ul>
        <li><a href="/staff">Our Staff</a></li>
        <li><a href="/about">About TexRec</a></li>
        <li><a href="/account">My Account</a></li>
        <li><a href="/admin">Staff Portal</a></li>
      </ul></div>
      <div><h4>Find Us</h4><ul>
        <li>2400 Marsh Ln, Ste 120<br>Burleson, TX 76028</li>
        <li><a href="tel:+19725550163">(972) 555-0163</a></li>
        <li><a href="mailto:dive@texrec.com">dive@texrec.com</a></li>
      </ul></div>
    </div>
    <div class="wrap fine">
      <span>© ${new Date().getFullYear()} TexRec Scuba Instruction, LLC. All rights reserved.</span>
      <span>Dive flag flying since 2009 🤿</span>
    </div>`;
  document.body.append(footer);
}

// ---------- reveal on scroll (GSAP-staggered when available, IO fallback) ----------
function initReveal() {
  const els = $$('.reveal:not(.in):not([data-rvl])');
  if (!els.length) return;
  els.forEach(el => el.dataset.rvl = '1');
  if (window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
    document.body.classList.add('has-gsap');
    gsap.set(els, { opacity: 0, y: 26 });
    ScrollTrigger.batch(els, {
      start: 'top 88%', once: true,
      onEnter: batch => gsap.to(batch, {
        opacity: 1, y: 0, duration: 0.8, stagger: 0.09, ease: 'power3.out',
        onComplete: () => batch.forEach(e => e.classList.add('in')),
      }),
    });
    ScrollTrigger.refresh();
    return;
  }
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { threshold: 0.12 });
  els.forEach(el => io.observe(el));
}

renderChrome();
document.addEventListener('DOMContentLoaded', initReveal);
