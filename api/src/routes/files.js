import { Router } from 'express';
import { query } from '../db.js';
import { wrap, notFound, forbidden } from '../lib/http.js';
import { getObject, isPublicKey } from '../lib/storage.js';
import { isStaff } from '../lib/auth.js';

// Streams objects out of MinIO. Public prefixes cache forever (keys are unique per upload);
// documents are only served to their owner or staff.
export const filesRouter = Router();

filesRouter.get(/^\/(.+)$/, wrap(async (req, res) => {
  const key = req.params[0];
  if (key.includes('..')) throw notFound();

  if (!isPublicKey(key)) {
    if (!req.user) throw forbidden();
    if (!isStaff(req.user)) {
      const { rows: [d] } = await query('SELECT 1 FROM documents WHERE key=$1 AND user_id=$2', [key, req.user.id]);
      if (!d) throw forbidden();
    }
  }

  let obj;
  try { obj = await getObject(key); }
  catch (err) { if (err.name === 'NoSuchKey') throw notFound(); throw err; }

  res.set('Content-Type', obj.ContentType || 'application/octet-stream');
  if (obj.ContentLength) res.set('Content-Length', String(obj.ContentLength));
  res.set('Cache-Control', isPublicKey(key) ? 'public, max-age=31536000, immutable' : 'private, no-store');
  if (req.query.download) res.set('Content-Disposition', `attachment; filename="${key.split('/').pop()}"`);
  obj.Body.pipe(res);
}));
