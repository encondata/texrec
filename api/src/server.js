import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { pool, migrate } from './db.js';
import { ensureBucket, headBucket } from './lib/storage.js';
import { attachUser, csrfGuard } from './lib/auth.js';
import { HttpError } from './lib/http.js';
import { bootstrap } from './bootstrap.js';
import { publicRouter } from './routes/public.js';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';
import { filesRouter } from './routes/files.js';
import { adminRouter } from './routes/admin/index.js';
import { stripeWebhookRouter } from './routes/stripe.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // nginx sits in front
app.use(helmet({ contentSecurityPolicy: false })); // CSP is set by nginx for the SPA
app.use(cookieParser());

// Stripe needs the raw body, so it mounts before express.json()
app.use('/api/stripe', stripeWebhookRouter);

app.use(express.json({ limit: '2mb' }));
// API JSON is never cached by the browser; file responses set their own caching
app.use('/api', (req, res, next) => { if (!req.path.startsWith('/files/')) res.set('Cache-Control', 'no-store'); next(); });
app.use(attachUser);
app.use(csrfGuard);

// liveness + dependency check, used by the compose healthcheck
app.get('/api/health', async (req, res) => {
  const checks = {};
  try { await pool.query('SELECT 1'); checks.db = 'ok'; } catch (e) { checks.db = e.message; }
  try { await headBucket(); checks.storage = 'ok'; } catch (e) { checks.storage = e.name; }
  const ok = Object.values(checks).every((v) => v === 'ok');
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', ...checks });
});

app.use('/api/auth', authRouter);
app.use('/api/me', meRouter);
app.use('/api/files', filesRouter);
app.use('/api/admin', adminRouter);
app.use('/api', publicRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));

app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
  if (err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'file too large' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid JSON' });
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

await migrate();
await ensureBucket();
await bootstrap();

const server = app.listen(config.port, () => console.log(`api listening on :${config.port}`));
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => server.close(() => pool.end().then(() => process.exit(0))));
}
