export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const notFound = (msg = 'not found') => new HttpError(404, msg);
export const badRequest = (msg = 'bad request', details) => new HttpError(400, msg, details);
export const forbidden = (msg = 'forbidden') => new HttpError(403, msg);
export const unauthorized = (msg = 'sign in required') => new HttpError(401, msg);

// wrap an async route handler so rejections reach the error middleware
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function slugify(s) {
  return String(s).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';
}
