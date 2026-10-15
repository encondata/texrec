import { randomBytes, scrypt, timingSafeEqual, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { promisify } from 'node:util';
import { config } from '../config.js';

const scryptAsync = promisify(scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  if (!stored) return false;
  const [algo, n, saltB64, keyB64] = stored.split('$');
  if (algo !== 'scrypt') return false;
  const key = Buffer.from(keyB64, 'base64');
  const derived = await scryptAsync(password, Buffer.from(saltB64, 'base64'), key.length, { ...SCRYPT, N: Number(n) });
  return timingSafeEqual(key, derived);
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// AES-256-GCM with a key derived from APP_SECRET; used for secrets stored in the settings table
const key = createHash('sha256').update(config.appSecret).digest();

export function encrypt(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `enc:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
}

export function decrypt(value) {
  if (typeof value !== 'string' || !value.startsWith('enc:')) return value;
  const [, ivB64, tagB64, dataB64] = value.split(':');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}
