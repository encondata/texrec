import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { put, upload } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { StaffProfile, User } from '@/lib/types';
import { Avatar, Check, Field, ImagePicker, Input, Loading, Modal, Tag, Textarea } from '@/components/ui';
import { fullName } from '@/lib/format';
import { useList, useAction, useFormState, imageForm, Head } from './shared';
import { UserForm } from './Students';

type StaffRow = User & { profile: StaffProfile | null };

// public bio editor; admins can edit anyone, staff only themselves
function ProfileForm({ user, onDone }: { user: StaffRow; onDone: () => void }) {
  const p = user.profile;
  const f = useFormState({ title: p?.title || '', bio: p?.bio || '', certifications: (p?.certifications || []).join('\n'), agencies: p?.agencies || [], public: p?.public ?? true, sort: String(p?.sort ?? 100) });
  const [photoKey, setPhotoKey] = useState(p?.photoKey);
  const inv = [['admin', 'staff'], ['staff'], ['admin', 'user', user.id]];
  const save = useAction((v: typeof f.v) => put(`/admin/users/${user.id}/profile`, { ...v, certifications: v.certifications.split('\n').map((s) => s.trim()).filter(Boolean), sort: Number(v.sort) }), { invalidate: inv, ok: 'Bio saved.', onSuccess: onDone });
  const photo = useAction((file: File) => upload<StaffProfile>(`/admin/users/${user.id}/photo`, imageForm(file)), { invalidate: inv, ok: 'Photo updated.', onSuccess: (r) => setPhotoKey(r.photoKey) });
  const toggle = (a: string) => f.set('agencies', f.v.agencies.includes(a) ? f.v.agencies.filter((x) => x !== a) : [...f.v.agencies, a]);
  return (
    <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(f.v); }}>
      <div className="form-grid">
        <Field label="Title / role" className="span-2"><Input placeholder="Instructor Trainer" {...f.bind('title')} /></Field>
        <Field label="Bio" className="span-2"><Textarea rows={5} {...f.bind('bio')} /></Field>
        <Field label="Certifications (one per line)" className="span-2"><Textarea rows={4} {...f.bind('certifications')} /></Field>
        <div className="span-2"><div className="label" style={{ marginBottom: 6 }}>Agencies</div><div className="chips">{['SDI', 'TDI', 'RAID'].map((a) => <button type="button" key={a} className={`chip ${f.v.agencies.includes(a) ? 'active' : ''}`} onClick={() => toggle(a)}>{a}</button>)}</div></div>
        <div className="span-2"><div className="label" style={{ marginBottom: 6 }}>Photo</div><ImagePicker imageKey={photoKey} onFile={(file) => photo.mutate(file)} busy={photo.isPending} /></div>
        <Field label="Sort order" hint="Lower shows first on the Instructors page"><Input type="number" {...f.bind('sort')} /></Field>
        <Check label="Show on the public Instructors page" {...f.bindCheck('public')} />
      </div>
      <div className="form-actions"><button type="button" className="btn btn-secondary" onClick={onDone}>Cancel</button><button className="btn btn-primary" disabled={save.isPending}>Save</button></div>
    </form>
  );
}

export function Staff() {
  const { user: me } = useAuth();
  const q = useList<StaffRow[]>(['admin', 'staff'], '/admin/users/staff');
  const [bio, setBio] = useState<StaffRow | null>(null);
  const [account, setAccount] = useState<StaffRow | 'new' | null>(null);
  const isAdmin = me?.role === 'admin';
  return (
    <>
      <Head title="Instructors & Staff" sub="Staff accounts can sign in to the admin portal; public bios appear on the Instructors page.">
        {isAdmin && <button className="btn btn-primary btn-sm" onClick={() => setAccount('new')}><Plus size={16} /> Add staff account</button>}
      </Head>
      {q.isLoading && <Loading />}
      <div className="grid grid-3">
        {(q.data || []).map((s) => (
          <div key={s.id} className="card card-pad">
            <div className="row" style={{ gap: 12, flexWrap: 'nowrap' }}>
              <Avatar user={s} imageKey={s.profile?.photoKey || s.avatarKey} size="lg" />
              <div style={{ minWidth: 0 }}>
                <b>{fullName(s)}</b> {s.role === 'admin' && <Tag tone="navy">Admin</Tag>}{!s.active && <Tag tone="danger">Inactive</Tag>}
                <div className="small muted">{s.profile?.title || 'No title yet'}</div>
                <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.email}</div>
              </div>
            </div>
            <div className="row" style={{ gap: 6, marginTop: 10 }}>{(s.profile?.agencies || []).map((a) => <Tag key={a} tone="blue">{a}</Tag>)}{s.profile && !s.profile.public && <Tag>Hidden</Tag>}</div>
            <div className="row" style={{ marginTop: 12 }}>
              {(isAdmin || s.id === me?.id) && <button className="btn btn-secondary btn-sm" onClick={() => setBio(s)}>Edit bio</button>}
              {isAdmin && <button className="btn btn-ghost btn-sm" onClick={() => setAccount(s)}>Account</button>}
            </div>
          </div>
        ))}
      </div>
      {bio && <Modal title={`${fullName(bio)} — public bio`} onClose={() => setBio(null)} wide><ProfileForm user={bio} onDone={() => setBio(null)} /></Modal>}
      {account && <Modal title={account === 'new' ? 'Add staff account' : `${fullName(account)} — account`} onClose={() => setAccount(null)}><UserForm init={account === 'new' ? { role: 'staff' } as any : account} allowRole onDone={() => setAccount(null)} /></Modal>}
    </>
  );
}

export function MyAccount() {
  const { user, setUser } = useAuth();
  const q = useList<StaffRow[]>(['admin', 'staff'], '/admin/users/staff');
  const meRow = q.data?.find((s) => s.id === user?.id);
  const [bio, setBio] = useState(false);
  const f = useFormState({ firstName: user!.firstName, lastName: user!.lastName, phone: user!.phone || '' });
  const save = useAction((v: typeof f.v) => put<{ user: User }>('/me/profile', v), { ok: 'Saved.', invalidate: [['admin', 'staff']], onSuccess: (r) => setUser(r.user) });
  const avatar = useAction((file: File) => upload<{ user: User }>('/me/avatar', imageForm(file)), { ok: 'Photo updated.', onSuccess: (r) => setUser(r.user) });
  return (
    <>
      <Head title="My Account" sub={user?.email} />
      <div className="two-col">
        <form className="card card-pad stack" onSubmit={(e) => { e.preventDefault(); save.mutate(f.v); }}>
          <div className="form-grid">
            <Field label="First name"><Input required {...f.bind('firstName')} /></Field>
            <Field label="Last name"><Input required {...f.bind('lastName')} /></Field>
            <Field label="Phone"><Input type="tel" {...f.bind('phone')} /></Field>
          </div>
          <div className="form-actions"><button className="btn btn-primary" disabled={save.isPending}>Save</button></div>
        </form>
        <div className="stack">
          <div className="card card-pad row" style={{ gap: 16 }}>
            <Avatar user={user} size="lg" />
            <div><b>{fullName(user)}</b><div className="small muted">{user?.role}</div>
              <label className="btn btn-secondary btn-sm" style={{ marginTop: 8 }}>{avatar.isPending ? 'Uploading…' : 'Change photo'}<input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && avatar.mutate(e.target.files[0])} /></label></div>
          </div>
          <div className="card card-pad"><h3 style={{ marginBottom: 6 }}>Public bio</h3><p className="small muted">What visitors see on the Instructors page.</p>{meRow ? <button className="btn btn-secondary btn-sm" onClick={() => setBio(true)}>Edit bio</button> : <Loading />}</div>
          <div className="card card-pad"><h3 style={{ marginBottom: 6 }}>Password</h3><Link to="/change-password" className="btn btn-secondary btn-sm">Change password</Link></div>
        </div>
      </div>
      {bio && meRow && <Modal title="My public bio" onClose={() => setBio(false)} wide><ProfileForm user={meRow} onDone={() => setBio(false)} /></Modal>}
    </>
  );
}
