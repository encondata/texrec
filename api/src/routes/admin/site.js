import { Router } from 'express';
import multer from 'multer';
import { query } from '../../db.js';
import { wrap, notFound, badRequest } from '../../lib/http.js';
import { validate, z, uuid } from '../../lib/validate.js';
import { requireRole } from '../../lib/auth.js';
import { storeImage, deleteImage } from '../../lib/storage.js';
import { CONTENT_SCHEMA, getContent, setContent } from '../../lib/content.js';
import { SETTINGS, getSettingMasked, updateSetting, getSetting } from '../../lib/settings.js';
import { sendEmail } from '../../lib/email.js';
import { shapeMedia } from '../public.js';

// gallery media, site content blocks, settings, dashboard
export const siteRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024, files: 20 } });

// ---------- gallery ----------
siteRouter.get('/media', wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM media ORDER BY sort, created_at DESC');
  res.json(rows.map(shapeMedia));
}));

const mediaMeta = z.object({ album: z.enum(['classes', 'dive_sites', 'travel', 'videos', 'other']).default('classes'),
  title: z.string().trim().max(200).default(''), caption: z.string().max(1000).default(''), videoUrl: z.string().trim().url().max(500).nullable().optional(),
  public: z.boolean().default(true), sort: z.coerce.number().int().default(100) });

// multi-file upload; each file becomes one gallery item
siteRouter.post('/media', upload.array('files', 20), wrap(async (req, res) => {
  if (!req.files?.length) throw badRequest('no files');
  const b = validate(mediaMeta.partial(), req.body);
  const out = [];
  for (const f of req.files) {
    const img = await storeImage('media', f.buffer, f.mimetype, { maxWidth: 2000, thumbWidth: 600 });
    const { rows: [m] } = await query(
      `INSERT INTO media (key, mime, width, height, size, title, caption, album, public, sort, uploaded_by) VALUES ($1,'image/webp',$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [img.key, img.width, img.height, img.size, b.title || f.originalname.replace(/\.[^.]+$/, ''), b.caption || '', b.album || 'classes', b.public ?? true, b.sort ?? 100, req.user.id]);
    out.push(shapeMedia(m));
  }
  res.status(201).json(out);
}));

// a video entry is just a link (YouTube/Vimeo) with an optional poster image uploaded later
siteRouter.post('/media/video', wrap(async (req, res) => {
  const b = validate(mediaMeta.extend({ videoUrl: z.string().trim().url().max(500) }), req.body);
  const { rows: [m] } = await query(
    `INSERT INTO media (key, mime, title, caption, album, video_url, public, sort, uploaded_by) VALUES ('', 'video/link', $1,$2,'videos',$3,$4,$5,$6) RETURNING *`,
    [b.title, b.caption, b.videoUrl, b.public, b.sort, req.user.id]);
  res.status(201).json(shapeMedia(m));
}));

siteRouter.put('/media/:id', wrap(async (req, res) => {
  const b = validate(mediaMeta, req.body);
  const { rows: [m] } = await query(
    `UPDATE media SET album=$1, title=$2, caption=$3, video_url=$4, public=$5, sort=$6 WHERE id=$7 RETURNING *`,
    [b.album, b.title, b.caption, b.videoUrl ?? null, b.public, b.sort, validate(uuid, req.params.id)]);
  if (!m) throw notFound();
  res.json(shapeMedia(m));
}));

siteRouter.delete('/media/:id', wrap(async (req, res) => {
  const { rows: [m] } = await query('DELETE FROM media WHERE id=$1 RETURNING key', [validate(uuid, req.params.id)]);
  if (!m) throw notFound();
  if (m.key) await deleteImage(m.key);
  res.json({ ok: true });
}));

// ---------- site content ----------
siteRouter.get('/content', wrap(async (req, res) => {
  res.json({ schema: CONTENT_SCHEMA, values: await getContent() });
}));

siteRouter.put('/content', wrap(async (req, res) => {
  const b = validate(z.object({ values: z.record(z.any()) }), req.body);
  for (const [key, value] of Object.entries(b.values)) {
    const field = CONTENT_SCHEMA.find((f) => f.key === key);
    if (!field) continue;
    if (field.type === 'list') {
      if (!Array.isArray(value)) throw badRequest(`${key} must be a list`);
      await setContent(key, value.slice(0, 20).map((item) => Object.fromEntries(field.itemFields.map((f) => [f.key, String(item?.[f.key] ?? '').slice(0, 500)]))));
    } else {
      await setContent(key, String(value ?? '').slice(0, 50000));
    }
  }
  res.json({ values: await getContent() });
}));

siteRouter.post('/content/image', upload.single('file'), wrap(async (req, res) => {
  const { key } = validate(z.object({ key: z.string() }), req.body);
  const field = CONTENT_SCHEMA.find((f) => f.key === key && f.type === 'image');
  if (!field) throw badRequest('not an image field');
  if (!req.file) throw badRequest('no file');
  const img = await storeImage('content', req.file.buffer, req.file.mimetype, { maxWidth: 2400, thumbWidth: 800 });
  const prev = (await getContent())[key];
  await setContent(key, img.key);
  if (prev) await deleteImage(prev);
  res.json({ key, imageKey: img.key });
}));

// ---------- settings (admin only) ----------
siteRouter.get('/settings', requireRole('admin'), wrap(async (req, res) => {
  const out = {};
  for (const key of Object.keys(SETTINGS)) out[key] = await getSettingMasked(key);
  res.json(out);
}));

siteRouter.put('/settings/:key', requireRole('admin'), wrap(async (req, res) => {
  const key = req.params.key;
  if (!SETTINGS[key]) throw notFound();
  await updateSetting(key, req.body || {});
  res.json(await getSettingMasked(key));
}));

siteRouter.post('/settings/email/test', requireRole('admin'), wrap(async (req, res) => {
  const { to } = validate(z.object({ to: z.string().email() }), req.body);
  try {
    const r = await sendEmail({ to, subject: 'TexRec test email', text: 'If you can read this, outgoing email is working.' });
    res.json({ ok: true, result: r });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
}));

// ---------- dashboard ----------
siteRouter.get('/dashboard', wrap(async (req, res) => {
  const { rows: [s] } = await query(`SELECT
    (SELECT count(*)::int FROM users WHERE role='student' AND active) AS students,
    (SELECT count(*)::int FROM events WHERE starts_at > now() AND published) AS upcoming_events,
    (SELECT count(*)::int FROM enrollments en JOIN events e ON e.id=en.event_id WHERE en.status='reserved' AND e.starts_at > now()) AS upcoming_seats,
    (SELECT count(*)::int FROM enrollments en JOIN events e ON e.id=en.event_id WHERE en.status='waitlisted' AND e.starts_at > now()) AS waitlisted,
    (SELECT count(*)::int FROM enrollments en JOIN events e ON e.id=en.event_id WHERE en.status='reserved' AND en.paid_at IS NULL AND en.amount_cents > 0 AND e.starts_at > now()) AS unpaid,
    (SELECT count(*)::int FROM users WHERE role='student' AND created_at > now() - interval '30 days') AS new_students_30d`);
  const { rows: recent } = await query(
    `SELECT en.id, en.status, en.created_at, u.first_name, u.last_name, e.title, e.starts_at
     FROM enrollments en JOIN users u ON u.id=en.user_id JOIN events e ON e.id=en.event_id ORDER BY en.created_at DESC LIMIT 10`);
  const stripe = await getSetting('stripe');
  res.json({
    stats: { students: s.students, upcomingEvents: s.upcoming_events, upcomingSeats: s.upcoming_seats, waitlisted: s.waitlisted, unpaid: s.unpaid, newStudents30d: s.new_students_30d },
    recent: recent.map((r) => ({ id: r.id, status: r.status, createdAt: r.created_at, student: `${r.first_name} ${r.last_name}`, event: r.title, startsAt: r.starts_at })),
    paymentsEnabled: !!stripe.enabled,
  });
}));
