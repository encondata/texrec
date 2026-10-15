import { useEffect, useMemo, useState, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { X } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { fileUrl, thumbUrl } from '@/lib/api';
import { initials } from '@/lib/format';

// ---------- images ----------
export function Img({ imageKey, alt = '', className = 'img-cover', thumb = false, ...rest }: { imageKey?: string | null; alt?: string; className?: string; thumb?: boolean } & Omit<InputHTMLAttributes<HTMLImageElement>, 'src' | 'alt'>) {
  if (!imageKey) return <div className={className} aria-hidden="true" />;
  return <img src={thumb ? thumbUrl(imageKey) : fileUrl(imageKey)} alt={alt} loading="lazy" decoding="async" className={className} {...(rest as any)} />;
}

export function Avatar({ user, imageKey, size = '' }: { user?: { firstName: string; lastName: string; avatarKey?: string | null } | null; imageKey?: string | null; size?: '' | 'sm' | 'lg' }) {
  const key = imageKey ?? user?.avatarKey;
  return (
    <span className={`avatar ${size ? `avatar-${size}` : ''}`} title={user ? `${user.firstName} ${user.lastName}` : undefined}>
      {key ? <img src={thumbUrl(key)} alt="" loading="lazy" /> : initials(user)}
    </span>
  );
}

// ---------- markdown ----------
marked.setOptions({ gfm: true, breaks: true });
export function Markdown({ text, className = 'prose' }: { text?: string | null; className?: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text || '', { async: false }) as string, { ADD_ATTR: ['target'] }), [text]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

// ---------- tags ----------
export const Tag = ({ children, tone = '' }: { children: ReactNode; tone?: '' | 'blue' | 'cyan' | 'ok' | 'warn' | 'danger' | 'navy' }) => (
  <span className={`tag ${tone ? `tag-${tone}` : ''}`}>{children}</span>
);

export function Spots({ left, capacity, waitlisted = 0 }: { left: number; capacity: number; waitlisted?: number }) {
  if (left <= 0) return <span className="spots full">Full{waitlisted ? ` · ${waitlisted} waitlisted` : ''}</span>;
  return <span className={`spots ${left > 2 ? 'ok' : ''}`}>{left} of {capacity} spots remaining</span>;
}

// ---------- forms ----------
type FieldProps = { label: string; hint?: string; error?: string; children: ReactNode; className?: string };
export const Field = ({ label, hint, error, children, className = '' }: FieldProps) => (
  <label className={`field ${className}`}>
    <span className="label">{label}</span>
    {children}
    {hint && !error && <span className="hint">{hint}</span>}
    {error && <span className="error">{error}</span>}
  </label>
);
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input className="input" {...p} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select className="input" {...p} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className="input" {...p} />;
export const Check = ({ label, ...p }: { label: string } & InputHTMLAttributes<HTMLInputElement>) => (
  <label className="check"><input type="checkbox" {...p} /> {label}</label>
);

// ---------- modal ----------
export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-lg' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn btn-secondary btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// confirm dialog as a hook-free component
export function Confirm({ title, text, onYes, onNo, danger = true }: { title: string; text: string; onYes: () => void; onNo: () => void; danger?: boolean }) {
  return (
    <Modal title={title} onClose={onNo}>
      <p>{text}</p>
      <div className="form-actions">
        <button className="btn btn-secondary" onClick={onNo}>Cancel</button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onYes}>Confirm</button>
      </div>
    </Modal>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;
export const Loading = () => <div className="page-loading">Loading…</div>;

// image upload control used across admin forms
export function ImagePicker({ imageKey, onFile, label = 'Upload image', busy = false }: { imageKey?: string | null; onFile: (f: File) => void; label?: string; busy?: boolean }) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => { setPreview(null); }, [imageKey]);
  return (
    <div className="img-drop">
      {preview || imageKey ? <img src={preview || thumbUrl(imageKey)} alt="" /> : <div style={{ width: 120, height: 80, background: 'var(--bg-2)', borderRadius: 8 }} />}
      <label className="btn btn-secondary btn-sm">
        {busy ? 'Uploading…' : label}
        <input type="file" accept="image/*" hidden disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPreview(URL.createObjectURL(f)); onFile(f); } e.target.value = ''; }} />
      </label>
      <span className="tiny muted">JPG, PNG, HEIC or WebP. Converted and resized automatically.</span>
    </div>
  );
}

// chip filter bar
export function Chips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="chips" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={`chip ${value === o.value ? 'active' : ''}`} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}
