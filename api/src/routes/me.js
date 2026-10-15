import { Router } from 'express';
import multer from 'multer';
import { query, tx } from '../db.js';
import { wrap, notFound, badRequest } from '../lib/http.js';
import { validate, z, uuid } from '../lib/validate.js';
import { requireAuth, publicUser } from '../lib/auth.js';
import { getEvent, listEvents } from '../lib/events.js';
import { storeImage, storeFile, deleteImage, deleteObject } from '../lib/storage.js';
import { sendEmail, templates } from '../lib/email.js';
import { stripeClient, createCheckout } from '../lib/stripe.js';

// everything a signed-in student (or staff acting as a student) can do with their own data
export const meRouter = Router();
meRouter.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

meRouter.get('/dashboard', wrap(async (req, res) => {
  const uid = req.user.id;
  const [upcoming, certs, logs] = await Promise.all([
    listEvents({ where: ['e.id IN (SELECT event_id FROM enrollments WHERE user_id=$1 AND status IN (\'reserved\',\'waitlisted\'))', 'e.ends_at > now()'], params: [uid], limit: 5 }),
    query('SELECT c.*, a.code AS agency FROM certifications c LEFT JOIN agencies a ON a.id=c.agency_id WHERE c.user_id=$1 ORDER BY c.issued_on DESC NULLS FIRST', [uid]),
    query('SELECT count(*)::int AS n FROM dive_logs WHERE user_id=$1', [uid]),
  ]);
  const { rows: enr } = await query('SELECT event_id, status FROM enrollments WHERE user_id=$1', [uid]);
  const statusByEvent = Object.fromEntries(enr.map((e) => [e.event_id, e.status]));
  res.json({
    upcoming: upcoming.map((e) => ({ ...e, myStatus: statusByEvent[e.id] })),
    certifications: certs.rows.map(shapeCert),
    stats: { upcomingClasses: upcoming.length, completedCertifications: certs.rows.filter((c) => c.status === 'issued').length, loggedDives: logs.rows[0].n },
  });
}));

export const shapeCert = (c) => ({ id: c.id, name: c.name, agency: c.agency, certNumber: c.cert_number, issuedOn: c.issued_on, status: c.status });

// ---- enrollments ----
meRouter.get('/enrollments', wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM enrollments WHERE user_id=$1', [req.user.id]);
  if (!rows.length) return res.json([]);
  const events = await listEvents({ where: ['e.id = ANY($1)'], params: [rows.map((r) => r.event_id)], order: 'e.starts_at DESC' });
  const byEvent = Object.fromEntries(rows.map((r) => [r.event_id, r]));
  res.json(events.map((ev) => ({ enrollment: shapeEnrollment(byEvent[ev.id]), event: ev })));
}));

export const shapeEnrollment = (e) => ({ id: e.id, eventId: e.event_id, userId: e.user_id, status: e.status, amountCents: e.amount_cents,
  paidAt: e.paid_at, paidCents: e.paid_cents, notes: e.notes, createdAt: e.created_at });

meRouter.post('/enrollments', wrap(async (req, res) => {
  const { eventId } = validate(z.object({ eventId: uuid }), req.body);
  const user = req.user;
  const result = await tx(async (client) => {
    // lock the event row so two students can't both take the last seat
    const { rows: [evRow] } = await client.query('SELECT * FROM events WHERE id=$1 AND published FOR UPDATE', [eventId]);
    if (!evRow) throw notFound('event not found');
    if (new Date(evRow.starts_at) < new Date()) throw badRequest('this event has already started');
    const { rows: [existing] } = await client.query('SELECT * FROM enrollments WHERE event_id=$1 AND user_id=$2', [eventId, user.id]);
    if (existing && existing.status !== 'cancelled') throw badRequest('you are already signed up for this event');
    const { rows: [{ taken }] } = await client.query(
      `SELECT count(*)::int AS taken FROM enrollments WHERE event_id=$1 AND status IN ('reserved','completed')`, [eventId]);
    let status = 'reserved';
    if (taken >= evRow.capacity) {
      if (!evRow.allow_waitlist) throw badRequest('this event is full');
      status = 'waitlisted';
    }
    const { rows: [{ price }] } = await client.query(
      'SELECT COALESCE(e.price_cents, c.price_cents, 0) AS price FROM events e LEFT JOIN courses c ON c.id=e.course_id WHERE e.id=$1', [eventId]);
    const { rows: [enrollment] } = existing
      ? await client.query(`UPDATE enrollments SET status=$3, amount_cents=$4, updated_at=now() WHERE event_id=$1 AND user_id=$2 RETURNING *`, [eventId, user.id, status, price])
      : await client.query(`INSERT INTO enrollments (event_id, user_id, status, amount_cents) VALUES ($1,$2,$3,$4) RETURNING *`, [eventId, user.id, status, price]);
    return { enrollment, evRow };
  });

  const ev = await getEvent(eventId);
  sendEmail({ to: user.email, ...templates.enrollment(user.first_name, result.evRow, result.enrollment.status) })
    .catch((e) => console.error('enrollment email failed', e.message));

  // when Stripe is configured and the seat costs money, send the student to checkout
  let checkoutUrl = null;
  const stripe = await stripeClient();
  if (stripe && result.enrollment.status === 'reserved' && result.enrollment.amount_cents > 0) {
    const session = await createCheckout(stripe, { enrollment: result.enrollment, event: result.evRow, user });
    await query('UPDATE enrollments SET stripe_checkout_id=$1 WHERE id=$2', [session.id, result.enrollment.id]);
    checkoutUrl = session.url;
  }
  res.status(201).json({ enrollment: shapeEnrollment(result.enrollment), event: ev, checkoutUrl });
}));

meRouter.delete('/enrollments/:id', wrap(async (req, res) => {
  const id = validate(uuid, req.params.id);
  const { rows: [en] } = await query('SELECT * FROM enrollments WHERE id=$1 AND user_id=$2', [id, req.user.id]);
  if (!en) throw notFound();
  if (en.paid_at) throw badRequest('this reservation has been paid; contact the shop to cancel');
  await query(`UPDATE enrollments SET status='cancelled', updated_at=now() WHERE id=$1`, [id]);
  await promoteWaitlist(en.event_id);
  const { rows: [ev] } = await query('SELECT * FROM events WHERE id=$1', [en.event_id]);
  sendEmail({ to: req.user.email, ...templates.cancellation(req.user.first_name, ev) }).catch(() => {});
  res.json({ ok: true });
}));

// move the earliest waitlisted student into a freed seat
export async function promoteWaitlist(eventId) {
  await tx(async (client) => {
    const { rows: [ev] } = await client.query('SELECT * FROM events WHERE id=$1 FOR UPDATE', [eventId]);
    if (!ev) return;
    const { rows: [{ taken }] } = await client.query(
      `SELECT count(*)::int AS taken FROM enrollments WHERE event_id=$1 AND status IN ('reserved','completed')`, [eventId]);
    if (taken >= ev.capacity) return;
    const { rows: [next] } = await client.query(
      `UPDATE enrollments SET status='reserved', updated_at=now() WHERE id = (
         SELECT id FROM enrollments WHERE event_id=$1 AND status='waitlisted' ORDER BY created_at LIMIT 1) RETURNING *`, [eventId]);
    if (next) {
      const { rows: [u] } = await client.query('SELECT * FROM users WHERE id=$1', [next.user_id]);
      sendEmail({ to: u.email, ...templates.enrollment(u.first_name, ev, 'reserved') }).catch(() => {});
    }
  });
}

// ---- profile ----
meRouter.put('/profile', wrap(async (req, res) => {
  const b = validate(z.object({
    firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80),
    phone: z.string().trim().max(40).optional().default(''), dob: z.string().date().nullable().optional(),
    emergencyContact: z.string().trim().max(300).optional().default(''),
  }), req.body);
  const { rows: [u] } = await query(
    `UPDATE users SET first_name=$1, last_name=$2, phone=$3, dob=$4, emergency_contact=$5, updated_at=now() WHERE id=$6 RETURNING *`,
    [b.firstName, b.lastName, b.phone, b.dob || null, b.emergencyContact, req.user.id]);
  res.json({ user: publicUser(u) });
}));

meRouter.post('/avatar', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw badRequest('no file');
  const img = await storeImage('avatars', req.file.buffer, req.file.mimetype, { maxWidth: 600, thumbWidth: 160 });
  await deleteImage(req.user.avatar_key);
  const { rows: [u] } = await query('UPDATE users SET avatar_key=$1, updated_at=now() WHERE id=$2 RETURNING *', [img.key, req.user.id]);
  res.json({ user: publicUser(u) });
}));

// ---- certifications (read-only for students; staff issue them) ----
meRouter.get('/certifications', wrap(async (req, res) => {
  const { rows } = await query('SELECT c.*, a.code AS agency FROM certifications c LEFT JOIN agencies a ON a.id=c.agency_id WHERE c.user_id=$1 ORDER BY c.issued_on DESC NULLS FIRST', [req.user.id]);
  res.json(rows.map(shapeCert));
}));

// ---- logbook ----
const shapeLog = (l) => ({ id: l.id, doveOn: l.dove_on, site: l.site, maxDepthFt: l.max_depth_ft, durationMin: l.duration_min, notes: l.notes });
const logSchema = z.object({ doveOn: z.string().date(), site: z.string().trim().max(120).default(''),
  maxDepthFt: z.coerce.number().min(0).max(1000).nullable().optional(), durationMin: z.coerce.number().int().min(0).max(1440).nullable().optional(),
  notes: z.string().max(2000).default('') });

meRouter.get('/dive-logs', wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM dive_logs WHERE user_id=$1 ORDER BY dove_on DESC, created_at DESC', [req.user.id]);
  res.json(rows.map(shapeLog));
}));
meRouter.post('/dive-logs', wrap(async (req, res) => {
  const b = validate(logSchema, req.body);
  const { rows: [l] } = await query('INSERT INTO dive_logs (user_id, dove_on, site, max_depth_ft, duration_min, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [req.user.id, b.doveOn, b.site, b.maxDepthFt ?? null, b.durationMin ?? null, b.notes]);
  res.status(201).json(shapeLog(l));
}));
meRouter.put('/dive-logs/:id', wrap(async (req, res) => {
  const b = validate(logSchema, req.body);
  const { rows: [l] } = await query('UPDATE dive_logs SET dove_on=$1, site=$2, max_depth_ft=$3, duration_min=$4, notes=$5 WHERE id=$6 AND user_id=$7 RETURNING *',
    [b.doveOn, b.site, b.maxDepthFt ?? null, b.durationMin ?? null, b.notes, validate(uuid, req.params.id), req.user.id]);
  if (!l) throw notFound();
  res.json(shapeLog(l));
}));
meRouter.delete('/dive-logs/:id', wrap(async (req, res) => {
  await query('DELETE FROM dive_logs WHERE id=$1 AND user_id=$2', [validate(uuid, req.params.id), req.user.id]);
  res.json({ ok: true });
}));

// ---- documents ----
export const shapeDoc = (d) => ({ id: d.id, userId: d.user_id, key: d.key, name: d.name, mime: d.mime, size: d.size, kind: d.kind, createdAt: d.created_at });
const DOC_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];

meRouter.get('/documents', wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM documents WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id]);
  res.json(rows.map(shapeDoc));
}));
meRouter.post('/documents', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw badRequest('no file');
  if (!DOC_MIMES.includes(req.file.mimetype)) throw badRequest('upload a PDF or image');
  const b = validate(z.object({ kind: z.enum(['waiver', 'medical', 'certification', 'other']).default('other'), name: z.string().trim().max(150).optional() }), req.body);
  const key = await storeFile(`documents/${req.user.id}`, req.file.buffer, req.file.mimetype, req.file.originalname);
  const { rows: [d] } = await query('INSERT INTO documents (user_id, key, name, mime, size, kind, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$1) RETURNING *',
    [req.user.id, key, b.name || req.file.originalname, req.file.mimetype, req.file.size, b.kind]);
  res.status(201).json(shapeDoc(d));
}));
meRouter.delete('/documents/:id', wrap(async (req, res) => {
  const { rows: [d] } = await query('DELETE FROM documents WHERE id=$1 AND user_id=$2 RETURNING *', [validate(uuid, req.params.id), req.user.id]);
  if (d) await deleteObject(d.key);
  res.json({ ok: true });
}));
