// TexRec gallery — cycling carousel + Leaflet dive map with photo pins
let photos = [];
let slide = 0;
let autoTimer = null;

const photoUrl = f => `/uploads/${encodeURIComponent(f)}`;
const metaLine = p => [p.location_name, p.taken_at ? fmtDate(p.taken_at.slice(0, 10), { month: 'long', day: 'numeric', year: 'numeric' }) : null]
  .filter(Boolean).map(esc).join(' · ');

// ---------- carousel ----------
function renderCarousel() {
  const track = $('#c-track');
  track.innerHTML = photos.map((p, i) => `
    <figure class="c-slide" data-i="${i}">
      <img src="${photoUrl(p.filename)}" alt="${esc(p.title)}" loading="${i ? 'lazy' : 'eager'}">
      <figcaption>
        <h3>${esc(p.title)}</h3>
        <div class="c-meta">${metaLine(p)}</div>
        ${p.description ? `<p>${esc(p.description)}</p>` : ''}
      </figcaption>
    </figure>`).join('');
  $('#c-dots').innerHTML = photos.map((_, i) =>
    `<button data-dot="${i}" aria-label="Photo ${i + 1}"></button>`).join('');
  $$('#c-dots [data-dot]').forEach(d =>
    d.addEventListener('click', () => { goTo(+d.dataset.dot); restartAuto(); }));
  $$('.c-slide').forEach(s => s.addEventListener('click', () => openPhoto(+s.dataset.i)));
  goTo(0);
}

function goTo(i) {
  slide = (i + photos.length) % photos.length;
  $('#c-track').style.transform = `translateX(-${slide * 100}%)`;
  $$('#c-dots button').forEach((d, j) => d.classList.toggle('on', j === slide));
}

function restartAuto() {
  clearInterval(autoTimer);
  autoTimer = setInterval(() => goTo(slide + 1), 5000);
}

$('#c-prev').addEventListener('click', () => { goTo(slide - 1); restartAuto(); });
$('#c-next').addEventListener('click', () => { goTo(slide + 1); restartAuto(); });

// ---------- map ----------
function renderMap() {
  const withGps = photos.filter(p => hasCoords(p.lat, p.lng));
  const map = L.map('dive-map', { scrollWheelZoom: false, worldCopyJump: true });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 18,
  }).addTo(map);

  const markers = withGps.map(p => {
    const icon = L.divIcon({
      className: 'photo-pin',
      html: `<img src="${photoUrl(p.filename)}" alt="">`,
      iconSize: [46, 46], iconAnchor: [23, 23],
    });
    const m = L.marker([p.lat, p.lng], { icon }).addTo(map);
    m.bindTooltip(`
      <div class="pin-preview">
        <img src="${photoUrl(p.filename)}" alt="">
        <div class="pp-body">
          <strong>${esc(p.title)}</strong>
          <span>${metaLine(p)}</span>
        </div>
      </div>`, { direction: 'top', offset: [0, -26], opacity: 1 });
    m.on('click', () => openPhoto(photos.indexOf(p)));
    return m;
  });

  if (markers.length) {
    const bounds = L.featureGroup(markers).getBounds().pad(0.25);
    map.fitBounds(bounds, { maxZoom: 6 });
    // Leaflet never re-measures its container — refit whenever the layout resizes
    new ResizeObserver(() => {
      map.invalidateSize();
      map.fitBounds(bounds, { maxZoom: 6 });
    }).observe($('#dive-map'));
  } else {
    map.setView([25, -60], 3);
  }
}

// ---------- modal ----------
const back = $('#photo-back');
function openPhoto(i) {
  const p = photos[i];
  if (!p) return;
  $('#pm-img').src = photoUrl(p.filename);
  $('#pm-img').alt = p.title;
  $('#pm-title').textContent = p.title;
  $('#pm-meta').innerHTML = metaLine(p) +
    (hasCoords(p.lat, p.lng) ? ` · <span class="coords">${(+p.lat).toFixed(4)}, ${(+p.lng).toFixed(4)}</span>` : '');
  $('#pm-desc').textContent = p.description || '';
  back.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closePhoto() {
  back.classList.remove('open');
  document.body.style.overflow = '';
}
$('#photo-close').addEventListener('click', closePhoto);
back.addEventListener('click', e => { if (e.target === back) closePhoto(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePhoto(); });

// ---------- init ----------
(async () => {
  photos = await api('/api/photos');
  if (!photos.length) {
    $('#carousel').innerHTML = '<p style="text-align:center;color:var(--ink-soft);padding:60px">No photos yet — check back after our next trip!</p>';
    $('#dive-map').style.display = 'none';
    return;
  }
  renderCarousel();
  renderMap();
  restartAuto();
})();
