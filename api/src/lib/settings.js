import { query } from '../db.js';
import { encrypt, decrypt } from './crypto.js';

// Each settings key has a default shape; fields listed in `secret` are encrypted at rest
// and only ever returned to admins masked.
export const SETTINGS = {
  email: {
    defaults: {
      provider: 'smtp',          // smtp | sendgrid | postmark | resend | none
      from: 'TexRec <no-reply@texrec.com>',
      smtpHost: 'mailpit', smtpPort: 1025, smtpSecure: false, smtpUser: '', smtpPass: '',
      apiKey: '',
    },
    secret: ['smtpPass', 'apiKey'],
  },
  stripe: {
    defaults: { enabled: false, publishableKey: '', secretKey: '', webhookSecret: '' },
    secret: ['secretKey', 'webhookSecret'],
  },
  registration: {
    defaults: { allowSelfRegister: true, waitlistEnabled: true },
    secret: [],
  },
};

export const MASK = '••••••••';
const cache = new Map();

export async function getSetting(key) {
  if (cache.has(key)) return cache.get(key);
  const def = SETTINGS[key];
  if (!def) throw new Error(`unknown setting ${key}`);
  const { rows: [row] } = await query('SELECT value FROM settings WHERE key=$1', [key]);
  const value = { ...def.defaults, ...(row?.value || {}) };
  for (const f of def.secret) value[f] = decrypt(value[f] ?? '');
  cache.set(key, value);
  return value;
}

// masked copy for the admin UI; secrets show as MASK (or '' when unset)
export async function getSettingMasked(key) {
  const value = { ...(await getSetting(key)) };
  for (const f of SETTINGS[key].secret) value[f] = value[f] ? MASK : '';
  return value;
}

// merge an admin update; a secret field sent as MASK keeps its stored value
export async function updateSetting(key, patch) {
  const def = SETTINGS[key];
  if (!def) throw new Error(`unknown setting ${key}`);
  const current = await getSetting(key);
  const next = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in def.defaults)) continue;
    if (def.secret.includes(k) && v === MASK) continue;
    next[k] = v;
  }
  const stored = { ...next };
  for (const f of def.secret) stored[f] = next[f] ? encrypt(next[f]) : '';
  await query(`INSERT INTO settings (key, value) VALUES ($1,$2)
               ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [key, stored]);
  cache.delete(key);
  return next;
}
