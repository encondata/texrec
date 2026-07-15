// TexRec seeder — loads schema, seeds courses/trips/staff/sessions/admin.
// Usage: node server/seed.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('./db');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

const COURSES = [
  ['discover-scuba', 'Try Scuba', 'Beginner', 'SDI',
    'Never breathed underwater? Try it in one afternoon — pool session with a pro at your side.',
    'The zero-commitment intro. After a short briefing, you\'ll gear up and take your first breaths underwater in our heated indoor pool with an instructor within arm\'s reach the whole time. Counts as credit toward Open Water certification if you catch the bug (you will). Private sessions available for individuals, couples, and families.',
    'None. Ages 10+, basic swimming comfort.', 'Half day', 9900, 10],
  ['open-water', 'Open Water Diver', 'Beginner', 'SDI · RAID',
    'The certification that starts it all — knowledge, pool skills, and four open water dives.',
    'Your passport to diving anywhere in the world, certified through SDI or RAID — your choice. eLearning at your own pace, two weekends of confined-water skills in our pool, then four checkout dives at Clear Springs Scuba Park. Classes are capped at six students so your instructor actually knows your name — or go fully private and set your own schedule. Gear rental for the course is included; personal mask, fins, and snorkel required.',
    'None. Ages 10+, able to swim 200 yards and float 10 minutes.', '3 weekends', 44900, 20],
  ['advanced-open-water', 'Advanced Adventure Diver', 'Continuing', 'SDI',
    'Five adventure dives — deep and navigation required — to sharpen skills and extend your depth to 100 ft.',
    'Less classroom, more diving. You\'ll complete five adventure dives including Deep and Underwater Navigation, plus three electives like Wreck, Night, or Advanced Buoyancy. Extends your certified depth to 100 feet and is the prerequisite for most of the good stuff. Small groups only — never more than six divers per instructor.',
    'Open Water Diver.', '1 weekend', 37900, 30],
  ['rescue-diver', 'Rescue Diver', 'Continuing', 'SDI',
    'The course every diver calls their most rewarding — learn to prevent and manage problems in the water.',
    'Challenging, scenario-driven, and consistently rated the most rewarding course in diving. You\'ll learn self-rescue, recognizing stress in other divers, emergency management, and rescue scenarios that culminate in a full open-water rescue workshop. CPR/First Aid certification is bundled in.',
    'Advanced Adventure Diver + current CPR/First Aid (included).', '2 weekends', 42900, 40],
  ['enriched-air-nitrox', 'Nitrox Diver', 'Specialty', 'TDI-SDI',
    'Dive longer with enriched air — the most popular specialty in diving, done in one evening.',
    'More bottom time, shorter surface intervals. Learn to analyze your own gas, set your computer, and manage oxygen exposure for blends up to 40%. One classroom evening; no dives required. Pairs perfectly with any trip we run, and it\'s your first step toward TDI technical training if you\'re curious about what\'s deeper.',
    'Open Water Diver (or enrolled).', '1 evening', 19900, 50],
  ['divemaster', 'Divemaster', 'Professional', 'SDI',
    'Go pro. Lead certified divers, assist instructors, and join the TexRec crew.',
    'The first professional rating. Over roughly two months you\'ll intern alongside TexRec staff — mapping sites, briefing dives, assisting classes, and building leadership-level skill and stamina. Because we keep classes small, our Divemaster candidates get real one-on-one mentorship, and those who finish with us get first crack at paid crew spots on our trips.',
    'Rescue Diver, 40 logged dives, 18+, medical clearance.', '8 weeks', 89900, 60],
];

const STAFF = [
  ['Dana "Tex" Calloway', 'Owner & Instructor Trainer', 'SDI/TDI Instructor Trainer, TDI Trimix Instructor', 'Dana logged her first dive in Cozumel in 1998 and has been dragging North Texans to the water ever since. 4,000+ dives, zero plans to stop. She built TexRec on one rule: small classes, real instruction — train divers you\'d trust with your own kids.', 'DC', 'Divemaster, Rescue Diver, Nitrox, Technical & Trimix', 10],
  ['Marcus Reid', 'Lead Instructor', 'SDI Instructor, RAID Instructor, CPR/First Aid Instructor', 'Former Navy diver turned patient teacher. Marcus runs most Open Water weekends and has personally certified over 900 divers. Famous for his pre-dive briefings and his brisket.', 'MR', 'Open Water, Advanced Adventure, Try Scuba', 20],
  ['Sofia Herrera', 'Instructor & Trip Coordinator', 'SDI Instructor, Nitrox Instructor', 'Sofia plans every TexRec trip down to the surface interval snacks. She also runs most of our private and family classes. Ask her about the Flower Garden Banks — but only if you have twenty minutes.', 'SH', 'Open Water, Nitrox, Private Classes', 30],
  ['James Okafor', 'Instructor', 'SDI Instructor, Rescue Specialist', 'James found diving through a Try Scuba class right here in 2015 and never left. He teaches Rescue like it matters — because it does.', 'JO', 'Rescue Diver, Advanced Adventure, Try Scuba', 40],
  ['Katie Lindqvist', 'Divemaster & Retail Lead', 'SDI Divemaster', 'Katie fits every mask in the shop and remembers every student\'s name. Working toward her instructor rating this fall.', 'KL', 'Assists all pool sessions', 50],
];

const TRIPS = [
  ['Cozumel Reef Week', 'Cozumel, Mexico', '2026-09-12', '2026-09-19', 189500, 16,
    'Seven nights at a dive-dedicated resort on the west shore. Two-tank boat dives daily on Palancar, Columbia, and Santa Rosa Wall — drift diving at its absolute best. Price includes lodging, 10 boat dives, breakfast, and airport transfers. Airfare not included.'],
  ['Flower Garden Banks Liveaboard', 'Gulf of Mexico, TX', '2026-08-14', '2026-08-16', 82500, 12,
    'The best diving in Texas isn\'t in a lake — it\'s 100 miles offshore. Weekend liveaboard to the Flower Garden Banks National Marine Sanctuary: manta rays, whale sharks (if you\'re lucky), and coral cover that rivals the Caribbean. AOW + 20 logged dives required.'],
  ['Blue Lagoon Fun Weekend', 'Huntsville, TX', '2026-07-25', '2026-07-26', 14500, 24,
    'Low-key weekend at Blue Lagoon\'s spring-fed quarry. Two guided fun dives Saturday, night dive option, camping on site. Perfect first trip for new Open Water grads — staff dives with every group.'],
  ['Bonaire Shore Diving Blitz', 'Bonaire, Dutch Caribbean', '2026-11-07', '2026-11-14', 214500, 14,
    'Truck, tanks, and total freedom. A week of unlimited shore diving on the easiest, healthiest reef system in the Caribbean. We handle lodging, truck rentals, unlimited air/nitrox, and a group boat day to Klein Bonaire.'],
];

const SITES = [
  ['TexRec HQ & Indoor Pool', 'Burleson, TX', 'Our home base: heated indoor training pool, classroom, and full retail counter. Every confined-water session happens here — 92°F water, 12-foot deep end, zero algae.', 'https://texrec.com', 'Gear Rental, Air Fills, Nitrox Fills, Retail Shop, Classroom', 32.9537, -96.8903, 10],
  ['Clear Springs Scuba Park', 'Terrell, TX', 'Our go-to checkout dive site, 40 minutes east of Dallas. Spring-fed quarry with training platforms, sunken boats and a school bus, and vis that regularly hits 20+ feet.', 'https://www.csscuba.com', 'Air Fills, Gear Rental, Training Platforms, Camping, Picnic Areas', 32.7357, -96.2153, 20],
  ['Athens Scuba Park', 'Athens, TX', 'A Texas classic — 20+ sunken attractions including planes and a fire truck. We run Rescue weekends and fun dives here all season.', 'https://www.athensscubapark.com', 'Air Fills, Nitrox Fills, Gear Rental, Training Platforms, Snack Bar', 32.2124, -95.8330, 30],
  ['Blue Lagoon', 'Huntsville, TX', 'Two spring-fed quarries with white limestone bottoms and the clearest water in East Texas. Perfect first post-cert trip; we camp on site most summer weekends.', 'https://www.bluelagoonscuba.net', 'Air Fills, Camping, Kayak Rental', 30.8163, -95.4359, 40],
];

// Photos: [filename, title, description, location_name, lat, lng]
const PHOTOS = [
  ['seed-cozumel.jpg', 'Palancar Gardens Drift', 'Sofia leading the group over the swim-throughs at Palancar — 80 feet of vis and a two-knot ride.', 'Cozumel, Mexico', 20.3324, -87.0224],
  ['seed-bonaire.jpg', 'Shore Entry at 1000 Steps', 'The truck-and-tank life. Day four of the Bonaire blitz, tanks were still cold from the fill station.', 'Bonaire, Dutch Caribbean', 12.2189, -68.3245],
  ['seed-flowergardens.jpg', 'Manta at the Flower Gardens', 'A reef manta cruised the East Bank for twenty minutes during our August liveaboard. Texas diving, folks.', 'Flower Garden Banks, Gulf of Mexico', 27.9064, -93.5992],
  ['seed-clearsprings.jpg', 'Open Water Checkout Weekend', 'Marcus with the Saturday class on platform two. Fourteen new divers certified this weekend.', 'Clear Springs Scuba Park — Terrell, TX', 32.7357, -96.2153],
  ['seed-athens.jpg', 'Rescue Scenarios at Athens', 'James running the final rescue workshop — unresponsive diver tow with gear strip, full send.', 'Athens Scuba Park — Athens, TX', 32.2043, -95.8555],
  ['seed-bluelagoon.jpg', 'Night Dive at Blue Lagoon', 'Post-cert fun trip. Glow sticks on the buoy line and a very confused catfish.', 'Blue Lagoon — Huntsville, TX', 30.8163, -95.4359],
];

// Sessions: [courseSlug, startOffsetDays, lengthDays, startTime, location, capacity, notes]
const LOCATIONS = {
  shop: 'TexRec HQ — Burleson, TX',
  pool: 'TexRec Indoor Pool — Burleson, TX',
  clear: 'Clear Springs Scuba Park — Terrell, TX',
  athens: 'Athens Scuba Park — Athens, TX',
};

async function main() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);

  for (const [i, c] of COURSES.entries()) {
    await pool.query(
      `INSERT INTO courses (slug,name,level,agency,blurb,description,prerequisites,duration,price_cents,sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [...c.slice(0, 9), c[9] ?? (i + 1) * 10]
    );
  }
  for (const s of STAFF) {
    await pool.query(
      `INSERT INTO staff (name,role,certs,bio,initials,teaches,sort) VALUES ($1,$2,$3,$4,$5,$6,$7)`, s);
  }
  for (const t of TRIPS) {
    await pool.query(
      `INSERT INTO trips (title,destination,start_date,end_date,price_cents,spots_total,description)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`, t);
  }
  for (const s of SITES) {
    await pool.query(
      `INSERT INTO dive_sites (name,location,blurb,website,services,lat,lng,sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, s);
  }
  const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
  for (const [i, p] of PHOTOS.entries()) {
    if (!fs.existsSync(path.join(uploadsDir, p[0]))) continue; // skip missing seed files
    await pool.query(
      `INSERT INTO photos (filename,title,description,location_name,lat,lng,sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`, [...p, (i + 1) * 10]);
  }

  const { rows: courses } = await pool.query('SELECT id, slug FROM courses');
  const cid = Object.fromEntries(courses.map(r => [r.slug, r.id]));

  // wire up the natural progression chain
  const PROGRESSION = {
    'open-water': 'discover-scuba',
    'advanced-open-water': 'open-water',
    'enriched-air-nitrox': 'open-water',
    'rescue-diver': 'advanced-open-water',
    'divemaster': 'rescue-diver',
  };
  for (const [slug, prereqSlug] of Object.entries(PROGRESSION)) {
    await pool.query('UPDATE courses SET prereq_course_id=$1 WHERE id=$2',
      [cid[prereqSlug], cid[slug]]);
  }

  // Recurring schedule over the next ~14 weeks, anchored to upcoming Saturdays.
  const today = new Date();
  const nextSat = new Date(today);
  nextSat.setDate(today.getDate() + ((6 - today.getDay() + 7) % 7 || 7));
  const d = (base, off) => {
    const x = new Date(base); x.setDate(x.getDate() + off);
    return x.toISOString().slice(0, 10);
  };

  const sessions = [];
  for (let w = 0; w < 14; w++) {
    const sat = d(nextSat, w * 7);
    if (w % 2 === 0) sessions.push([cid['open-water'], sat, d(nextSat, w * 7 + 15), '08:00', LOCATIONS.pool, 8, 'Checkout dives on final weekend at Clear Springs.']);
    if (w % 2 === 1) sessions.push([cid['discover-scuba'], sat, sat, '13:00', LOCATIONS.pool, 10, null]);
    if (w % 3 === 0) sessions.push([cid['advanced-open-water'], sat, d(nextSat, w * 7 + 1), '08:00', LOCATIONS.clear, 8, null]);
    if (w % 4 === 1) sessions.push([cid['rescue-diver'], sat, d(nextSat, w * 7 + 8), '08:00', LOCATIONS.athens, 6, 'CPR/First Aid session Friday evening before weekend one.']);
    if (w % 3 === 2) sessions.push([cid['enriched-air-nitrox'], d(nextSat, w * 7 - 2), d(nextSat, w * 7 - 2), '18:30', LOCATIONS.shop, 12, null]);
  }
  sessions.push([cid['divemaster'], d(nextSat, 14), d(nextSat, 14 + 56), '09:00', LOCATIONS.shop, 4, 'Kickoff meeting at HQ; schedule set with candidates.']);

  const { rows: staffRows } = await pool.query('SELECT id, name FROM staff ORDER BY sort');
  const instructors = staffRows.slice(0, 4);       // Dana, Marcus, Sofia, James
  const katie = staffRows[4];                      // divemaster
  for (const [i, s] of sessions.entries()) {
    const { rows: [sess] } = await pool.query(
      `INSERT INTO class_sessions (course_id,start_date,end_date,start_time,location,capacity,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, s);
    if (i % 3 === 0) continue;                     // leave some unassigned
    const crew = [[instructors[i % instructors.length].id, 'instructor']];
    if (i % 2 === 0) crew.push([katie.id, 'divemaster']);
    if (i % 5 === 0) crew.push([instructors[(i + 1) % instructors.length].id, 'instructor_trainee']);
    for (const [sid, role] of crew) {
      await pool.query(
        `INSERT INTO session_staff (session_id, staff_id, role) VALUES ($1,$2,$3)
         ON CONFLICT (session_id, staff_id) DO NOTHING`, [sess.id, sid, role]);
    }
  }

  // A few sample registrations so the admin portal isn't empty.
  const { rows: sess } = await pool.query('SELECT id FROM class_sessions ORDER BY start_date LIMIT 3');
  const regs = [
    [sess[0].id, 'Alyssa', 'Tran', 'alyssa.tran@example.com', '214-555-0142', null, 'Renting all gear', 'pending'],
    [sess[0].id, 'Ben', 'Whitfield', 'bwhitfield@example.com', '972-555-0177', null, null, 'confirmed'],
    [sess[1].id, 'Priya', 'Nair', 'priya.n@example.com', '469-555-0119', 'Open Water', 'Birthday gift from spouse', 'pending'],
  ];
  for (const r of regs) {
    // customers are auto-created from registrations, keyed by email
    const { rows: [cust] } = await pool.query(
      `INSERT INTO customers (email,first_name,last_name,phone) VALUES (lower($1),$2,$3,$4)
       ON CONFLICT (email) DO UPDATE SET phone = EXCLUDED.phone RETURNING id`,
      [r[3], r[1], r[2], r[4]]);
    await pool.query(
      `INSERT INTO registrations (session_id,customer_id,first_name,last_name,email,phone,cert_level,notes,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [r[0], cust.id, ...r.slice(1)]);
    if (r[7] === 'pending') {
      await pool.query(
        `INSERT INTO notifications (type,title,body,tab)
         VALUES ('registration',$1,$2,'regs')`,
        [`New registration: ${r[1]} ${r[2]}`,
         `${r[1]} ${r[2]} (${r[3]}) signed up for a class and is awaiting confirmation.`]);
    }
  }

  // Ben (confirmed) gets portal access, a sample cert, and a note
  await pool.query(`UPDATE customers SET password_hash=$1 WHERE email='bwhitfield@example.com'`,
    [hashPassword('benswims1')]);

  const admins = [
    ['admin@texrec.com', 'TexRec Admin', 'divesafe', 'admin', null],
    ['frontdesk@texrec.com', 'Front Desk', 'frontdesk1', 'staff', null],
    ['marcus@texrec.com', 'Marcus Reid', 'marcusdive1', 'instructor',
      staffRows.find(s => s.name === 'Marcus Reid')?.id ?? null],
  ];
  for (const [email, name, pw, role, staffId] of admins) {
    await pool.query(
      `INSERT INTO admin_users (email,name,password_hash,role,staff_id) VALUES ($1,$2,$3,$4,$5)`,
      [email, name, hashPassword(pw), role, staffId]);
  }

  const { rows: [ben] } = await pool.query(`SELECT id FROM customers WHERE email='bwhitfield@example.com'`);
  const { rows: [adminUser] } = await pool.query(`SELECT id FROM admin_users WHERE role='admin' LIMIT 1`);
  const { rows: [benReg] } = await pool.query(`SELECT session_id FROM registrations WHERE customer_id=$1`, [ben.id]);
  await pool.query(
    `INSERT INTO customer_notes (customer_id,author_id,session_id,kind,body,cert_agency,cert_number,cert_date)
     VALUES ($1,$2,$3,'certification','Certified Open Water Diver — strong skills, very comfortable in the water.','SDI','SDI-0148821','2026-05-17')`,
    [ben.id, adminUser.id, benReg.session_id]);
  await pool.query(
    `INSERT INTO customer_notes (customer_id,author_id,session_id,kind,body,visible_to_customer)
     VALUES ($1,$2,$3,'note','Interested in Advanced next — follow up after this class wraps.',false)`,
    [ben.id, adminUser.id, benReg.session_id]);

  // sample private class media for Ben's session
  const mediaDir = path.join(__dirname, '..', 'media');
  fs.mkdirSync(mediaDir, { recursive: true });
  const sampleSrc = path.join(__dirname, '..', 'public', 'uploads', 'seed-clearsprings.jpg');
  if (fs.existsSync(sampleSrc)) {
    fs.copyFileSync(sampleSrc, path.join(mediaDir, 'seed-class-photo.jpg'));
    await pool.query(
      `INSERT INTO session_media (session_id,filename,original_name,mime,title,uploaded_by)
       VALUES ($1,'seed-class-photo.jpg','pool-day.jpg','image/jpeg','Pool day — skills session',$2)`,
      [benReg.session_id, adminUser.id]);
  }

  const counts = await pool.query(`SELECT
    (SELECT count(*) FROM courses) courses, (SELECT count(*) FROM staff) staff,
    (SELECT count(*) FROM trips) trips, (SELECT count(*) FROM class_sessions) sessions,
    (SELECT count(*) FROM registrations) registrations`);
  console.log('Seeded:', counts.rows[0]);
  console.log('Admin login: admin@texrec.com / divesafe');
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
