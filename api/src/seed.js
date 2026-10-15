import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from './db.js';
import { hashPassword } from './lib/crypto.js';
import { storeImage } from './lib/storage.js';
import { setContent } from './lib/content.js';

// sample photos cropped from the pitch deck (src/seed-images); any of them can be replaced from the admin
const imagesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'seed-images');
async function photo(prefix, name, fallbackLabel, i) {
  try {
    const buf = await readFile(path.join(imagesDir, `${name}.webp`));
    return (await storeImage(prefix, buf, 'image/webp')).key;
  } catch {
    return placeholder(prefix, fallbackLabel, i);
  }
}

// Demo logins (SEED_DEMO=1 only):
//   staff    jason@ / sarah@ / mike@ / emily@texrec.com      password: Staff12345!
//   students alex@ / maria@ / chris@ / dana@ / sam@example.com  password: Student12345!
//   admin    BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD from .env (new password required on first sign-in)
//
// Demo content so a fresh install looks like a real site. Only runs on an empty database
// when SEED_DEMO=1. Images are generated gradients — replace them from the admin portal.

const palettes = [['#06263f', '#0f5e8c'], ['#041c2c', '#1b6f9c'], ['#0a3d5c', '#15a5c8'], ['#082f49', '#0a7fb0'], ['#0d3b4f', '#2bb3d9']];

async function placeholder(prefix, label, i, w = 1600, h = 1000) {
  const [a, b] = palettes[i % palettes.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    ${Array.from({ length: 14 }, (_, k) => `<circle cx="${(k * 137) % w}" cy="${h - ((k * 211) % h)}" r="${8 + (k % 5) * 6}" fill="#fff" opacity="0.08"/>`).join('')}
    <text x="50%" y="52%" font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(w / 18)}" font-weight="700" fill="#ffffff" fill-opacity="0.85" text-anchor="middle">${label.replace(/&/g, '&amp;')}</text>
  </svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return (await storeImage(prefix, png, 'image/png')).key;
}

export async function seedDemo() {
  const agency = Object.fromEntries((await query('SELECT id, code FROM agencies')).rows.map((r) => [r.code, r.id]));

  // ---- staff ----
  const staffDefs = [
    ['Jason', 'Miller', 'Owner / Course Director', ['SDI', 'TDI', 'RAID'], ['SDI Instructor Trainer', 'TDI Advanced Trimix Instructor', 'RAID Instructor'], '20+ years of diving experience and a passion for teaching. Jason leads our training program and is known for building confident, capable divers in a supportive environment.'],
    ['Sarah', 'Collins', 'Instructor Trainer', ['SDI', 'TDI'], ['SDI Instructor Trainer', 'TDI Cave Instructor', 'TDI Wreck Instructor'], 'Technical diving specialist with a love for cave, wreck and deep diving. Sarah brings a wealth of real-world experience and a student-first approach to every course.'],
    ['Mike', 'Torres', 'Technical Instructor', ['TDI', 'RAID'], ['TDI Decompression Procedures Instructor', 'RAID Deco 40 Instructor'], 'Cave, trimix and advanced wreck training. Mike brings real-world experience and a calm, methodical approach to technical diving.'],
    ['Emily', 'Parker', 'Instructor', ['SDI', 'RAID'], ['SDI Open Water Instructor', 'RAID Instructor', 'Nitrox Instructor'], 'A passion for marine life, underwater photography and student success. Emily is where most new divers at Tex Rec take their first breath underwater.'],
  ];
  const staffIds = [];
  for (const [i, [first, last, title, agencies, certs, bio]] of staffDefs.entries()) {
    const { rows: [u] } = await query(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, phone) VALUES ($1,$2,'staff',$3,$4,'(817) 555-01${10 + i}') RETURNING id`,
      [`${first.toLowerCase()}@texrec.com`, await hashPassword('Staff12345!'), first, last]);
    const photoKey = await photo('staff', `staff-${first.toLowerCase()}`, first, i);
    await query('INSERT INTO staff_profiles (user_id, title, bio, certifications, agencies, photo_key, sort) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [u.id, title, bio, certs, agencies, photoKey, i + 1]);
    staffIds.push(u.id);
  }

  // ---- courses ----
  const courseDefs = [
    ['Open Water Scuba Diver', 'SDI', 'recreational', 'beginner', 59900, '3–4 days', 'Everything you need to get started with real scuba skills to dive with confidence.', true, 'diver-blue'],
    ['Advanced Open Water Diver', 'SDI', 'recreational', 'intermediate', 49900, '2–4 days', 'Expand your skills and experience with advanced diving techniques.', true, 'diver-reef'],
    ['Rescue Diver', 'SDI', 'recreational', 'intermediate', 49900, '3 days', 'Learn to prevent and manage dive emergencies.', false, 'divers-group'],
    ['Divemaster', 'SDI', 'professional', 'professional', 129900, '4–8 weeks', 'Take the next step and lead.', false, 'diver-header'],
    ['Nitrox Diver', 'SDI', 'specialty', 'beginner', 24900, '1 day', 'Extend your bottom time and dive safer.', true, 'diver-cave'],
    ['Decompression Procedures', 'TDI', 'technical', 'technical', 79900, '4 days', 'Learn advanced decompression theory and techniques.', false, 'wreck'],
    ['Intro to Cave', 'TDI', 'technical', 'technical', 109900, '4–5 days', 'Begin your cave diving journey with world-class training.', false, 'cave-light'],
    ['Intro to Tech', 'TDI', 'technical', 'intermediate', 39900, '2 days', 'Your first step into technical diving equipment and skills.', true, 'cave-diver'],
    ['RAID Open Water 20', 'RAID', 'recreational', 'beginner', 59900, '3–4 days', 'An alternative path to certification with RAID.', false, 'turtle-2'],
  ];
  const courseIds = {};
  for (const [i, [name, ag, category, level, price, duration, summary, featured, img]] of courseDefs.entries()) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const image = await photo('courses', img, name, i);
    const { rows: [c] } = await query(
      `INSERT INTO courses (slug, name, agency_id, category, level, price_cents, duration, summary, description, prerequisites, outcomes, faq, image_key, featured, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [slug, name, agency[ag], category, level, price, duration, summary,
        `The ${ag} ${name} course helps you build experience and confidence through a series of training dives. You'll try new skills, improve your technique, and become a more capable and comfortable diver.\n\n**Every class is capped at six students per instructor**, and this course is also available as a private class — ask us about scheduling.`,
        level === 'beginner' ? '- Minimum age 10 (junior) / 15 (full certification)\n- Able to swim\n- Medical statement' : `- ${ag} Open Water Diver (or equivalent)\n- Minimum age 15\n- Medical statement`,
        '- Dive planning and buddy procedures\n- Buoyancy and trim\n- Equipment configuration\n- Emergency procedures\n- Real open-water dives with your instructor',
        JSON.stringify([{ q: 'What gear do I need?', a: 'Mask, fins, snorkel and boots. Everything else is included in the class price.' }, { q: 'Can I do this as a private class?', a: 'Yes — every course we teach can be scheduled privately. Contact the shop for dates.' }]),
        image, featured, i + 1]);
    courseIds[name] = c.id;
  }

  // ---- dive sites ----
  const sites = [
    ['Lake Granbury', 'Granbury, TX', 'beginner', 'Our go-to local training lake, 45 minutes from the shop.', 'divers-group'],
    ['Clear Springs Scuba Park', 'Terrell, TX', 'beginner', 'Spring-fed quarry with platforms, sunken boats and a bus.', 'wreck-wide'],
    ['Lake Travis', 'Austin, TX', 'intermediate', 'Deep, clear water and great for advanced and tech training.', 'cave-light'],
    ['Flower Garden Banks', 'Gulf of Mexico', 'advanced', 'Blue-water reef diving 100 miles off Galveston. Annual trip.', 'boat'],
  ];
  const siteIds = [];
  for (const [i, [name, location, difficulty, description, img]] of sites.entries()) {
    const { rows: [s] } = await query(
      'INSERT INTO dive_sites (slug, name, location, description, difficulty, image_key, sort) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, location, description, difficulty, await photo('sites', img, name, i + 2), i + 1]);
    siteIds.push(s.id);
  }

  // ---- events over the next ~10 weeks ----
  const day = (n, h = 8) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, 0, 0, 0); return d; };
  const end = (d, h = 17) => { const e = new Date(d); e.setHours(h, 0, 0, 0); return e; };
  const evDefs = [
    [4, 'class', 'Open Water Scuba Diver', 0, 6, [3, 0]],
    [6, 'training_dive', null, 0, 8, [0], 'Lake Granbury Training Dive'],
    [11, 'class', 'Advanced Open Water Diver', 2, 6, [0, 1]],
    [15, 'pool_session', null, null, 8, [3], 'Pool Session — Skills Refresher'],
    [19, 'class', 'Nitrox Diver', null, 4, [3]],
    [25, 'class', 'Rescue Diver', 1, 6, [1]],
    [32, 'class', 'Advanced Open Water Diver', 2, 6, [0, 1]],
    [38, 'dive_trip', null, 3, 12, [0, 2], 'Flower Garden Banks Weekend'],
    [45, 'class', 'Intro to Tech', 2, 4, [2]],
    [52, 'class', 'Open Water Scuba Diver', 0, 6, [3]],
    [60, 'class', 'Decompression Procedures', 2, 4, [2, 1]],
    [67, 'training_dive', null, 1, 8, [3, 0], 'Clear Springs Fun Dive'],
  ];
  const eventIds = [];
  for (const [offset, type, courseName, siteIdx, capacity, instr, title] of evDefs) {
    const start = day(offset);
    const { rows: [e] } = await query(
      `INSERT INTO events (type, course_id, dive_site_id, title, description, location, starts_at, ends_at, capacity, price_cents)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [type, courseName ? courseIds[courseName] : null, siteIdx === null ? null : siteIds[siteIdx], title || courseName,
        type === 'dive_trip' ? 'Two days of blue-water diving. Boat, tanks and weights included; bring your own gear or rent from the shop.' : 'Meet at the shop at 8:00 AM. Bring your mask, fins, snorkel and a towel.',
        siteIdx === null ? 'Tex Rec Pool, Burleson, TX' : sites[siteIdx][1], start, end(type === 'dive_trip' ? day(offset + 1) : start), capacity,
        type === 'dive_trip' ? 89900 : type === 'training_dive' ? 4900 : type === 'pool_session' ? 2500 : null]);
    for (const k of instr) await query('INSERT INTO event_instructors (event_id, user_id) VALUES ($1,$2)', [e.id, staffIds[k]]);
    eventIds.push(e.id);
  }

  // ---- demo students with a few enrollments ----
  const students = [['Alex', 'Johnson'], ['Maria', 'Gomez'], ['Chris', 'Lee'], ['Dana', 'Patel'], ['Sam', 'Nguyen']];
  const studentIds = [];
  for (const [first, last] of students) {
    const { rows: [u] } = await query(
      `INSERT INTO users (email, password_hash, role, first_name, last_name) VALUES ($1,$2,'student',$3,$4) RETURNING id`,
      [`${first.toLowerCase()}@example.com`, await hashPassword('Student12345!'), first, last]);
    studentIds.push(u.id);
  }
  const enroll = async (ev, st, status = 'reserved') => query(
    `INSERT INTO enrollments (event_id, user_id, status, amount_cents) SELECT $1,$2,$3, COALESCE(e.price_cents, c.price_cents, 0) FROM events e LEFT JOIN courses c ON c.id=e.course_id WHERE e.id=$1`,
    [eventIds[ev], studentIds[st], status]);
  await enroll(0, 0); await enroll(0, 1); await enroll(0, 2);
  await enroll(2, 0); await enroll(2, 3); await enroll(2, 4); await enroll(2, 1);
  await enroll(4, 0); await enroll(4, 2); await enroll(4, 3); await enroll(4, 4); await enroll(4, 1, 'waitlisted'); await enroll(5, 0);
  await enroll(7, 1); await enroll(7, 2);
  await query(`INSERT INTO certifications (user_id, name, agency_id, issued_on, status) VALUES ($1,'Open Water Scuba Diver',$2,'2024-04-12','issued'), ($1,'Enriched Air Nitrox',$2,'2024-08-03','issued'), ($1,'Advanced Open Water Diver',$2,NULL,'in_progress')`, [studentIds[0], agency.SDI]);
  for (let i = 0; i < 12; i++) {
    await query('INSERT INTO dive_logs (user_id, dove_on, site, max_depth_ft, duration_min, notes) VALUES ($1, now()::date - ($2 * 9), $3, $4, $5, $6)',
      [studentIds[0], i, sites[i % 3][0], 30 + (i % 4) * 12, 35 + (i % 5) * 5, i % 3 ? '' : 'Great viz today.']);
  }

  // ---- posts ----
  const posts = [
    ['5 Tips for Better Buoyancy', 'training_tips', 'Mastering buoyancy will make you a more confident, relaxed diver and open the door to incredible underwater experiences.',
      '## 1. Weight yourself properly\n\nMost new divers carry too much lead. Do a proper weight check at the end of every dive.\n\n## 2. Breathe slowly\n\nYour lungs are your fine-tuning BCD.\n\n## 3. Trim matters\n\nA horizontal body position means less drag and better control.\n\n## 4. Slow down\n\nSpeed is the enemy of control.\n\n## 5. Practice\n\nJoin one of our pool sessions and work on hovering with an instructor.', 0],
    ['Our Trip to Cozumel', 'trip_reports', 'Crystal clear water, amazing wildlife, and an unforgettable group trip.',
      'Twelve Tex Rec divers spent five days on the reefs of Cozumel. Drift dives along Palancar, eagle rays at Santa Rosa Wall and a night dive to remember.\n\nOur next international trip is being planned now — watch the calendar.', 1],
    ['New Class Schedule', 'news', 'Check out our latest offerings and dates for upcoming classes.',
      'The spring schedule is live on the [calendar](/calendar). Open Water, Advanced, Nitrox and our first Intro to Tech class of the year are all open for enrollment.\n\nRemember: every class is capped at six students per instructor, so grab your spot early.', 2],
    ['Choosing Your First Regulator', 'equipment', 'What matters, what doesn\'t, and what we recommend for North Texas diving.',
      'Cold-water rated, environmentally sealed first stages are worth it for Texas lake diving in the winter. Come by the shop and try a few on a tank before you buy.', 3],
  ];
  const postImages = ['diver-reef', 'turtle', 'boat', 'regulator'];
  for (const [i, [title, category, excerpt, body, daysAgo]] of posts.entries()) {
    await query(
      `INSERT INTO posts (slug, title, category, excerpt, body, cover_key, author_id, published_at) VALUES ($1,$2,$3,$4,$5,$6,$7, now() - ($8::int * interval '9 days'))`,
      [title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), title, category, excerpt, body, await photo('posts', postImages[i], title, i + 1), staffIds[i % 2], daysAgo]);
  }

  // ---- gallery ----
  const gallery = [
    ['Open Water Class — Lake Granbury', 'classes', 'divers-group'], ['Sea Turtle, Cozumel', 'travel', 'turtle'], ['Wreck Dive', 'dive_sites', 'wreck'],
    ['Reef Life', 'travel', 'reef-fish'], ['Cavern Light', 'dive_sites', 'cave-light'], ['Flower Gardens Trip', 'travel', 'boat'],
    ['Hawksbill', 'travel', 'turtle-2'], ['Intro to Cave', 'classes', 'cave-diver'], ['Descent', 'classes', 'diver-cave'],
    ['Pool Session — Mask Skills', 'classes', 'pool-session'], ['The Shop', 'other', 'shop-exterior'],
  ];
  for (const [i, [title, album, img]] of gallery.entries()) {
    const key = await photo('media', img, title, i + 3);
    await query(`INSERT INTO media (key, mime, title, album, sort) VALUES ($1,'image/webp',$2,$3,$4)`, [key, title, album, i]);
  }

  // ---- site imagery (editable under Admin → Site Content) ----
  await setContent('home.hero.image', await photo('content', 'hero-wide', 'Tex Rec', 0));
  await setContent('home.nextEvent.image', await photo('content', 'boat', 'Next event', 1));
  await setContent('home.cta.image', await photo('content', 'diver-cave', 'Dive', 2));
  await setContent('about.image', await photo('content', 'shop-exterior', 'About', 3));
}
