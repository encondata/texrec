const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const exifr = require('exifr');
const { pool } = require('./db');

const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');
const MEDIA_DIR = path.join(__dirname, '..', 'media'); // NOT under public — access is permission-checked
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(MEDIA_DIR, { recursive: true });

const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: MEDIA_DIR,
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '').toLowerCase().slice(0, 8);
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    cb(null, /^(image\/(jpe?g|png|webp|heic|heif|gif)|application\/pdf)$/i.test(file.mimetype)),
});
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    cb(null, /^image\/(jpe?g|png|webp|heic|heif)$/i.test(file.mimetype)),
});

const app = express();
const PORT = +(process.env.PORT || 3000);

// session lifetimes (configurable via env; sane fallbacks if unset/invalid)
const ADMIN_TOKEN_HOURS = Math.max(1, +process.env.ADMIN_TOKEN_HOURS || 12);
const CUSTOMER_TOKEN_DAYS = Math.max(1, +process.env.CUSTOMER_TOKEN_DAYS || 7);

// CORS: origins come from CORS_ORIGIN (comma-separated list, or * for dev).
// e.g. CORS_ORIGIN=https://texrec.com,https://www.texrec.com
const CORS_ORIGINS = (process.env.CORS_ORIGIN || '*')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (CORS_ORIGINS.includes('*')) {
    res.header('Access-Control-Allow-Origin', '*');
  } else if (origin && CORS_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  }
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- helpers ----------
function verifyPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(pw, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}

async function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const { rows } = await pool.query(
    `SELECT a.id, a.email, a.name, a.role, a.staff_id FROM admin_tokens t
     JOIN admin_users a ON a.id = t.admin_id
     WHERE t.token = $1 AND t.expires_at > now()`, [token]);
  if (!rows.length) return res.status(401).json({ error: 'Session expired' });
  req.admin = rows[0];
  next();
}

// role gate — use after requireAdmin. superadmin passes every gate;
// allow('superadmin') therefore means superadmin ONLY.
const allow = (...roles) => (req, res, next) =>
  (req.admin.role === 'superadmin' || roles.includes(req.admin.role)) ? next()
    : res.status(403).json({ error: 'Your role does not have access to this.' });

// instructors only see sessions they are assigned to
async function instructorSessionIds(adminUser) {
  if (!adminUser.staff_id) return [];
  const { rows } = await pool.query(
    'SELECT session_id FROM session_staff WHERE staff_id = $1', [adminUser.staff_id]);
  return rows.map(r => r.session_id);
}

async function canTouchSession(adminUser, sessionId) {
  if (adminUser.role !== 'instructor') return true;
  const ids = await instructorSessionIds(adminUser);
  return ids.includes(+sessionId);
}

async function requireCustomer(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const { rows } = await pool.query(
    `SELECT c.id, c.email, c.first_name, c.last_name, c.phone,
            c.medical_date, c.medical_waiver_required, c.waiver_date
     FROM customer_tokens t
     JOIN customers c ON c.id = t.customer_id
     WHERE t.token = $1 AND t.expires_at > now()`, [token]);
  if (!rows.length) return res.status(401).json({ error: 'Session expired' });
  req.customer = rows[0];
  next();
}

const SESSION_STAFF_SQL = `
  (SELECT COALESCE(json_agg(json_build_object(
      'staff_id', ss.staff_id, 'name', st.name, 'role', ss.role)
      ORDER BY CASE ss.role WHEN 'instructor' THEN 0 WHEN 'divemaster' THEN 1 ELSE 2 END, st.name), '[]'::json)
   FROM session_staff ss JOIN staff st ON st.id = ss.staff_id
   WHERE ss.session_id = s.id) AS staff`;

const STAFF_ROLE_LABELS = {
  instructor: 'Instructor', divemaster: 'Divemaster',
  instructor_trainee: 'Instructor-in-Training', divemaster_trainee: 'DM-in-Training',
};

const wrap = fn => (req, res) => fn(req, res).catch(err => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}

const notify = (type, title, body, tab) => pool.query(
  `INSERT INTO notifications (type,title,body,tab) VALUES ($1,$2,$3,$4)`,
  [type, title, body || null, tab || null]);

// sort=99 (the form default) means "auto": append after the current highest
const SORT_TABLES = { dive_sites: true, courses: true, staff: true };
async function resolveSort(table, sort) {
  if (!SORT_TABLES[table]) throw new Error('bad sort table');
  if (sort != null && +sort !== 99) return +sort;
  const { rows: [r] } = await pool.query(`SELECT COALESCE(MAX(sort), 0) + 1 AS next FROM ${table}`);
  return r.next;
}

// force-delete confirmation: the caller must re-enter THEIR OWN password.
// Returns null if force is properly authorized, otherwise an error response.
async function checkForce(req, res) {
  if (!req.body?.force) return false;           // not a force request
  const { rows: [a] } = await pool.query(
    'SELECT password_hash FROM admin_users WHERE id=$1', [req.admin.id]);
  if (!req.body.password || !a || !verifyPassword(req.body.password, a.password_hash)) {
    res.status(401).json({ error: 'Force delete requires your password — and it didn\'t match.' });
    return null;                                  // handled (error sent)
  }
  return true;                                    // force authorized
}

// ---------- public API ----------
app.get('/api/courses', wrap(async (req, res) => {
  // Display order = position in the progression chain (prereq_course_id),
  // with `sort` breaking ties between courses at the same step.
  const { rows } = await pool.query(
    `WITH RECURSIVE chain AS (
       SELECT id, 0 AS depth FROM courses WHERE prereq_course_id IS NULL
       UNION ALL
       SELECT c.id, chain.depth + 1 FROM courses c
       JOIN chain ON c.prereq_course_id = chain.id
     )
     SELECT c.*, ch.depth,
            p.name AS prereq_course_name, p.slug AS prereq_course_slug,
            (SELECT COALESCE(json_agg(json_build_object('name', n.name, 'slug', n.slug)
                             ORDER BY n.sort), '[]'::json)
             FROM courses n WHERE n.prereq_course_id = c.id AND n.active) AS next_courses
     FROM courses c
     JOIN chain ch ON ch.id = c.id
     LEFT JOIN courses p ON p.id = c.prereq_course_id
     WHERE c.active
     ORDER BY ch.depth, c.sort`);
  res.json(rows);
}));

app.get('/api/trips', wrap(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM trips WHERE active AND end_date >= CURRENT_DATE ORDER BY start_date');
  res.json(rows);
}));

app.get('/api/staff', wrap(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id,name,role,certs,bio,initials,teaches FROM staff WHERE active ORDER BY sort');
  res.json(rows);
}));

// Sessions for the calendar. ?from=YYYY-MM-DD&to=YYYY-MM-DD (defaults: today .. +120d)
app.get('/api/sessions', wrap(async (req, res) => {
  const from = req.query.from || new Date().toISOString().slice(0, 10);
  const to = req.query.to || null;
  const { rows } = await pool.query(
    `SELECT s.id, s.title, s.start_date, s.end_date, to_char(s.start_time,'HH12:MI AM') AS start_time,
            s.location, s.capacity, s.status, s.notes,
            c.name AS course_name, c.slug AS course_slug, c.level, c.price_cents, c.call_for_price, c.duration, c.blurb,
            ${SESSION_STAFF_SQL},
            (SELECT count(*)::int FROM registrations r
              WHERE r.session_id = s.id AND r.status IN ('pending','confirmed')) AS registered
     FROM class_sessions s JOIN courses c ON c.id = s.course_id
     WHERE s.status <> 'cancelled'
       AND s.end_date >= $1::date
       AND ($2::date IS NULL OR s.start_date <= $2::date)
     ORDER BY s.start_date, s.start_time`, [from, to]);
  res.json(rows);
}));

app.post('/api/registrations', wrap(async (req, res) => {
  const { session_id, first_name, last_name, email, phone, cert_level, notes, password } = req.body || {};
  if (!session_id || !first_name?.trim() || !last_name?.trim() || !email?.trim() || !phone?.trim()) {
    return res.status(400).json({ error: 'session_id, first_name, last_name, email, and phone are required.' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  const { rows: [session] } = await pool.query(
    `SELECT s.*, c.name AS course_name,
            (SELECT count(*)::int FROM registrations r
              WHERE r.session_id = s.id AND r.status IN ('pending','confirmed')) AS registered
     FROM class_sessions s JOIN courses c ON c.id = s.course_id WHERE s.id = $1`, [session_id]);
  if (!session) return res.status(404).json({ error: 'Class not found.' });
  if (session.status === 'cancelled' || session.status === 'completed') {
    return res.status(409).json({ error: 'This class is no longer accepting registrations.' });
  }
  const { rows: [dupe] } = await pool.query(
    `SELECT 1 FROM registrations WHERE session_id=$1 AND lower(email)=lower($2) AND status IN ('pending','confirmed')`,
    [session_id, email.trim()]);
  if (dupe) return res.status(409).json({ error: 'This email is already registered for this class.' });

  const waitlisted = session.registered >= session.capacity;

  // every registration creates or updates a customer record, keyed by email
  const { rows: [customer] } = await pool.query(
    `INSERT INTO customers (email,first_name,last_name,phone) VALUES (lower($1),$2,$3,$4)
     ON CONFLICT (email) DO UPDATE SET first_name=EXCLUDED.first_name,
       last_name=EXCLUDED.last_name, phone=EXCLUDED.phone
     RETURNING id, password_hash IS NOT NULL AS has_account`,
    [email.trim(), first_name.trim(), last_name.trim(), phone.trim()]);
  let accountCreated = false;
  if (password && !customer.has_account) {
    if (password.length < 8) return res.status(400).json({ error: 'Account password must be at least 8 characters.' });
    await pool.query('UPDATE customers SET password_hash=$1 WHERE id=$2',
      [hashPassword(password), customer.id]);
    accountCreated = true;
  }

  const { rows: [reg] } = await pool.query(
    `INSERT INTO registrations (session_id,customer_id,first_name,last_name,email,phone,cert_level,notes,status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, status`,
    [session_id, customer.id, first_name.trim(), last_name.trim(), email.trim(), phone.trim(),
     cert_level || null, notes || null, waitlisted ? 'waitlist' : 'pending']);
  // best-effort: auto-schedule the student onto their class's sessions to meet the
  // course requirements. Never let this fail the registration itself.
  try { await autofillSessions(reg.id); } catch (e) { console.warn('autofill on register failed:', e.message); }
  const who = `${first_name.trim()} ${last_name.trim()}`;
  await notify(
    waitlisted ? 'waitlist' : 'registration',
    waitlisted ? `Waitlist signup: ${who}` : `New registration: ${who}`,
    `${who} (${email.trim()}, ${phone.trim()}) signed up for ${session.course_name} starting ${session.start_date}.`
      + (waitlisted ? ' The class is full — they were added to the waitlist.' : ' Awaiting confirmation.'),
    'regs');
  res.status(201).json({
    id: reg.id, status: reg.status, course_name: session.course_name,
    account_created: accountCreated,
    message: (waitlisted
      ? 'This class is full, so you\'ve been added to the waitlist. We\'ll reach out if a spot opens.'
      : 'Registration received! A TexRec team member will confirm your spot by email within one business day.')
      + (accountCreated ? ' Your TexRec account is ready — sign in any time at texrec.com/account.' : ''),
  });
}));

app.get('/api/sites', wrap(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id,name,location,blurb,website,services,difficulty,lat,lng FROM dive_sites WHERE active ORDER BY sort, id');
  res.json(rows);
}));

app.get('/api/photos', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id,filename,title,description,location_name,lat,lng,taken_at
     FROM photos WHERE active ORDER BY sort, created_at DESC`);
  res.json(rows);
}));

app.get('/api/home-stats', wrap(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id,num,suffix,label FROM home_stats WHERE active ORDER BY sort, id');
  res.json(rows);
}));

// ---------- admin API ----------
app.post('/api/admin/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
  const { rows: [admin] } = await pool.query('SELECT * FROM admin_users WHERE lower(email)=lower($1)', [email]);
  if (!admin || !verifyPassword(password, admin.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO admin_tokens (token, admin_id, expires_at) VALUES ($1,$2, now() + make_interval(hours => $3))`,
    [token, admin.id, ADMIN_TOKEN_HOURS]);
  res.json({ token, name: admin.name, email: admin.email, role: admin.role });
}));

app.post('/api/admin/logout', requireAdmin, wrap(async (req, res) => {
  await pool.query('DELETE FROM admin_tokens WHERE token=$1', [req.headers.authorization.slice(7)]);
  res.json({ ok: true });
}));

app.get('/api/admin/registrations', requireAdmin, allow('admin','staff'), wrap(async (req, res) => {
  const status = req.query.status || null;
  const { rows } = await pool.query(
    `SELECT r.*, s.start_date, s.location, s.capacity, c.name AS course_name,
            cust.medical_date, cust.medical_waiver_required, cust.waiver_date,
            (SELECT count(*)::int FROM registrations r2
              WHERE r2.session_id = s.id AND r2.status IN ('pending','confirmed')) AS session_registered
     FROM registrations r
     JOIN class_sessions s ON s.id = r.session_id
     JOIN courses c ON c.id = s.course_id
     LEFT JOIN customers cust ON cust.id = r.customer_id
     WHERE ($1::text IS NULL OR r.status = $1)
     ORDER BY (r.status='pending') DESC, s.start_date, r.created_at`, [status]);
  await attachCoursework(rows);
  res.json(rows);
}));

app.patch('/api/admin/registrations/:id', requireAdmin, allow('admin','staff'), wrap(async (req, res) => {
  const { status } = req.body || {};
  if (!['pending', 'confirmed', 'cancelled', 'waitlist'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  const { rows: [reg] } = await pool.query(
    'UPDATE registrations SET status=$1 WHERE id=$2 RETURNING *', [status, req.params.id]);
  if (!reg) return res.status(404).json({ error: 'Registration not found.' });
  res.json(reg);
}));

// verification checklist for a single registration (paid / coursework / welcome packet)
app.patch('/api/admin/registrations/:id/checklist', requireAdmin, wrap(async (req, res) => {
  const { rows: [reg] } = await pool.query('SELECT id, session_id FROM registrations WHERE id=$1', [req.params.id]);
  if (!reg) return res.status(404).json({ error: 'Registration not found.' });
  if (req.admin.role === 'instructor') {
    const ids = await instructorSessionIds(req.admin);
    if (!ids.includes(reg.session_id)) return res.status(403).json({ error: 'That class is not one of yours.' });
  }
  const sets = [], vals = [];
  for (const k of ['paid', 'coursework_complete', 'welcome_packet_sent']) {
    if (typeof req.body?.[k] === 'boolean') { vals.push(req.body[k]); sets.push(`${k}=$${vals.length}`); }
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  vals.push(req.params.id);
  const { rows: [updated] } = await pool.query(
    `UPDATE registrations SET ${sets.join(',')} WHERE id=$${vals.length}
     RETURNING id, paid, coursework_complete, welcome_packet_sent`, vals);
  res.json(updated);
}));

// ---------- admin: class "Sessions" (dated events under a class = class_meetings) ----------
app.get('/api/admin/sessions/:id/meetings', requireAdmin, allow('admin', 'staff'), wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT m.*, (SELECT count(*)::int FROM meeting_attendance a WHERE a.meeting_id = m.id) AS enrolled
     FROM class_meetings m WHERE m.session_id = $1
     ORDER BY m.meeting_date, m.start_time NULLS FIRST, m.sort, m.id`, [req.params.id]);
  res.json(rows);
}));

app.post('/api/admin/sessions/:id/meetings', requireAdmin, allow('admin', 'staff'), wrap(async (req, res) => {
  const b = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.meeting_date || '')) return res.status(400).json({ error: 'A valid date is required.' });
  const type = b.type || 'other';
  if (!SESSION_TYPE_KEYS.includes(type)) return res.status(400).json({ error: 'Invalid session type.' });
  const { rows: [m] } = await pool.query(
    `INSERT INTO class_meetings (session_id,type,title,meeting_date,start_time,location,capacity,notes,sort)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.params.id, type, b.title?.trim() || null, b.meeting_date, b.start_time || null,
     b.location?.trim() || null, Math.max(1, parseInt(b.capacity, 10) || 6),
     b.notes?.trim() || null, parseInt(b.sort, 10) || 0]);
  res.status(201).json(m);
}));

app.patch('/api/admin/meetings/:id', requireAdmin, allow('admin', 'staff'), wrap(async (req, res) => {
  const b = req.body || {};
  const sets = [], vals = [];
  for (const k of ['type', 'title', 'meeting_date', 'start_time', 'location', 'capacity', 'notes', 'sort']) {
    if (!(k in b)) continue;
    let v = b[k];
    if (k === 'type' && !SESSION_TYPE_KEYS.includes(v)) return res.status(400).json({ error: 'Invalid session type.' });
    if (k === 'capacity') v = Math.max(1, parseInt(v, 10) || 1);
    if (k === 'sort') v = parseInt(v, 10) || 0;
    if (['title', 'location', 'notes', 'start_time'].includes(k) && (v === '' || v == null)) v = null;
    vals.push(v); sets.push(`${k}=$${vals.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  vals.push(req.params.id);
  const { rows: [m] } = await pool.query(
    `UPDATE class_meetings SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals);
  if (!m) return res.status(404).json({ error: 'Session not found.' });
  res.json(m);
}));

app.delete('/api/admin/meetings/:id', requireAdmin, allow('admin', 'staff'), wrap(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM class_meetings WHERE id=$1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Session not found.' });
  res.json({ ok: true });
}));

// ---------- session scheduling / attendance / computed completion ----------
const DONE_STATUSES = ['attended', 'completed'];

// attach computed coursework_done + requirement_progress to registration rows.
// If the course has requirements, completion is derived from attendance; otherwise
// it falls back to the manual coursework_complete flag.
async function attachCoursework(regs) {
  if (!regs.length) return regs;
  const { rows } = await pool.query(
    `SELECT r.id AS reg_id, cr.session_type, cr.required_count,
            (SELECT count(*)::int FROM meeting_attendance a JOIN class_meetings m ON m.id = a.meeting_id
             WHERE a.registration_id = r.id AND m.type = cr.session_type AND a.status = ANY($2)) AS done
     FROM registrations r
     JOIN class_sessions s ON s.id = r.session_id
     JOIN course_requirements cr ON cr.course_id = s.course_id
     WHERE r.id = ANY($1)
     ORDER BY cr.sort, cr.id`, [regs.map(r => r.id), DONE_STATUSES]);
  const prog = {};
  for (const row of rows) (prog[row.reg_id] ||= []).push(
    { type: row.session_type, required: row.required_count, done: row.done });
  for (const r of regs) {
    const p = prog[r.id];
    r.requirement_progress = p || [];
    r.coursework_done = p ? p.every(x => x.done >= x.required) : !!r.coursework_complete;
  }
  return regs;
}

// auto-schedule a registration onto its own class's sessions to satisfy the course
// requirements (earliest first, respecting per-session capacity). Returns count added.
async function autofillSessions(registrationId) {
  const { rows: [reg] } = await pool.query(
    `SELECT r.id, r.session_id, s.course_id FROM registrations r
     JOIN class_sessions s ON s.id = r.session_id WHERE r.id = $1`, [registrationId]);
  if (!reg) throw new Error('Registration not found.');
  const { rows: reqs } = await pool.query(
    'SELECT session_type, required_count FROM course_requirements WHERE course_id = $1', [reg.course_id]);
  const { rows: current } = await pool.query(
    `SELECT m.type, count(*)::int AS cnt FROM meeting_attendance a
     JOIN class_meetings m ON m.id = a.meeting_id WHERE a.registration_id = $1 GROUP BY m.type`, [registrationId]);
  const have = Object.fromEntries(current.map(c => [c.type, c.cnt]));
  let added = 0;
  for (const req of reqs) {
    let need = req.required_count - (have[req.session_type] || 0);
    if (need <= 0) continue;
    const { rows: cands } = await pool.query(
      `SELECT m.id, m.capacity,
              (SELECT count(*)::int FROM meeting_attendance a WHERE a.meeting_id = m.id) AS enrolled
       FROM class_meetings m
       WHERE m.session_id = $1 AND m.type = $2
         AND NOT EXISTS (SELECT 1 FROM meeting_attendance a WHERE a.meeting_id = m.id AND a.registration_id = $3)
       ORDER BY m.meeting_date, m.start_time NULLS FIRST, m.id`,
      [reg.session_id, req.session_type, registrationId]);
    for (const c of cands) {
      if (need <= 0) break;
      if (c.enrolled >= c.capacity) continue;
      await pool.query(
        `INSERT INTO meeting_attendance (meeting_id, registration_id, status) VALUES ($1,$2,'scheduled')
         ON CONFLICT (meeting_id, registration_id) DO NOTHING`, [c.id, registrationId]);
      need--; added++;
    }
  }
  return added;
}

// a registration's scheduled sessions + candidate sessions to add (any class of same course)
async function registrationSessions(registrationId) {
  const { rows: [reg] } = await pool.query(
    `SELECT r.id, r.session_id, s.course_id FROM registrations r
     JOIN class_sessions s ON s.id = r.session_id WHERE r.id = $1`, [registrationId]);
  if (!reg) return null;
  const { rows: scheduled } = await pool.query(
    `SELECT a.id AS attendance_id, a.status, m.id AS meeting_id, m.type, m.title,
            m.meeting_date, m.start_time, m.location, cs.id AS class_id, cs.title AS class_title,
            (m.session_id = $2) AS own_class
     FROM meeting_attendance a
     JOIN class_meetings m ON m.id = a.meeting_id
     JOIN class_sessions cs ON cs.id = m.session_id
     WHERE a.registration_id = $1
     ORDER BY m.meeting_date, m.start_time NULLS FIRST`, [registrationId, reg.session_id]);
  const { rows: candidates } = await pool.query(
    `SELECT m.id AS meeting_id, m.type, m.title, m.meeting_date, m.start_time, m.location, m.capacity,
            (SELECT count(*)::int FROM meeting_attendance a WHERE a.meeting_id = m.id) AS enrolled,
            (m.session_id = $2) AS own_class, cs.title AS class_title
     FROM class_meetings m
     JOIN class_sessions cs ON cs.id = m.session_id
     WHERE cs.course_id = $3
       AND m.type IN (SELECT session_type FROM course_requirements WHERE course_id = $3)
       AND m.meeting_date >= CURRENT_DATE - 1
       AND NOT EXISTS (SELECT 1 FROM meeting_attendance a WHERE a.meeting_id = m.id AND a.registration_id = $1)
     ORDER BY own_class DESC, m.meeting_date, m.start_time NULLS FIRST`,
    [registrationId, reg.session_id, reg.course_id]);
  return { scheduled, candidates };
}

// add a session to a registration (validates same-course + capacity). Used by staff & customer.
async function addSessionToRegistration(registrationId, meetingId) {
  const { rows: [reg] } = await pool.query(
    `SELECT r.id, s.course_id FROM registrations r JOIN class_sessions s ON s.id = r.session_id WHERE r.id = $1`,
    [registrationId]);
  if (!reg) throw new Error('Registration not found.');
  const { rows: [m] } = await pool.query(
    `SELECT m.id, m.capacity, cs.course_id,
            (SELECT count(*)::int FROM meeting_attendance a WHERE a.meeting_id = m.id) AS enrolled
     FROM class_meetings m JOIN class_sessions cs ON cs.id = m.session_id WHERE m.id = $1`, [meetingId]);
  if (!m) throw new Error('Session not found.');
  if (m.course_id !== reg.course_id) throw new Error('That session belongs to a different course.');
  const { rows: [dupe] } = await pool.query(
    'SELECT 1 FROM meeting_attendance WHERE meeting_id=$1 AND registration_id=$2', [meetingId, registrationId]);
  if (dupe) return;
  if (m.enrolled >= m.capacity) throw new Error('That session is full.');
  await pool.query(
    `INSERT INTO meeting_attendance (meeting_id, registration_id, status) VALUES ($1,$2,'scheduled')`,
    [meetingId, registrationId]);
}

app.get('/api/admin/registrations/:id/sessions', requireAdmin, allow('admin', 'staff'), wrap(async (req, res) => {
  const data = await registrationSessions(+req.params.id);
  if (!data) return res.status(404).json({ error: 'Registration not found.' });
  res.json(data);
}));

app.post('/api/admin/registrations/:id/autofill', requireAdmin, allow('admin', 'staff'), wrap(async (req, res) => {
  const added = await autofillSessions(+req.params.id);
  res.json({ added, ...(await registrationSessions(+req.params.id)) });
}));

app.post('/api/admin/registrations/:id/sessions', requireAdmin, allow('admin', 'staff'), wrap(async (req, res) => {
  if (!req.body?.meeting_id) return res.status(400).json({ error: 'meeting_id is required.' });
  try { await addSessionToRegistration(+req.params.id, +req.body.meeting_id); }
  catch (e) { return res.status(400).json({ error: e.message }); }
  res.json(await registrationSessions(+req.params.id));
}));

app.patch('/api/admin/attendance/:id', requireAdmin, allow('admin', 'staff'), wrap(async (req, res) => {
  const status = req.body?.status;
  if (!['scheduled', 'attended', 'completed', 'no_show', 'excused'].includes(status)) {
    return res.status(400).json({ error: 'Invalid attendance status.' });
  }
  const { rows: [a] } = await pool.query(
    'UPDATE meeting_attendance SET status=$1 WHERE id=$2 RETURNING id, registration_id, status', [status, req.params.id]);
  if (!a) return res.status(404).json({ error: 'Attendance record not found.' });
  res.json(a);
}));

app.delete('/api/admin/attendance/:id', requireAdmin, allow('admin', 'staff'), wrap(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM meeting_attendance WHERE id=$1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Attendance record not found.' });
  res.json({ ok: true });
}));

// public: a class's session dates (for the calendar modal)
app.get('/api/sessions/:id/meetings', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, type, title, meeting_date, to_char(start_time,'HH12:MI AM') AS start_time, location
     FROM class_meetings WHERE session_id=$1
     ORDER BY meeting_date, start_time NULLS FIRST, id`, [req.params.id]);
  res.json(rows);
}));

app.get('/api/admin/sessions', requireAdmin, wrap(async (req, res) => {
  const own = req.admin.role === 'instructor' ? await instructorSessionIds(req.admin) : null;
  const { rows } = await pool.query(
    `SELECT s.*, c.name AS course_name, ${SESSION_STAFF_SQL},
            (SELECT count(*)::int FROM registrations r
              WHERE r.session_id = s.id AND r.status IN ('pending','confirmed')) AS registered
     FROM class_sessions s JOIN courses c ON c.id = s.course_id
     WHERE s.end_date >= CURRENT_DATE - 30
       AND ($1::int[] IS NULL OR s.id = ANY($1))
     ORDER BY s.start_date`, [own]);
  res.json(rows);
}));

app.post('/api/admin/sessions', requireAdmin, allow('admin', 'staff'), wrap(async (req, res) => {
  const { course_id, title, start_date, end_date, start_time, location, capacity, notes } = req.body || {};
  if (!course_id || !start_date || !location) {
    return res.status(400).json({ error: 'course_id, start_date, and location are required.' });
  }
  const { rows: [s] } = await pool.query(
    `INSERT INTO class_sessions (course_id,title,start_date,end_date,start_time,location,capacity,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [course_id, title?.trim() || null, start_date, end_date || start_date, start_time || '09:00',
     location, capacity || 8, notes || null]);
  res.status(201).json(s);
}));

app.patch('/api/admin/sessions/:id', requireAdmin, allow('admin', 'staff'), wrap(async (req, res) => {
  const allowed = ['title', 'start_date', 'end_date', 'start_time', 'location', 'capacity', 'status', 'notes'];
  const sets = [], vals = [];
  for (const k of allowed) if (k in (req.body || {})) { vals.push(req.body[k] === '' ? null : req.body[k]); sets.push(`${k}=$${vals.length}`); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  vals.push(req.params.id);
  const { rows: [s] } = await pool.query(
    `UPDATE class_sessions SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals);
  if (!s) return res.status(404).json({ error: 'Session not found.' });
  res.json(s);
}));

// assign staff to a session (multiple allowed, each with a role)
app.post('/api/admin/sessions/:id/staff', requireAdmin, allow('admin', 'staff'), wrap(async (req, res) => {
  const { staff_id, role } = req.body || {};
  if (!staff_id || !STAFF_ROLE_LABELS[role]) {
    return res.status(400).json({ error: 'staff_id and a valid role are required.' });
  }
  const { rows: [row] } = await pool.query(
    `INSERT INTO session_staff (session_id, staff_id, role) VALUES ($1,$2,$3)
     ON CONFLICT (session_id, staff_id) DO UPDATE SET role = EXCLUDED.role
     RETURNING *`, [req.params.id, staff_id, role]);
  const { rows: [info] } = await pool.query(
    `SELECT st.name AS staff_name, c.name AS course_name, s.start_date
     FROM class_sessions s JOIN courses c ON c.id = s.course_id, staff st
     WHERE s.id = $1 AND st.id = $2`, [req.params.id, staff_id]);
  if (info) await notify('assignment',
    `${info.staff_name} assigned to ${info.course_name}`,
    `${info.staff_name} joins ${info.course_name} starting ${info.start_date} as ${STAFF_ROLE_LABELS[role]}.`,
    'sessions');
  res.status(201).json(row);
}));

app.delete('/api/admin/sessions/:id/staff/:staffId', requireAdmin, allow('admin', 'staff'), wrap(async (req, res) => {
  const { rowCount } = await pool.query(
    'DELETE FROM session_staff WHERE session_id=$1 AND staff_id=$2',
    [req.params.id, req.params.staffId]);
  if (!rowCount) return res.status(404).json({ error: 'Assignment not found.' });
  res.json({ ok: true });
}));

// class roster — instructors may view rosters for their own sessions
app.get('/api/admin/sessions/:id/roster', requireAdmin, wrap(async (req, res) => {
  if (!await canTouchSession(req.admin, req.params.id)) {
    return res.status(403).json({ error: 'You are not assigned to this class.' });
  }
  const { rows } = await pool.query(
    `SELECT r.id, r.customer_id, r.first_name, r.last_name, r.email, r.phone,
            r.cert_level, r.notes, r.status, r.created_at
     FROM registrations r WHERE r.session_id = $1
     ORDER BY (r.status='confirmed') DESC, r.created_at`, [req.params.id]);
  res.json(rows);
}));

app.delete('/api/admin/sessions/:id', requireAdmin, allow('admin', 'staff'), wrap(async (req, res) => {
  const force = await checkForce(req, res);
  if (force === null) return; // wrong password, response already sent
  const { rows: [{ count }] } = await pool.query(
    `SELECT count(*)::int AS count FROM registrations WHERE session_id=$1 AND status IN ('pending','confirmed','waitlist')`,
    [req.params.id]);
  if (count > 0 && !force) {
    return res.status(409).json({
      error: `This class has ${count} registration(s). Cancel the class instead, or cancel the registrations first.`,
      code: 'force_available',
      force_hint: `Force deleting removes the class, its ${count} registration(s), crew assignments, and class files.`,
    });
  }
  const { rows: media } = await pool.query('SELECT filename FROM session_media WHERE session_id=$1', [req.params.id]);
  const { rowCount } = await pool.query('DELETE FROM class_sessions WHERE id=$1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Class not found.' });
  for (const m of media) {
    const { rows: [ref] } = await pool.query('SELECT 1 FROM session_media WHERE filename=$1 LIMIT 1', [m.filename]);
    if (!ref) fs.unlink(path.join(MEDIA_DIR, path.basename(m.filename)), () => {});
  }
  res.json({ ok: true, forced: !!force });
}));

// ---------- admin: home stats (editable homepage metric cards) ----------
app.get('/api/admin/home-stats', requireAdmin, allow('admin'), wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM home_stats ORDER BY sort, id');
  res.json(rows);
}));

app.post('/api/admin/home-stats', requireAdmin, allow('admin'), wrap(async (req, res) => {
  const { num, suffix, label, sort, active } = req.body || {};
  if (!String(num ?? '').trim() || !label?.trim()) {
    return res.status(400).json({ error: 'num and label are required.' });
  }
  const { rows: [s] } = await pool.query(
    `INSERT INTO home_stats (num,suffix,label,sort,active) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [String(num).trim(), (suffix || '').trim(), label.trim(),
     sort ?? 99, active ?? true]);
  res.status(201).json(s);
}));

app.patch('/api/admin/home-stats/:id', requireAdmin, allow('admin'), wrap(async (req, res) => {
  const allowed = ['num', 'suffix', 'label', 'sort', 'active'];
  const sets = [], vals = [];
  for (const k of allowed) if (k in (req.body || {})) { vals.push(req.body[k]); sets.push(`${k}=$${vals.length}`); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  vals.push(req.params.id);
  const { rows: [s] } = await pool.query(
    `UPDATE home_stats SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals);
  if (!s) return res.status(404).json({ error: 'Stat not found.' });
  res.json(s);
}));

app.delete('/api/admin/home-stats/:id', requireAdmin, allow('admin'), wrap(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM home_stats WHERE id=$1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Stat not found.' });
  res.json({ ok: true });
}));

// ---------- admin: trips ----------
app.get('/api/admin/trips', requireAdmin, allow('admin'), wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM trips ORDER BY start_date DESC');
  res.json(rows);
}));

app.post('/api/admin/trips', requireAdmin, allow('admin'), wrap(async (req, res) => {
  const { title, destination, start_date, end_date, price_cents, call_for_price, spots_total, spots_taken, description, active } = req.body || {};
  if (!title?.trim() || !destination?.trim() || !start_date || !end_date || !(price_cents >= 0) || !(spots_total > 0) || !description?.trim()) {
    return res.status(400).json({ error: 'title, destination, dates, price, spots, and description are required.' });
  }
  const { rows: [t] } = await pool.query(
    `INSERT INTO trips (title,destination,start_date,end_date,price_cents,call_for_price,spots_total,spots_taken,description,active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [title.trim(), destination.trim(), start_date, end_date, price_cents, !!call_for_price,
     spots_total, spots_taken ?? 0, description.trim(), active ?? true]);
  res.status(201).json(t);
}));

app.patch('/api/admin/trips/:id', requireAdmin, allow('admin'), wrap(async (req, res) => {
  const allowed = ['title', 'destination', 'start_date', 'end_date', 'price_cents', 'call_for_price', 'spots_total', 'spots_taken', 'description', 'active'];
  const sets = [], vals = [];
  for (const k of allowed) if (k in (req.body || {})) { vals.push(req.body[k] === '' ? null : req.body[k]); sets.push(`${k}=$${vals.length}`); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  vals.push(req.params.id);
  const { rows: [t] } = await pool.query(
    `UPDATE trips SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals);
  if (!t) return res.status(404).json({ error: 'Trip not found.' });
  res.json(t);
}));

app.delete('/api/admin/trips/:id', requireAdmin, allow('admin'), wrap(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM trips WHERE id=$1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Trip not found.' });
  res.json({ ok: true });
}));

// ---------- admin: notifications / inbox ----------
app.get('/api/admin/notifications', requireAdmin, wrap(async (req, res) => {
  const unackedOnly = req.query.unacked === '1';
  const { rows } = await pool.query(
    `SELECT n.*, a.name AS acked_by_name
     FROM notifications n LEFT JOIN admin_users a ON a.id = n.acked_by
     WHERE ($1::boolean = false OR n.acked_at IS NULL)
     ORDER BY (n.acked_at IS NULL) DESC, n.created_at DESC
     LIMIT 100`, [unackedOnly]);
  const { rows: [{ count }] } = await pool.query(
    `SELECT count(*)::int AS count FROM notifications WHERE acked_at IS NULL`);
  res.json({ unacked: count, notifications: rows });
}));

app.post('/api/admin/notifications/:id/ack', requireAdmin, wrap(async (req, res) => {
  const { rows: [n] } = await pool.query(
    `UPDATE notifications SET acked_by=$1, acked_at=now()
     WHERE id=$2 AND acked_at IS NULL RETURNING *`, [req.admin.id, req.params.id]);
  if (!n) return res.status(404).json({ error: 'Notification not found or already acknowledged.' });
  res.json(n);
}));

app.post('/api/admin/notifications/ack-all', requireAdmin, wrap(async (req, res) => {
  const { rowCount } = await pool.query(
    `UPDATE notifications SET acked_by=$1, acked_at=now() WHERE acked_at IS NULL`, [req.admin.id]);
  res.json({ acked: rowCount });
}));

// ---------- admin: accounts ----------
app.get('/api/admin/accounts', requireAdmin, allow('admin'), wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.id, a.email, a.name, a.role, a.staff_id, st.name AS staff_name,
            (SELECT max(t.created_at) FROM admin_tokens t WHERE t.admin_id = a.id) AS last_login
     FROM admin_users a LEFT JOIN staff st ON st.id = a.staff_id ORDER BY a.id`);
  res.json(rows);
}));

app.post('/api/admin/accounts', requireAdmin, allow('admin'), wrap(async (req, res) => {
  const { name, email, password, role, staff_id } = req.body || {};
  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'name, email, and password are required.' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (role && !['superadmin', 'admin', 'staff', 'instructor'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }
  if (role === 'superadmin' && req.admin.role !== 'superadmin') {
    return res.status(403).json({ error: 'Only a super admin can create super admin accounts.' });
  }
  if (role === 'instructor' && !staff_id) {
    return res.status(400).json({ error: 'Instructor accounts must be linked to a staff member.' });
  }
  const { rows: [dupe] } = await pool.query('SELECT 1 FROM admin_users WHERE lower(email)=lower($1)', [email.trim()]);
  if (dupe) return res.status(409).json({ error: 'An account with that email already exists.' });
  const { rows: [a] } = await pool.query(
    `INSERT INTO admin_users (email,name,password_hash,role,staff_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING id,email,name,role`,
    [email.trim().toLowerCase(), name.trim(), hashPassword(password), role || 'staff', staff_id || null]);
  await notify('system', `Portal account created: ${a.name}`,
    `${req.admin.name} created a ${a.role} account for ${a.name} <${a.email}>.`, 'accounts');
  res.status(201).json(a);
}));

app.patch('/api/admin/accounts/:id', requireAdmin, allow('admin'), wrap(async (req, res) => {
  const { name, email, password, role, staff_id } = req.body || {};
  // plain admins may not touch super admin accounts at all
  const { rows: [target] } = await pool.query('SELECT role FROM admin_users WHERE id=$1', [req.params.id]);
  if (!target) return res.status(404).json({ error: 'Account not found.' });
  if ((target.role === 'superadmin' || role === 'superadmin') && req.admin.role !== 'superadmin') {
    return res.status(403).json({ error: 'Only a super admin can manage super admin accounts.' });
  }
  const sets = [], vals = [];
  if (role) {
    if (!['superadmin', 'admin', 'staff', 'instructor'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
    if (+req.params.id === req.admin.id && !['admin', 'superadmin'].includes(role)) {
      return res.status(400).json({ error: 'You cannot demote your own account.' });
    }
    vals.push(role); sets.push(`role=$${vals.length}`);
  }
  if (staff_id !== undefined) { vals.push(staff_id || null); sets.push(`staff_id=$${vals.length}`); }
  if (name?.trim()) { vals.push(name.trim()); sets.push(`name=$${vals.length}`); }
  if (email?.trim()) {
    const { rows: [dupe] } = await pool.query(
      'SELECT 1 FROM admin_users WHERE lower(email)=lower($1) AND id<>$2', [email.trim(), req.params.id]);
    if (dupe) return res.status(409).json({ error: 'That email is already in use.' });
    vals.push(email.trim().toLowerCase()); sets.push(`email=$${vals.length}`);
  }
  if (password) {
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    vals.push(hashPassword(password)); sets.push(`password_hash=$${vals.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  vals.push(req.params.id);
  const { rows: [a] } = await pool.query(
    `UPDATE admin_users SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING id,email,name`, vals);
  if (!a) return res.status(404).json({ error: 'Account not found.' });
  if (password) { // password reset kicks that account's sessions
    await pool.query('DELETE FROM admin_tokens WHERE admin_id=$1', [a.id]);
  }
  res.json(a);
}));

app.delete('/api/admin/accounts/:id', requireAdmin, allow('admin'), wrap(async (req, res) => {
  if (+req.params.id === req.admin.id) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }
  const { rows: [target] } = await pool.query('SELECT role FROM admin_users WHERE id=$1', [req.params.id]);
  if (target?.role === 'superadmin' && req.admin.role !== 'superadmin') {
    return res.status(403).json({ error: 'Only a super admin can delete super admin accounts.' });
  }
  const { rows: [{ count }] } = await pool.query('SELECT count(*)::int AS count FROM admin_users');
  if (count <= 1) return res.status(400).json({ error: 'Cannot delete the last admin account.' });
  const { rows: [a] } = await pool.query(
    'DELETE FROM admin_users WHERE id=$1 RETURNING name,email', [req.params.id]);
  if (!a) return res.status(404).json({ error: 'Account not found.' });
  await notify('system', `Admin account removed: ${a.name}`,
    `${req.admin.name} removed the admin account for ${a.name} <${a.email}>.`, 'accounts');
  res.json({ ok: true });
}));

// ---------- admin: dive sites ----------
app.get('/api/admin/sites', requireAdmin, allow('admin'), wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM dive_sites ORDER BY sort, id');
  res.json(rows);
}));

// services: stored as text[]; accepts a JSON array or a comma-separated string
function normalizeServices(input) {
  if (Array.isArray(input)) return input.map(x => String(x).trim()).filter(Boolean);
  if (typeof input === 'string') return input.split(',').map(x => x.trim()).filter(Boolean);
  return [];
}

const DIFFICULTIES = ['beginner', 'advanced', 'technical'];
function normalizeDifficulty(v) {
  if (v == null || String(v).trim() === '') return null;
  const d = String(v).trim().toLowerCase();
  if (!DIFFICULTIES.includes(d)) throw new Error('difficulty must be beginner, advanced, or technical.');
  return d;
}

async function insertSite(entry) {
  const { name, location, blurb, website, services, difficulty, lat, lng, sort, active } = entry || {};
  if (!name?.trim() || !location?.trim() || !blurb?.trim()) {
    throw new Error('name, location, and blurb are required.');
  }
  const { rows: [s] } = await pool.query(
    `INSERT INTO dive_sites (name,location,blurb,website,services,difficulty,lat,lng,sort,active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [name.trim(), location.trim(), blurb.trim(), website?.trim() || null,
     normalizeServices(services), normalizeDifficulty(difficulty), lat || null, lng || null,
     await resolveSort('dive_sites', sort), active ?? true]);
  return s;
}

app.post('/api/admin/sites', requireAdmin, allow('admin'), wrap(async (req, res) => {
  try { res.status(201).json(await insertSite(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
}));

// bulk import — SUPER ADMIN only
app.post('/api/admin/sites/bulk', requireAdmin, allow('superadmin'), wrap(async (req, res) => {
  const entries = Array.isArray(req.body?.entries) ? req.body.entries : null;
  if (!entries?.length) return res.status(400).json({ error: 'entries (non-empty array) is required.' });
  if (entries.length > 200) return res.status(400).json({ error: 'Max 200 entries per import.' });
  const failures = [];
  let ok = 0;
  for (const [i, entry] of entries.entries()) {
    try { await insertSite(entry); ok++; }
    catch (e) { failures.push({ index: i + 1, name: entry?.name || 'unnamed', error: e.message }); }
  }
  res.json({ ok, failures });
}));

app.patch('/api/admin/sites/:id', requireAdmin, allow('admin'), wrap(async (req, res) => {
  const allowed = ['name', 'location', 'blurb', 'website', 'services', 'difficulty', 'lat', 'lng', 'sort', 'active'];
  const sets = [], vals = [];
  try {
    for (const k of allowed) if (k in (req.body || {})) {
      vals.push(k === 'services' ? normalizeServices(req.body[k])
        : k === 'difficulty' ? normalizeDifficulty(req.body[k])
        : req.body[k] === '' ? null : req.body[k]);
      sets.push(`${k}=$${vals.length}`);
    }
  } catch (e) { return res.status(400).json({ error: e.message }); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  vals.push(req.params.id);
  const { rows: [s] } = await pool.query(
    `UPDATE dive_sites SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals);
  if (!s) return res.status(404).json({ error: 'Site not found.' });
  res.json(s);
}));

// ---------- admin: photos ----------
app.get('/api/admin/photos', requireAdmin, allow('admin'), wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, a.name AS uploaded_by_name FROM photos p
     LEFT JOIN admin_users a ON a.id = p.uploaded_by
     ORDER BY p.sort, p.created_at DESC`);
  res.json(rows);
}));

app.post('/api/admin/photos', requireAdmin, allow('admin'), upload.single('photo'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'An image file is required (jpeg/png/webp/heic).' });
  const { title, description, location_name, taken_at } = req.body || {};
  let lat = parseFloat(req.body?.lat), lng = parseFloat(req.body?.lng);
  const cleanup = () => fs.unlink(req.file.path, () => {});
  if (!title?.trim()) { cleanup(); return res.status(400).json({ error: 'A title is required.' }); }

  let gpsSource = 'manual';
  if (isNaN(lat) || isNaN(lng)) {
    // no coordinates supplied — check the photo's EXIF
    try {
      const gps = await exifr.gps(req.file.path);
      if (gps && isFinite(gps.latitude) && isFinite(gps.longitude)) {
        lat = gps.latitude; lng = gps.longitude; gpsSource = 'exif';
      }
    } catch { /* unreadable EXIF — fall through */ }
  }
  if (isNaN(lat) || isNaN(lng)) {
    cleanup();
    return res.status(422).json({
      error: 'This photo has no GPS data in its EXIF. Please enter the coordinates manually.',
      code: 'gps_required',
    });
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    cleanup();
    return res.status(400).json({ error: 'Coordinates are out of range.' });
  }

  let takenAt = taken_at || null;
  if (!takenAt) {
    try {
      const meta = await exifr.parse(req.file.path, ['DateTimeOriginal']);
      if (meta?.DateTimeOriginal) takenAt = meta.DateTimeOriginal.toISOString().slice(0, 10);
    } catch { /* optional */ }
  }

  const { rows: [p] } = await pool.query(
    `INSERT INTO photos (filename,title,description,location_name,lat,lng,taken_at,uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.file.filename, title.trim(), description?.trim() || null,
     location_name?.trim() || null, lat, lng, takenAt, req.admin.id]);
  res.status(201).json({ ...p, gps_source: gpsSource });
}));

app.patch('/api/admin/photos/:id', requireAdmin, allow('admin'), wrap(async (req, res) => {
  const allowed = ['title', 'description', 'location_name', 'lat', 'lng', 'taken_at', 'sort', 'active'];
  const sets = [], vals = [];
  for (const k of allowed) if (k in (req.body || {})) { vals.push(req.body[k] === '' ? null : req.body[k]); sets.push(`${k}=$${vals.length}`); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  vals.push(req.params.id);
  const { rows: [p] } = await pool.query(
    `UPDATE photos SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals);
  if (!p) return res.status(404).json({ error: 'Photo not found.' });
  res.json(p);
}));

app.delete('/api/admin/photos/:id', requireAdmin, allow('admin'), wrap(async (req, res) => {
  const { rows: [p] } = await pool.query(
    'DELETE FROM photos WHERE id=$1 RETURNING filename', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Photo not found.' });
  // only remove the file if no other row references it
  const { rows: [ref] } = await pool.query('SELECT 1 FROM photos WHERE filename=$1 LIMIT 1', [p.filename]);
  if (!ref) fs.unlink(path.join(UPLOADS_DIR, path.basename(p.filename)), () => {});
  res.json({ ok: true });
}));

// ---------- admin: course catalog ----------
app.get('/api/admin/courses', requireAdmin, allow('admin'), wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*, p.name AS prereq_course_name FROM courses c
     LEFT JOIN courses p ON p.id = c.prereq_course_id ORDER BY c.sort, c.id`);
  const { rows: reqs } = await pool.query(
    `SELECT course_id, session_type, required_count FROM course_requirements ORDER BY course_id, sort, id`);
  const byCourse = {};
  reqs.forEach(r => (byCourse[r.course_id] ||= []).push({ type: r.session_type, count: r.required_count }));
  rows.forEach(c => { c.requirements = byCourse[c.id] || []; });
  res.json(rows);
}));

const SESSION_TYPE_KEYS = ['academics', 'pool', 'open_water', 'other'];

// replace a course's completion requirements with the given [{type,count}] list
async function saveRequirements(courseId, requirements) {
  if (!Array.isArray(requirements)) return;
  await pool.query('DELETE FROM course_requirements WHERE course_id=$1', [courseId]);
  let sort = 0;
  for (const r of requirements) {
    const type = String(r?.type ?? r?.session_type ?? '').trim();
    const count = parseInt(r?.count ?? r?.required_count, 10);
    if (!SESSION_TYPE_KEYS.includes(type) || !(count >= 1)) continue;
    await pool.query(
      `INSERT INTO course_requirements (course_id, session_type, required_count, sort)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (course_id, session_type) DO UPDATE
         SET required_count = EXCLUDED.required_count, sort = EXCLUDED.sort`,
      [courseId, type, count, sort += 10]);
  }
}

async function insertCourse(entry) {
  const { name, level, agency, blurb, description, prerequisites, duration,
          comes_after, call_for_price, sort, active } = entry || {};
  // duration and price are optional — a course can be listed before pricing is set
  // (call_for_price → "Call for Pricing"; price 0 → "Free"; empty duration → chip hidden)
  const price_cents = entry?.price_cents ?? (entry?.price != null ? Math.round(+entry.price * 100) : 0);
  if (!name?.trim() || !level?.trim() || !blurb?.trim() || !description?.trim()) {
    throw new Error('name, level, blurb, and description are required.');
  }
  if (!(price_cents >= 0)) throw new Error('price cannot be negative.');
  let prereqId = entry?.prereq_course_id || null;
  if (comes_after) { // resolve by course name (works across a batch: earlier entries are inserted first)
    const { rows: [p] } = await pool.query(
      'SELECT id FROM courses WHERE lower(name)=lower($1)', [String(comes_after).trim()]);
    if (!p) throw new Error(`comes_after "${comes_after}" not found`);
    prereqId = p.id;
  }
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const { rows: [dupe] } = await pool.query('SELECT 1 FROM courses WHERE slug=$1', [slug]);
  if (dupe) throw new Error('A course with that name already exists.');
  const { rows: [c] } = await pool.query(
    `INSERT INTO courses (slug,name,level,agency,blurb,description,prerequisites,duration,price_cents,call_for_price,prereq_course_id,sort,active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [slug, name.trim(), level.trim(), agency?.trim() || 'SDI', blurb.trim(), description.trim(),
     prerequisites?.trim() || null, duration?.trim() || '', price_cents, !!call_for_price, prereqId,
     await resolveSort('courses', sort), active ?? true]);
  return c;
}

app.post('/api/admin/courses', requireAdmin, allow('admin'), wrap(async (req, res) => {
  try {
    const c = await insertCourse(req.body);
    await saveRequirements(c.id, req.body.requirements);
    res.status(201).json(c);
  }
  catch (e) { res.status(e.message.includes('already exists') ? 409 : 400).json({ error: e.message }); }
}));

// bulk import — SUPER ADMIN only
app.post('/api/admin/courses/bulk', requireAdmin, allow('superadmin'), wrap(async (req, res) => {
  const entries = Array.isArray(req.body?.entries) ? req.body.entries : null;
  if (!entries?.length) return res.status(400).json({ error: 'entries (non-empty array) is required.' });
  if (entries.length > 200) return res.status(400).json({ error: 'Max 200 entries per import.' });
  const failures = [];
  let ok = 0;
  for (const [i, entry] of entries.entries()) {
    try { await insertCourse(entry); ok++; }
    catch (e) { failures.push({ index: i + 1, name: entry?.name || 'unnamed', error: e.message }); }
  }
  res.json({ ok, failures });
}));

app.patch('/api/admin/courses/:id', requireAdmin, allow('admin'), wrap(async (req, res) => {
  if (+req.body?.prereq_course_id === +req.params.id) {
    return res.status(400).json({ error: 'A course cannot come after itself.' });
  }
  const allowed = ['name', 'level', 'agency', 'blurb', 'description', 'prerequisites',
                   'duration', 'price_cents', 'call_for_price', 'prereq_course_id', 'sort', 'active'];
  const hasReqs = 'requirements' in (req.body || {});
  const sets = [], vals = [];
  for (const k of allowed) if (k in (req.body || {})) { vals.push(req.body[k] === '' ? null : req.body[k]); sets.push(`${k}=$${vals.length}`); }
  if (!sets.length && !hasReqs) return res.status(400).json({ error: 'Nothing to update.' });
  let c;
  if (sets.length) {
    vals.push(req.params.id);
    ({ rows: [c] } = await pool.query(
      `UPDATE courses SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals));
  } else {
    ({ rows: [c] } = await pool.query('SELECT * FROM courses WHERE id=$1', [req.params.id]));
  }
  if (!c) return res.status(404).json({ error: 'Course not found.' });
  if (hasReqs) await saveRequirements(c.id, req.body.requirements);
  res.json(c);
}));

app.delete('/api/admin/courses/:id', requireAdmin, allow('admin'), wrap(async (req, res) => {
  const force = await checkForce(req, res);
  if (force === null) return;
  const { rows: [{ count }] } = await pool.query(
    'SELECT count(*)::int AS count FROM class_sessions WHERE course_id=$1', [req.params.id]);
  if (count > 0 && !force) {
    return res.status(409).json({
      error: `This course has ${count} scheduled class(es). Delete those classes first, or hide the course instead.`,
      code: 'force_available',
      force_hint: `Force deleting removes the course AND its ${count} class(es), including their registrations, crew assignments, and files.`,
    });
  }
  // collect class media files before the cascade removes the rows
  const { rows: media } = await pool.query(
    `SELECT m.filename FROM session_media m
     JOIN class_sessions s ON s.id = m.session_id WHERE s.course_id=$1`, [req.params.id]);
  const { rowCount } = await pool.query('DELETE FROM courses WHERE id=$1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Course not found.' });
  for (const m of media) {
    const { rows: [ref] } = await pool.query('SELECT 1 FROM session_media WHERE filename=$1 LIMIT 1', [m.filename]);
    if (!ref) fs.unlink(path.join(MEDIA_DIR, path.basename(m.filename)), () => {});
  }
  res.json({ ok: true, forced: !!force });
}));

app.delete('/api/admin/staff/:id', requireAdmin, allow('admin'), wrap(async (req, res) => {
  const force = await checkForce(req, res);
  if (force === null) return;
  const { rows: [{ count }] } = await pool.query(
    'SELECT count(*)::int AS count FROM session_staff WHERE staff_id=$1', [req.params.id]);
  if (count > 0 && !force) {
    return res.status(409).json({
      error: `This person is assigned to ${count} class(es) — deleting would erase their work history. Unassign them or hide them instead.`,
      code: 'force_available',
      force_hint: `Force deleting removes them from ${count} class assignment(s) and unlinks any portal account.`,
    });
  }
  const { rowCount } = await pool.query('DELETE FROM staff WHERE id=$1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Staff member not found.' });
  res.json({ ok: true, forced: !!force });
}));

app.delete('/api/admin/sites/:id', requireAdmin, allow('admin'), wrap(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM dive_sites WHERE id=$1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Site not found.' });
  res.json({ ok: true });
}));

app.delete('/api/admin/customers/:id', requireAdmin, allow('admin'), wrap(async (req, res) => {
  const { rows: files } = await pool.query(
    `SELECT filename FROM customer_documents WHERE customer_id=$1
     UNION SELECT avatar_filename FROM customers WHERE id=$1 AND avatar_filename IS NOT NULL`,
    [req.params.id]);
  const { rowCount } = await pool.query('DELETE FROM customers WHERE id=$1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Customer not found.' });
  for (const f of files) fs.unlink(path.join(MEDIA_DIR, path.basename(f.filename)), () => {});
  res.json({ ok: true });
}));

// ---------- admin: staff work history ----------
app.get('/api/admin/staff/:id/history', requireAdmin, allow('admin', 'staff'), wrap(async (req, res) => {
  const { rows: sessions } = await pool.query(
    `SELECT s.id, s.start_date, s.end_date, s.location, s.status, ss.role,
            c.name AS course_name,
            (SELECT count(*)::int FROM registrations r
              WHERE r.session_id = s.id AND r.status = 'confirmed') AS confirmed_students
     FROM session_staff ss
     JOIN class_sessions s ON s.id = ss.session_id
     JOIN courses c ON c.id = s.course_id
     WHERE ss.staff_id = $1
     ORDER BY s.start_date DESC`, [req.params.id]);
  const { rows: students } = await pool.query(
    `SELECT DISTINCT ON (r.customer_id, s.id)
            r.customer_id, r.first_name, r.last_name, r.email, r.status,
            s.id AS session_id, s.start_date, c.name AS course_name
     FROM session_staff ss
     JOIN class_sessions s ON s.id = ss.session_id
     JOIN courses c ON c.id = s.course_id
     JOIN registrations r ON r.session_id = s.id AND r.status IN ('pending','confirmed')
     WHERE ss.staff_id = $1
     ORDER BY r.customer_id, s.id, s.start_date DESC`, [req.params.id]);
  res.json({ sessions, students });
}));

// ---------- admin: customers & notes ----------
// instructors see only customers registered in their own classes
app.get('/api/admin/customers', requireAdmin, wrap(async (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : null;
  const own = req.admin.role === 'instructor' ? await instructorSessionIds(req.admin) : null;
  const { rows } = await pool.query(
    `SELECT c.id, c.email, c.first_name, c.last_name, c.phone,
            c.password_hash IS NOT NULL AS has_account,
            c.avatar_filename IS NOT NULL AS has_avatar, c.created_at,
            c.medical_date, c.medical_waiver_required, c.waiver_date,
            (SELECT count(*)::int FROM registrations r WHERE r.customer_id = c.id) AS registration_count,
            (SELECT count(*)::int FROM customer_notes n WHERE n.customer_id = c.id AND n.kind='certification') AS cert_count
     FROM customers c
     WHERE ($1::text IS NULL OR c.first_name || ' ' || c.last_name || ' ' || c.email ILIKE $1)
       AND ($2::int[] IS NULL OR EXISTS
            (SELECT 1 FROM registrations r WHERE r.customer_id = c.id AND r.session_id = ANY($2)))
     ORDER BY c.created_at DESC LIMIT 200`, [q, own]);
  res.json(rows);
}));

async function canTouchCustomer(adminUser, customerId) {
  if (adminUser.role !== 'instructor') return true;
  const ids = await instructorSessionIds(adminUser);
  if (!ids.length) return false;
  const { rows: [hit] } = await pool.query(
    'SELECT 1 FROM registrations WHERE customer_id=$1 AND session_id = ANY($2) LIMIT 1',
    [customerId, ids]);
  return !!hit;
}

app.get('/api/admin/customers/:id', requireAdmin, wrap(async (req, res) => {
  if (!await canTouchCustomer(req.admin, req.params.id)) {
    return res.status(403).json({ error: 'This customer is not in any of your classes.' });
  }
  const { rows: [customer] } = await pool.query(
    `SELECT id, email, first_name, last_name, phone,
            password_hash IS NOT NULL AS has_account,
            avatar_filename IS NOT NULL AS has_avatar, share_contact, created_at,
            medical_date, medical_waiver_required, waiver_date
     FROM customers WHERE id=$1`, [req.params.id]);
  if (!customer) return res.status(404).json({ error: 'Customer not found.' });
  const { rows: registrations } = await pool.query(
    `SELECT r.id, r.status, r.created_at, r.paid, r.coursework_complete, r.welcome_packet_sent,
            s.id AS session_id, s.start_date, s.end_date, s.location,
            c.name AS course_name
     FROM registrations r JOIN class_sessions s ON s.id = r.session_id
     JOIN courses c ON c.id = s.course_id
     WHERE r.customer_id = $1 ORDER BY s.start_date DESC`, [req.params.id]);
  await attachCoursework(registrations);
  const { rows: notes } = await pool.query(
    `SELECT n.*, a.name AS author_name, c.name AS course_name
     FROM customer_notes n
     LEFT JOIN admin_users a ON a.id = n.author_id
     LEFT JOIN class_sessions s ON s.id = n.session_id
     LEFT JOIN courses c ON c.id = s.course_id
     WHERE n.customer_id = $1 ORDER BY n.created_at DESC`, [req.params.id]);
  const { rows: documents } = await pool.query(
    `SELECT d.id, d.original_name, d.mime, d.title, d.category, d.created_at,
            d.uploaded_by_customer, a.name AS uploaded_by_name
     FROM customer_documents d LEFT JOIN admin_users a ON a.id = d.uploaded_by_admin
     WHERE d.customer_id = $1 ORDER BY d.created_at DESC`, [req.params.id]);
  res.json({ customer, registrations, notes, documents });
}));

// staff may toggle a customer's contact-sharing preference on their behalf
app.patch('/api/admin/customers/:id', requireAdmin, wrap(async (req, res) => {
  if (!await canTouchCustomer(req.admin, req.params.id)) {
    return res.status(403).json({ error: 'This customer is not in any of your classes.' });
  }
  if (typeof req.body?.share_contact !== 'boolean') {
    return res.status(400).json({ error: 'share_contact (true/false) is required.' });
  }
  const { rows: [c] } = await pool.query(
    'UPDATE customers SET share_contact=$1 WHERE id=$2 RETURNING id, share_contact',
    [req.body.share_contact, req.params.id]);
  if (!c) return res.status(404).json({ error: 'Customer not found.' });
  res.json(c);
}));

// staff verify a customer's medical / waiver standing (the on-file dates)
app.patch('/api/admin/customers/:id/medical', requireAdmin, wrap(async (req, res) => {
  if (!await canTouchCustomer(req.admin, req.params.id)) {
    return res.status(403).json({ error: 'This customer is not in any of your classes.' });
  }
  const b = req.body || {};
  const isDate = v => v == null || v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!isDate(b.medical_date) || !isDate(b.waiver_date)) {
    return res.status(400).json({ error: 'Dates must be YYYY-MM-DD.' });
  }
  const { rows: [c] } = await pool.query(
    `UPDATE customers SET
       medical_date = $1,
       medical_waiver_required = $2,
       waiver_date = $3
     WHERE id=$4
     RETURNING id, medical_date, medical_waiver_required, waiver_date`,
    [b.medical_date || null, !!b.medical_waiver_required, b.waiver_date || null, req.params.id]);
  if (!c) return res.status(404).json({ error: 'Customer not found.' });
  res.json(c);
}));

app.post('/api/admin/customers/:id/notes', requireAdmin, wrap(async (req, res) => {
  if (!await canTouchCustomer(req.admin, req.params.id)) {
    return res.status(403).json({ error: 'This customer is not in any of your classes.' });
  }
  const { kind, body, session_id, cert_agency, cert_number, cert_date, visible_to_customer } = req.body || {};
  if (!body?.trim() || !['note', 'certification'].includes(kind || 'note')) {
    return res.status(400).json({ error: 'A note body is required.' });
  }
  const { rows: [n] } = await pool.query(
    `INSERT INTO customer_notes (customer_id,author_id,session_id,kind,body,cert_agency,cert_number,cert_date,visible_to_customer)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.params.id, req.admin.id, session_id || null, kind || 'note', body.trim(),
     cert_agency || null, cert_number || null, cert_date || null, visible_to_customer ?? true]);
  res.status(201).json(n);
}));

app.delete('/api/admin/notes/:id', requireAdmin, allow('admin', 'staff'), wrap(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM customer_notes WHERE id=$1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Note not found.' });
  res.json({ ok: true });
}));

// ---------- admin: private class media ----------
app.get('/api/admin/sessions/:id/media', requireAdmin, wrap(async (req, res) => {
  if (!await canTouchSession(req.admin, req.params.id)) {
    return res.status(403).json({ error: 'You are not assigned to this class.' });
  }
  const { rows } = await pool.query(
    `SELECT m.*, COALESCE(a.name, c.first_name || ' ' || c.last_name) AS uploaded_by_name,
            m.uploaded_by_customer_id IS NOT NULL AS is_customer_upload
     FROM session_media m
     LEFT JOIN admin_users a ON a.id = m.uploaded_by
     LEFT JOIN customers c ON c.id = m.uploaded_by_customer_id
     WHERE m.session_id = $1 ORDER BY m.created_at DESC`, [req.params.id]);
  res.json(rows);
}));

app.post('/api/admin/sessions/:id/media', requireAdmin, mediaUpload.single('file'), wrap(async (req, res) => {
  const cleanup = () => req.file && fs.unlink(req.file.path, () => {});
  if (!await canTouchSession(req.admin, req.params.id)) {
    cleanup();
    return res.status(403).json({ error: 'You are not assigned to this class.' });
  }
  if (!req.file) return res.status(400).json({ error: 'A file is required (images or PDF, 30MB max).' });
  const { rows: [m] } = await pool.query(
    `INSERT INTO session_media (session_id,filename,original_name,mime,title,uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.params.id, req.file.filename, req.file.originalname, req.file.mimetype,
     req.body?.title?.trim() || null, req.admin.id]);
  res.status(201).json(m);
}));

app.delete('/api/admin/media/:id', requireAdmin, wrap(async (req, res) => {
  const { rows: [m] } = await pool.query('SELECT * FROM session_media WHERE id=$1', [req.params.id]);
  if (!m) return res.status(404).json({ error: 'File not found.' });
  if (!await canTouchSession(req.admin, m.session_id)) {
    return res.status(403).json({ error: 'You are not assigned to this class.' });
  }
  await pool.query('DELETE FROM session_media WHERE id=$1', [req.params.id]);
  const { rows: [ref] } = await pool.query('SELECT 1 FROM session_media WHERE filename=$1 LIMIT 1', [m.filename]);
  if (!ref) fs.unlink(path.join(MEDIA_DIR, path.basename(m.filename)), () => {});
  res.json({ ok: true });
}));

// media file serving — token via ?t= so <img> tags work. Valid for staff/admin
// tokens, instructors on their own sessions, and customers CONFIRMED in the class.
app.get('/api/media/:id/file', wrap(async (req, res) => {
  const t = req.query.t;
  if (!t) return res.status(401).json({ error: 'Not authenticated' });
  const { rows: [m] } = await pool.query('SELECT * FROM session_media WHERE id=$1', [req.params.id]);
  if (!m) return res.status(404).json({ error: 'File not found.' });

  let ok = false;
  const { rows: [adm] } = await pool.query(
    `SELECT a.role, a.staff_id FROM admin_tokens tk JOIN admin_users a ON a.id = tk.admin_id
     WHERE tk.token=$1 AND tk.expires_at > now()`, [t]);
  if (adm) {
    ok = adm.role !== 'instructor' || await canTouchSession({ role: 'instructor', staff_id: adm.staff_id }, m.session_id);
  } else {
    const { rows: [cust] } = await pool.query(
      `SELECT c.id FROM customer_tokens tk JOIN customers c ON c.id = tk.customer_id
       WHERE tk.token=$1 AND tk.expires_at > now()`, [t]);
    if (cust) {
      const { rows: [reg] } = await pool.query(
        `SELECT 1 FROM registrations WHERE customer_id=$1 AND session_id=$2 AND status='confirmed'`,
        [cust.id, m.session_id]);
      ok = !!reg;
    }
  }
  if (!ok) return res.status(403).json({ error: 'You do not have access to this file.' });
  res.setHeader('Content-Type', m.mime);
  res.setHeader('Content-Disposition', `inline; filename="${m.original_name.replace(/"/g, '')}"`);
  res.sendFile(path.join(MEDIA_DIR, path.basename(m.filename)));
}));

// customers may add photos to classes they are CONFIRMED in
app.post('/api/customer/sessions/:id/media', requireCustomer, mediaUpload.single('file'), wrap(async (req, res) => {
  const cleanup = () => req.file && fs.unlink(req.file.path, () => {});
  const { rows: [reg] } = await pool.query(
    `SELECT 1 FROM registrations WHERE customer_id=$1 AND session_id=$2 AND status='confirmed'`,
    [req.customer.id, req.params.id]);
  if (!reg) { cleanup(); return res.status(403).json({ error: 'You can only add photos to classes you attended.' }); }
  if (!req.file) return res.status(400).json({ error: 'A file is required (images or PDF, 30MB max).' });
  const { rows: [m] } = await pool.query(
    `INSERT INTO session_media (session_id,filename,original_name,mime,title,uploaded_by_customer_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.params.id, req.file.filename, req.file.originalname, req.file.mimetype,
     req.body?.title?.trim() || null, req.customer.id]);
  const { rows: [info] } = await pool.query(
    `SELECT c.name FROM class_sessions s JOIN courses c ON c.id = s.course_id WHERE s.id=$1`, [req.params.id]);
  await notify('system',
    `${req.customer.first_name} ${req.customer.last_name} added a class photo`,
    `${req.customer.first_name} ${req.customer.last_name} uploaded "${req.body?.title || req.file.originalname}" to ${info?.name || 'a class'}.`,
    'sessions');
  res.status(201).json(m);
}));

// customers may delete only class photos they uploaded themselves
app.delete('/api/customer/media/:id', requireCustomer, wrap(async (req, res) => {
  const { rows: [m] } = await pool.query('SELECT * FROM session_media WHERE id=$1', [req.params.id]);
  if (!m || m.uploaded_by_customer_id !== req.customer.id) {
    return res.status(404).json({ error: 'Photo not found.' });
  }
  await pool.query('DELETE FROM session_media WHERE id=$1', [req.params.id]);
  const { rows: [ref] } = await pool.query('SELECT 1 FROM session_media WHERE filename=$1 LIMIT 1', [m.filename]);
  if (!ref) fs.unlink(path.join(MEDIA_DIR, path.basename(m.filename)), () => {});
  res.json({ ok: true });
}));

// ---------- customer avatars & documents ----------
const DOC_CATEGORIES = ['cert_card', 'medical', 'waiver', 'other'];

async function setCustomerAvatar(customerId, file, res) {
  if (!file) return res.status(400).json({ error: 'An image file is required.' });
  if (!file.mimetype.startsWith('image/')) {
    fs.unlink(file.path, () => {});
    return res.status(400).json({ error: 'Avatars must be an image (jpeg/png/webp/heic).' });
  }
  const { rows: [old] } = await pool.query(
    'UPDATE customers SET avatar_filename=$1 WHERE id=$2 RETURNING (SELECT avatar_filename FROM customers WHERE id=$2) AS _old, avatar_filename',
    [file.filename, customerId]);
  // remove the previous avatar file
  const { rows: [prev] } = await pool.query(
    'SELECT 1 FROM customers WHERE avatar_filename=$1 LIMIT 1', [old?._old]);
  if (old?._old && !prev) fs.unlink(path.join(MEDIA_DIR, path.basename(old._old)), () => {});
  res.status(201).json({ ok: true });
}

app.post('/api/admin/customers/:id/avatar', requireAdmin, mediaUpload.single('avatar'), wrap(async (req, res) => {
  if (!await canTouchCustomer(req.admin, req.params.id)) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(403).json({ error: 'This customer is not in any of your classes.' });
  }
  await setCustomerAvatar(req.params.id, req.file, res);
}));

app.post('/api/customer/avatar', requireCustomer, mediaUpload.single('avatar'), wrap(async (req, res) => {
  await setCustomerAvatar(req.customer.id, req.file, res);
}));

// avatar file — staff (scoped for instructors) or the customer themself
app.get('/api/customers/:id/avatar', wrap(async (req, res) => {
  const t = req.query.t;
  if (!t) return res.status(401).json({ error: 'Not authenticated' });
  let ok = false;
  const { rows: [adm] } = await pool.query(
    `SELECT a.role, a.staff_id FROM admin_tokens tk JOIN admin_users a ON a.id = tk.admin_id
     WHERE tk.token=$1 AND tk.expires_at > now()`, [t]);
  if (adm) ok = await canTouchCustomer(adm, req.params.id);
  else {
    const { rows: [cust] } = await pool.query(
      `SELECT customer_id FROM customer_tokens WHERE token=$1 AND expires_at > now()`, [t]);
    ok = cust && cust.customer_id === +req.params.id;
  }
  if (!ok) return res.status(403).json({ error: 'No access.' });
  const { rows: [c] } = await pool.query('SELECT avatar_filename FROM customers WHERE id=$1', [req.params.id]);
  if (!c?.avatar_filename) return res.status(404).json({ error: 'No avatar.' });
  res.sendFile(path.join(MEDIA_DIR, path.basename(c.avatar_filename)));
}));

async function insertCustomerDoc(customerId, file, body, uploader, res) {
  if (!file) return res.status(400).json({ error: 'A file is required (images or PDF, 30MB max).' });
  const category = DOC_CATEGORIES.includes(body?.category) ? body.category : 'other';
  const { rows: [d] } = await pool.query(
    `INSERT INTO customer_documents (customer_id,filename,original_name,mime,title,category,uploaded_by_admin,uploaded_by_customer)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [customerId, file.filename, file.originalname, file.mimetype,
     body?.title?.trim() || null, category, uploader.adminId || null, !!uploader.byCustomer]);
  res.status(201).json(d);
}

app.post('/api/admin/customers/:id/documents', requireAdmin, mediaUpload.single('file'), wrap(async (req, res) => {
  if (!await canTouchCustomer(req.admin, req.params.id)) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(403).json({ error: 'This customer is not in any of your classes.' });
  }
  await insertCustomerDoc(req.params.id, req.file, req.body, { adminId: req.admin.id }, res);
}));

app.post('/api/customer/documents', requireCustomer, mediaUpload.single('file'), wrap(async (req, res) => {
  await insertCustomerDoc(req.customer.id, req.file, req.body, { byCustomer: true }, res);
  await notify('system',
    `${req.customer.first_name} ${req.customer.last_name} uploaded a document`,
    `${req.customer.first_name} ${req.customer.last_name} added "${req.body?.title || req.file?.originalname}" (${req.body?.category || 'other'}) to their record.`,
    'customers');
}));

async function deleteCustomerDoc(docId, res) {
  const { rows: [d] } = await pool.query(
    'DELETE FROM customer_documents WHERE id=$1 RETURNING filename', [docId]);
  if (!d) return res.status(404).json({ error: 'Document not found.' });
  const { rows: [ref] } = await pool.query('SELECT 1 FROM customer_documents WHERE filename=$1 LIMIT 1', [d.filename]);
  if (!ref) fs.unlink(path.join(MEDIA_DIR, path.basename(d.filename)), () => {});
  res.json({ ok: true });
}

app.delete('/api/admin/documents/:id', requireAdmin, allow('admin', 'staff'), wrap(async (req, res) => {
  await deleteCustomerDoc(req.params.id, res);
}));

// customers may delete only files they uploaded themselves
app.delete('/api/customer/documents/:id', requireCustomer, wrap(async (req, res) => {
  const { rows: [d] } = await pool.query(
    'SELECT customer_id, uploaded_by_customer FROM customer_documents WHERE id=$1', [req.params.id]);
  if (!d || d.customer_id !== req.customer.id) return res.status(404).json({ error: 'Document not found.' });
  if (!d.uploaded_by_customer) return res.status(403).json({ error: 'Only TexRec staff can remove this document.' });
  await deleteCustomerDoc(req.params.id, res);
}));

// document file — staff (scoped for instructors) or the owning customer
app.get('/api/documents/:id/file', wrap(async (req, res) => {
  const t = req.query.t;
  if (!t) return res.status(401).json({ error: 'Not authenticated' });
  const { rows: [d] } = await pool.query('SELECT * FROM customer_documents WHERE id=$1', [req.params.id]);
  if (!d) return res.status(404).json({ error: 'Document not found.' });
  let ok = false;
  const { rows: [adm] } = await pool.query(
    `SELECT a.role, a.staff_id FROM admin_tokens tk JOIN admin_users a ON a.id = tk.admin_id
     WHERE tk.token=$1 AND tk.expires_at > now()`, [t]);
  if (adm) ok = await canTouchCustomer(adm, d.customer_id);
  else {
    const { rows: [cust] } = await pool.query(
      `SELECT customer_id FROM customer_tokens WHERE token=$1 AND expires_at > now()`, [t]);
    ok = cust && cust.customer_id === d.customer_id;
  }
  if (!ok) return res.status(403).json({ error: 'You do not have access to this file.' });
  res.setHeader('Content-Type', d.mime);
  res.setHeader('Content-Disposition', `inline; filename="${d.original_name.replace(/"/g, '')}"`);
  res.sendFile(path.join(MEDIA_DIR, path.basename(d.filename)));
}));

// ---------- customer portal ----------
app.post('/api/customer/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
  const { rows: [c] } = await pool.query('SELECT * FROM customers WHERE lower(email)=lower($1)', [email]);
  if (!c || !c.password_hash || !verifyPassword(password, c.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password. (Accounts are created when you register for a class.)' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO customer_tokens (token, customer_id, expires_at) VALUES ($1,$2, now() + make_interval(days => $3))`,
    [token, c.id, CUSTOMER_TOKEN_DAYS]);
  res.json({ token, first_name: c.first_name, last_name: c.last_name, email: c.email });
}));

app.post('/api/customer/logout', requireCustomer, wrap(async (req, res) => {
  await pool.query('DELETE FROM customer_tokens WHERE token=$1', [req.headers.authorization.slice(7)]);
  res.json({ ok: true });
}));

// customers may update their own sharing preference
app.patch('/api/customer/me', requireCustomer, wrap(async (req, res) => {
  if (typeof req.body?.share_contact !== 'boolean') {
    return res.status(400).json({ error: 'share_contact (true/false) is required.' });
  }
  const { rows: [c] } = await pool.query(
    'UPDATE customers SET share_contact=$1 WHERE id=$2 RETURNING share_contact',
    [req.body.share_contact, req.customer.id]);
  res.json(c);
}));

app.get('/api/customer/me', requireCustomer, wrap(async (req, res) => {
  const { rows: registrations } = await pool.query(
    `SELECT r.id, r.status, r.created_at, r.paid, r.coursework_complete, r.welcome_packet_sent,
            s.id AS session_id, s.start_date, s.end_date,
            to_char(s.start_time,'HH12:MI AM') AS start_time, s.location,
            c.name AS course_name, ${SESSION_STAFF_SQL},
            CASE WHEN r.status = 'confirmed' THEN
              (SELECT COALESCE(json_agg(json_build_object(
                  'name', c2.first_name || ' ' || c2.last_name,
                  'email', c2.email, 'phone', c2.phone)), '[]'::json)
               FROM registrations r2 JOIN customers c2 ON c2.id = r2.customer_id
               WHERE r2.session_id = s.id AND r2.status = 'confirmed'
                 AND c2.share_contact AND c2.id <> $1)
            ELSE '[]'::json END AS classmates
     FROM registrations r
     JOIN class_sessions s ON s.id = r.session_id
     JOIN courses c ON c.id = s.course_id
     WHERE r.customer_id = $1 ORDER BY s.start_date DESC`, [req.customer.id]);
  await attachCoursework(registrations);
  const { rows: notes } = await pool.query(
    `SELECT n.id, n.kind, n.body, n.cert_agency, n.cert_number, n.cert_date, n.created_at,
            a.name AS author_name, c.name AS course_name
     FROM customer_notes n
     LEFT JOIN admin_users a ON a.id = n.author_id
     LEFT JOIN class_sessions s ON s.id = n.session_id
     LEFT JOIN courses c ON c.id = s.course_id
     WHERE n.customer_id = $1 AND n.visible_to_customer
     ORDER BY n.created_at DESC`, [req.customer.id]);
  const { rows: media } = await pool.query(
    `SELECT m.id, m.title, m.mime, m.original_name, m.created_at,
            m.uploaded_by_customer_id, s.id AS session_id, s.start_date, c.name AS course_name
     FROM session_media m
     JOIN class_sessions s ON s.id = m.session_id
     JOIN courses c ON c.id = s.course_id
     JOIN registrations r ON r.session_id = s.id AND r.customer_id = $1 AND r.status = 'confirmed'
     ORDER BY m.created_at DESC`, [req.customer.id]);
  const { rows: documents } = await pool.query(
    `SELECT d.id, d.original_name, d.mime, d.title, d.category, d.created_at,
            d.uploaded_by_customer, a.name AS uploaded_by_name
     FROM customer_documents d LEFT JOIN admin_users a ON a.id = d.uploaded_by_admin
     WHERE d.customer_id = $1 ORDER BY d.created_at DESC`, [req.customer.id]);
  const { rows: [extra] } = await pool.query(
    'SELECT avatar_filename IS NOT NULL AS has_avatar, share_contact FROM customers WHERE id=$1', [req.customer.id]);
  res.json({ customer: { ...req.customer, has_avatar: extra.has_avatar, share_contact: extra.share_contact },
             registrations, notes, media, documents });
}));

// ---------- customer self-service: choose / auto-fill their class sessions ----------
async function customerOwnsReg(customerId, regId) {
  const { rows: [r] } = await pool.query(
    'SELECT 1 FROM registrations WHERE id=$1 AND customer_id=$2', [regId, customerId]);
  return !!r;
}

app.get('/api/customer/registrations/:id/sessions', requireCustomer, wrap(async (req, res) => {
  if (!await customerOwnsReg(req.customer.id, +req.params.id)) return res.status(403).json({ error: 'Not your registration.' });
  res.json(await registrationSessions(+req.params.id));
}));

app.post('/api/customer/registrations/:id/autofill', requireCustomer, wrap(async (req, res) => {
  if (!await customerOwnsReg(req.customer.id, +req.params.id)) return res.status(403).json({ error: 'Not your registration.' });
  const added = await autofillSessions(+req.params.id);
  res.json({ added, ...(await registrationSessions(+req.params.id)) });
}));

app.post('/api/customer/registrations/:id/sessions', requireCustomer, wrap(async (req, res) => {
  if (!await customerOwnsReg(req.customer.id, +req.params.id)) return res.status(403).json({ error: 'Not your registration.' });
  if (!req.body?.meeting_id) return res.status(400).json({ error: 'meeting_id is required.' });
  try { await addSessionToRegistration(+req.params.id, +req.body.meeting_id); }
  catch (e) { return res.status(400).json({ error: e.message }); }
  res.json(await registrationSessions(+req.params.id));
}));

app.delete('/api/customer/attendance/:id', requireCustomer, wrap(async (req, res) => {
  const { rows: [a] } = await pool.query(
    `SELECT a.id, a.status, r.customer_id FROM meeting_attendance a
     JOIN registrations r ON r.id = a.registration_id WHERE a.id=$1`, [req.params.id]);
  if (!a || a.customer_id !== req.customer.id) return res.status(403).json({ error: 'Not your session.' });
  if (DONE_STATUSES.includes(a.status)) return res.status(400).json({ error: 'That session is already marked complete — contact us to change it.' });
  await pool.query('DELETE FROM meeting_attendance WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));

// ---------- admin: my profile ----------
app.get('/api/admin/me', requireAdmin, wrap(async (req, res) => res.json(req.admin)));

app.patch('/api/admin/me', requireAdmin, wrap(async (req, res) => {
  const { name, email } = req.body || {};
  const sets = [], vals = [];
  if (name?.trim()) { vals.push(name.trim()); sets.push(`name=$${vals.length}`); }
  if (email?.trim()) {
    const { rows: [dupe] } = await pool.query(
      'SELECT 1 FROM admin_users WHERE lower(email)=lower($1) AND id<>$2', [email.trim(), req.admin.id]);
    if (dupe) return res.status(409).json({ error: 'That email is already in use.' });
    vals.push(email.trim().toLowerCase()); sets.push(`email=$${vals.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  vals.push(req.admin.id);
  const { rows: [a] } = await pool.query(
    `UPDATE admin_users SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING id,email,name`, vals);
  res.json(a);
}));

app.post('/api/admin/me/password', requireAdmin, wrap(async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current and new password are required.' });
  }
  if (new_password.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  const { rows: [me] } = await pool.query('SELECT password_hash FROM admin_users WHERE id=$1', [req.admin.id]);
  if (!verifyPassword(current_password, me.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  await pool.query('UPDATE admin_users SET password_hash=$1 WHERE id=$2',
    [hashPassword(new_password), req.admin.id]);
  // sign out every other session for this account, keep this one
  await pool.query('DELETE FROM admin_tokens WHERE admin_id=$1 AND token<>$2',
    [req.admin.id, req.headers.authorization.slice(7)]);
  res.json({ ok: true });
}));

app.get('/api/admin/staff', requireAdmin, allow('admin','staff'), wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM staff ORDER BY sort, id');
  res.json(rows);
}));

app.post('/api/admin/staff', requireAdmin, allow('admin'), wrap(async (req, res) => {
  const { name, role, certs, bio, initials, teaches, sort, active } = req.body || {};
  if (!name?.trim() || !role?.trim() || !bio?.trim()) {
    return res.status(400).json({ error: 'name, role, and bio are required.' });
  }
  const init = (initials || name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2)).toUpperCase();
  const { rows: [s] } = await pool.query(
    `INSERT INTO staff (name,role,certs,bio,initials,teaches,sort,active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [name.trim(), role.trim(), certs || '', bio.trim(), init,
     teaches || '', await resolveSort('staff', sort), active ?? true]);
  res.status(201).json(s);
}));

app.patch('/api/admin/staff/:id', requireAdmin, allow('admin'), wrap(async (req, res) => {
  const allowed = ['name', 'role', 'certs', 'bio', 'initials', 'teaches', 'sort', 'active'];
  const sets = [], vals = [];
  for (const k of allowed) if (k in (req.body || {})) { vals.push(req.body[k]); sets.push(`${k}=$${vals.length}`); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  vals.push(req.params.id);
  const { rows: [s] } = await pool.query(
    `UPDATE staff SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals);
  if (!s) return res.status(404).json({ error: 'Staff member not found.' });
  res.json(s);
}));

// SPA-ish fallbacks for clean page URLs
const pages = ['courses', 'trips', 'staff', 'about', 'calendar', 'admin', 'sites', 'gallery', 'account'];
for (const p of pages) {
  app.get(`/${p}`, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', `${p}.html`)));
}

app.listen(PORT, () => console.log(`TexRec server on http://localhost:${PORT}`));
