import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, get, upload } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { Markdown, Textarea } from '@/components/ui';

export const useList = <T,>(key: string[], path: string) => useQuery({ queryKey: key, queryFn: () => get<T>(path) });

// mutation with toast + invalidation baked in
export function useAction<TArg = void, TRes = unknown>(fn: (a: TArg) => Promise<TRes>, opts: { invalidate?: string[][]; ok?: string; onSuccess?: (r: TRes) => void } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => { for (const k of opts.invalidate || []) qc.invalidateQueries({ queryKey: k }); if (opts.ok) toast(opts.ok); opts.onSuccess?.(r); },
    onError: (e: ApiError) => toast(e.details ? `${e.message}: ${Object.entries(e.details).map(([k, v]) => `${k} ${v}`).join(', ')}` : e.message, 'err'),
  });
}

export const imageForm = (f: File, field = 'file') => { const fd = new FormData(); fd.append(field, f); return fd; };

// form state helper: bind(key) for inputs, set for programmatic updates
export function useFormState<T extends object>(init: T) {
  const [v, setV] = useState<T>(init);
  const bind = (k: keyof T) => ({ value: (v[k] ?? '') as any, onChange: (e: any) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }) });
  const bindCheck = (k: keyof T) => ({ checked: !!v[k], onChange: (e: any) => setV({ ...v, [k]: e.target.checked }) });
  return { v, setV, bind, bindCheck, set: (k: keyof T, val: any) => setV((s) => ({ ...s, [k]: val })) };
}

// side-by-side markdown editor with an image-insert button that uploads to MinIO
export function MarkdownEditor({ value, onChange, rows = 14 }: { value: string; onChange: (v: string) => void; rows?: number }) {
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const insertImage = async (f: File) => {
    setBusy(true);
    try { const r = await upload<{ url: string }>('/admin/images', imageForm(f)); onChange(`${value}\n\n![${f.name.replace(/\.[^.]+$/, '')}](${r.url})\n`); }
    catch (e) { toast((e as ApiError).message, 'err'); } finally { setBusy(false); }
  };
  return (
    <div>
      <div className="row" style={{ marginBottom: 6, gap: 8 }}>
        <span className="tiny muted">Markdown: **bold**, ## heading, - list, [link](url)</span>
        <span className="spacer" />
        <label className="btn btn-secondary btn-sm">{busy ? 'Uploading…' : 'Insert image'}<input type="file" accept="image/*" hidden disabled={busy} onChange={(e) => e.target.files?.[0] && insertImage(e.target.files[0])} /></label>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPreview(!preview)}>{preview ? 'Edit' : 'Preview'}</button>
      </div>
      <div className={preview ? 'md-editor' : ''}>
        <Textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 14 }} />
        {preview && <div className="preview"><Markdown text={value} /></div>}
      </div>
    </div>
  );
}

export const Head = ({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) => (
  <div className="app-head"><div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>{children && <div className="row">{children}</div>}</div>
);
