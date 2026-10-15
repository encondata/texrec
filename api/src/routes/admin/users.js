import { Router } from 'express';
import multer from 'multer';
import { query } from '../../db.js';
import { wrap, notFound, badRequest, forbidden } from '../../lib/http.js';
import { validate, z, uuid, email } from '../../lib/validate.js';
import { requireRole, publicUser } from '../../lib/auth.js';
import { hashPassword, randomToken } from '../../lib/crypto.js';
import { storeImage, storeFile, deleteImage, deleteObject } from '../../lib/storage.js';
import { sendEmail, templates } from '../../lib/email.js';
import { listEvents } from '../../lib/events.js';
import { shapeCert, shapeDoc, shapeEnrollment } from '../me.js';

export const usersRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const shapeProfile = (p) => p && ({ title: p.title, bio: p.bio, certifications: p.certifications, agencies: p.agencies, photoKey: p.photo_key, public: p.public, sort: p.sort });

// staff may manage students; only admins may manage staff/admin accounts
const canManage = (actor, targetRole) => actor.role === 'admin' || targetRole === 'student';

usersRouter.get('/', wrap(async (req, res) => {
  const q = validate(z.object({ role: z.enum(['admin', 'staff', 'student']).optional(), q: z.string().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(200) }), req.query);
  const params = [];
  const where = [];
  if (q.role) { params.push(q.role); where.push(`u.role=$${params.length}`); }
  if (q.q) { params.push(`%${q.q}%`); where.push(`(u.first_name || ' ' || u.last_name || ' ' || u.email) ILIKE $${params.length}`); }
  const { rows } = await query(
    `SELECT u.*, (SELECT count(*)::int FROM enrollments e WHERE e.user_id=u.id AND e.status IN ('reserved','waitlisted')) AS upcoming,
            (SELECT count(*)::int FROM certifications c WHERE c.user_id=u.id AND c.status='issued') AS certs
     FROM users u ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY u.last_name, u.first_name LIMIT ${q.limit}`, params);
  res.json(rows.map((u) => ({ ...publicUser(u), upcoming: u.upcoming, certs: u.certs })));
}));

// staff/admin accounts, for instructor assignment and the instructors admin page
usersRouter.get('/staff', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT u.*, row_to_json(sp.*) AS profile FROM users u LEFT JOIN staff_profiles sp ON sp.user_id=u.id
     WHERE u.role IN ('staff','admin') ORDER BY COALESCE(sp.sort, 100), u.first_name`);
  res.json(rows.map((u) => ({ ...publicUser(u), profile: shapeProfile(u.profile) })));
}));

const userBody = z.object({
  email, firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(40).optional().default(''), role: z.enum(['admin', 'staff', 'student']).default('student'),
  dob: z.string().date().nullable().optional(), emergencyContact: z.string().trim().max(300).optional().default(''),
  active: z.boolean().optional().default(true),
});

usersRouter.post('/', wrap(async (req, res) => {
  const b = validate(userBody, req.body);
  if (!canManage(req.user, b.role)) throw forbidden('only admins can create staff accounts');
  const { rows: [exists] } = await query('SELECT 1 FROM users WHERE lower(email)=$1', [b.email]);
  if (exists) throw badRequest('an account with that email already exists', { email: 'already registered' });
  const temp = randomToken(9);
  const { rows: [u] } = await query(
    `INSERT INTO users (email, password_hash, role, first_name, last_name, phone, dob, emergency_contact, must_change_password, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9) RETURNING *`,
    [b.email, await hashPassword(temp), b.role, b.firstName, b.lastName, b.phone, b.dob || null, b.emergencyContact, b.active]);
  if (b.role !== 'student') await query('INSERT INTO staff_profiles (user_id) VALUES ($1)', [u.id]);
  sendEmail({ to: u.email, ...templates.staffInvite(u.first_name, temp) }).catch((e) => console.error('invite email failed', e.message));
  res.status(201).json({ user: publicUser(u), temporaryPassword: temp });
}));

usersRouter.get('/:id', wrap(async (req, res) => {
  const id = validate(uuid, req.params.id);
  const { rows: [u] } = await query('SELECT u.*, row_to_json(sp.*) AS profile FROM users u LEFT JOIN staff_profiles sp ON sp.user_id=u.id WHERE u.id=$1', [id]);
  if (!u) throw notFound();
  const [enr, certs, docs, logs] = await Promise.all([
    query('SELECT * FROM enrollments WHERE user_id=$1 ORDER BY created_at DESC', [id]),
    query('SELECT c.*, a.code AS agency FROM certifications c LEFT JOIN agencies a ON a.id=c.agency_id WHERE c.user_id=$1 ORDER BY c.issued_on DESC NULLS FIRST', [id]),
    query('SELECT * FROM documents WHERE user_id=$1 ORDER BY created_at DESC', [id]),
    query('SELECT count(*)::int AS n FROM dive_logs WHERE user_id=$1', [id]),
  ]);
  const events = enr.rows.length ? await listEvents({ where: ['e.id = ANY($1)'], params: [enr.rows.map((r) => r.event_id)], order: 'e.starts_at DESC' }) : [];
  const byEvent = Object.fromEntries(enr.rows.map((r) => [r.event_id, r]));
  res.json({
    user: publicUser(u), profile: shapeProfile(u.profile),
    enrollments: events.map((ev) => ({ enrollment: shapeEnrollment(byEvent[ev.id]), event: ev })),
    certifications: certs.rows.map(shapeCert), documents: docs.rows.map(shapeDoc), loggedDives: logs.rows[0].n,
  });
}));

usersRouter.put('/:id', wrap(async (req, res) => {
  const id = validate(uuid, req.params.id);
  const b = validate(userBody, req.body);
  const { rows: [cur] } = await query('SELECT * FROM users WHERE id=$1', [id]);
  if (!cur) throw notFound();
  if (!canManage(req.user, cur.role) || !canManage(req.user, b.role)) throw forbidden();
  if (cur.id === req.user.id && b.role !== cur.role) throw badRequest('you cannot change your own role');
  const { rows: [exists] } = await query('SELECT 1 FROM users WHERE lower(email)=$1 AND id<>$2', [b.email, id]);
  if (exists) throw badRequest('another account uses that email', { email: 'already registered' });
  const { rows: [u] } = await query(
    `UPDATE users SET email=$1, first_name=$2, last_name=$3, phone=$4, role=$5, dob=$6, emergency_contact=$7, active=$8, updated_at=now()
     WHERE id=$9 RETURNING *`, [b.email, b.firstName, b.lastName, b.phone, b.role, b.dob || null, b.emergencyContact, b.active, id]);
  if (b.role !== 'student') await query('INSERT INTO staff_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);
  if (!b.active) await query('DELETE FROM sessions WHERE user_id=$1', [id]);
  res.json({ user: publicUser(u) });
}));

usersRouter.delete('/:id', requireRole('admin'), wrap(async (req, res) => {
  const id = validate(uuid, req.params.id);
  if (id === req.user.id) throw badRequest('you cannot delete your own account');
  const { rows: docs } = await query('SELECT key FROM documents WHERE user_id=$1', [id]);
  const { rows: [u] } = await query('DELETE FROM users WHERE id=$1 RETURNING avatar_key', [id]);
  if (!u) throw notFound();
  await Promise.all([deleteImage(u.avatar_key), ...docs.map((d) => deleteObject(d.key))]);
  res.json({ ok: true });
}));

usersRouter.post('/:id/reset-password', wrap(async (req, res) => {
  const id = validate(uuid, req.params.id);
  const { rows: [u] } = await query('SELECT * FROM users WHERE id=$1', [id]);
  if (!u) throw notFound();
  if (!canManage(req.user, u.role)) throw forbidden();
  const temp = randomToken(9);
  await query('UPDATE users SET password_hash=$1, must_change_password=true, updated_at=now() WHERE id=$2', [await hashPassword(temp), id]);
  await query('DELETE FROM sessions WHERE user_id=$1', [id]);
  sendEmail({ to: u.email, ...templates.staffInvite(u.first_name, temp) }).catch(() => {});
  res.json({ temporaryPassword: temp });
}));

// ---- staff profile (public bio) ----
const profileBody = z.object({ title: z.string().trim().max(120).default(''), bio: z.string().max(5000).default(''),
  certifications: z.array(z.string().trim().max(120)).max(50).default([]), agencies: z.array(z.string().trim().max(20)).max(10).default([]),
  public: z.boolean().default(true), sort: z.coerce.number().int().default(100) });

usersRouter.put('/:id/profile', wrap(async (req, res) => {
  const id = validate(uuid, req.params.id);
  if (req.user.role !== 'admin' && req.user.id !== id) throw forbidden('you can only edit your own bio');
  const b = validate(profileBody, req.body);
  const { rows: [p] } = await query(
    `INSERT INTO staff_profiles (user_id, title, bio, certifications, agencies, public, sort) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (user_id) DO UPDATE SET title=$2, bio=$3, certifications=$4, agencies=$5, public=$6, sort=$7 RETURNING *`,
    [id, b.title, b.bio, b.certifications, b.agencies, b.public, b.sort]);
  res.json(shapeProfile(p));
}));

usersRouter.post('/:id/photo', upload.single('file'), wrap(async (req, res) => {
  const id = validate(uuid, req.params.id);
  if (req.user.role !== 'admin' && req.user.id !== id) throw forbidden();
  if (!req.file) throw badRequest('no file');
  const img = await storeImage('staff', req.file.buffer, req.file.mimetype, { maxWidth: 1000, thumbWidth: 400 });
  const { rows: [old] } = await query('SELECT photo_key FROM staff_profiles WHERE user_id=$1', [id]);
  await deleteImage(old?.photo_key);
  const { rows: [p] } = await query(
    `INSERT INTO staff_profiles (user_id, photo_key) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET photo_key=$2 RETURNING *`, [id, img.key]);
  res.json(shapeProfile(p));
}));

// ---- certifications ----
const certBody = z.object({ name: z.string().trim().min(1).max(120), agencyId: z.coerce.number().int().nullable().optional(),
  courseId: uuid.nullable().optional(), certNumber: z.string().trim().max(60).nullable().optional(),
  issuedOn: z.string().date().nullable().optional(), status: z.enum(['in_progress', 'issued']).default('issued') });

usersRouter.post('/:id/certifications', wrap(async (req, res) => {
  const b = validate(certBody, req.body);
  const { rows: [c] } = await query(
    `INSERT INTO certifications (user_id, name, agency_id, course_id, cert_number, issued_on, status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [validate(uuid, req.params.id), b.name, b.agencyId ?? null, b.courseId ?? null, b.certNumber ?? null, b.issuedOn ?? null, b.status]);
  const { rows: [a] } = await query('SELECT code FROM agencies WHERE id=$1', [c.agency_id]);
  res.status(201).json(shapeCert({ ...c, agency: a?.code }));
}));
usersRouter.put('/certifications/:cid', wrap(async (req, res) => {
  const b = validate(certBody, req.body);
  const { rows: [c] } = await query(
    `UPDATE certifications SET name=$1, agency_id=$2, course_id=$3, cert_number=$4, issued_on=$5, status=$6 WHERE id=$7 RETURNING *`,
    [b.name, b.agencyId ?? null, b.courseId ?? null, b.certNumber ?? null, b.issuedOn ?? null, b.status, validate(uuid, req.params.cid)]);
  if (!c) throw notFound();
  const { rows: [a] } = await query('SELECT code FROM agencies WHERE id=$1', [c.agency_id]);
  res.json(shapeCert({ ...c, agency: a?.code }));
}));
usersRouter.delete('/certifications/:cid', wrap(async (req, res) => {
  await query('DELETE FROM certifications WHERE id=$1', [validate(uuid, req.params.cid)]);
  res.json({ ok: true });
}));

// ---- documents on behalf of a student ----
usersRouter.post('/:id/documents', upload.single('file'), wrap(async (req, res) => {
  const id = validate(uuid, req.params.id);
  if (!req.file) throw badRequest('no file');
  const b = validate(z.object({ kind: z.enum(['waiver', 'medical', 'certification', 'other']).default('other'), name: z.string().trim().max(150).optional() }), req.body);
  const key = await storeFile(`documents/${id}`, req.file.buffer, req.file.mimetype, req.file.originalname);
  const { rows: [d] } = await query('INSERT INTO documents (user_id, key, name, mime, size, kind, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [id, key, b.name || req.file.originalname, req.file.mimetype, req.file.size, b.kind, req.user.id]);
  res.status(201).json(shapeDoc(d));
}));
usersRouter.delete('/documents/:did', wrap(async (req, res) => {
  const { rows: [d] } = await query('DELETE FROM documents WHERE id=$1 RETURNING *', [validate(uuid, req.params.did)]);
  if (d) await deleteObject(d.key);
  res.json({ ok: true });
}));
