export class ApiError extends Error {
  status: number;
  details?: Record<string, string>;
  constructor(status: number, message: string, details?: Record<string, string>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

type Options = { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal };

// Thin fetch wrapper: JSON in/out, cookie auth, errors as ApiError
export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(opts.body); }
  const res = await fetch(`/api${path}`, { method: opts.method || (body ? 'POST' : 'GET'), headers, body, credentials: 'same-origin', signal: opts.signal });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) throw new ApiError(res.status, data?.error || res.statusText, data?.details);
  return data as T;
}

export const get = <T,>(path: string) => api<T>(path);
export const post = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body });
export const put = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body });
export const del = <T,>(path: string) => api<T>(path, { method: 'DELETE' });
export const upload = <T,>(path: string, form: FormData, method = 'POST') => api<T>(path, { method, form });

export const fileUrl = (key?: string | null) => (key ? `/api/files/${key}` : '');
export const thumbUrl = (key?: string | null) => (key ? `/api/files/${key.endsWith('.webp') ? key.replace(/\.webp$/, '_thumb.webp') : key}` : '');
