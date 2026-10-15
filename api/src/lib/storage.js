import { S3Client, HeadBucketCommand, CreateBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { badRequest } from './http.js';

export const bucket = config.s3.bucket;

export const s3 = new S3Client({
  endpoint: config.s3.endpoint,
  region: config.s3.region,
  forcePathStyle: true, // required for MinIO
  credentials: { accessKeyId: config.s3.accessKey, secretAccessKey: config.s3.secretKey },
});

// create the bucket on first boot; no-op afterwards
export async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (err) {
    if (err.$metadata?.httpStatusCode !== 404) throw err;
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`created bucket "${bucket}"`);
  }
}

export const headBucket = () => s3.send(new HeadBucketCommand({ Bucket: bucket }));

export async function putObject(key, body, contentType) {
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}

export async function getObject(key) {
  return s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
}

export async function deleteObject(key) {
  try { await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); } catch { /* already gone */ }
}

// key prefixes anyone may read; everything else is permission-checked per request
export const PUBLIC_PREFIXES = ['media/', 'content/', 'courses/', 'sites/', 'posts/', 'staff/', 'avatars/'];
export const isPublicKey = (key) => PUBLIC_PREFIXES.some((p) => key.startsWith(p));
export const thumbKey = (key) => (key?.endsWith('.webp') ? key.replace(/\.webp$/, '_thumb.webp') : key);

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif'];

// Normalise an uploaded image: rotate per EXIF, cap the long edge, store as WebP plus a
// thumbnail. Returns { key, width, height, size }. Keys are unique so they cache forever.
export async function storeImage(prefix, buffer, mime, { maxWidth = 1800, thumbWidth = 480 } = {}) {
  if (!IMAGE_MIMES.includes(mime)) throw badRequest('unsupported image type');
  const id = randomUUID();
  const key = `${prefix}/${id}.webp`;
  const base = sharp(buffer, { failOn: 'none' }).rotate();
  const main = await base.clone().resize({ width: maxWidth, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const thumb = await base.clone().resize({ width: thumbWidth, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  await Promise.all([
    putObject(key, main.data, 'image/webp'),
    putObject(thumbKey(key), thumb, 'image/webp'),
  ]);
  return { key, width: main.info.width, height: main.info.height, size: main.data.length };
}

export async function deleteImage(key) {
  if (!key) return;
  await Promise.all([deleteObject(key), deleteObject(thumbKey(key))]);
}

// non-image files (PDF waivers etc.) are stored as-is
export async function storeFile(prefix, buffer, mime, originalName) {
  const ext = (originalName?.match(/\.[a-z0-9]{1,5}$/i)?.[0] || '').toLowerCase();
  const key = `${prefix}/${randomUUID()}${ext}`;
  await putObject(key, buffer, mime);
  return key;
}
