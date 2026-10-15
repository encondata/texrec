import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Download, Trash2, KeyRound } from 'lucide-react';
import { get, post, put, del, upload, fileUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Agency, Certification, Document, Enrollment, Event, User } from '@/lib/types';
import { Avatar, Check, Confirm, Empty, Field, Input, Loading, Modal, Select, Tag } from '@/components/ui';
import { bytes, fmtDate, fullName } from '@/lib/format';
import { useList, useAction, useFormState, imageForm, Head } from './shared';
import { EventRow } from '@/components/events';

type Row = User & { upcoming: number; certs: number };

const emptyUser = { email: '', firstName: '', lastName: '', phone: '', role: 'student', dob: '', emergencyContact: '', active: true };

export function UserForm({ init, onDone, allowRole }: { init?: Partial<User>; onDone: (u?: User) => void; allowRole: boolean }) {
  const f = useFormState({ ...emptyUser, ...init, dob: init?.dob ? String(init.dob).slice(0, 10) : '', phone: init?.phone || '', emergencyContact: init?.emergencyContact || '' });
  const [temp, setTemp] = useState<string | null>(null);
  const save = useAction((v: typeof f.v) => init?.id ? put<{ user: User }>(`/admin/users/${init.id}`, { ...v, dob: v.dob || null }) : post<{ user: User; temporaryPassword: string }>('/admin/users', { ...v, dob: v.dob || null }),
    { invalidate: [['admin']], ok: 'Saved.', onSuccess: (r: any) => (r.temporaryPassword ? setTemp(r.temporaryPassword) : onDone(r.user)) });
  if (temp) return (
    <div className="stack">
      <div className="alert alert-ok">Account created. A temporary password was emailed; it is also shown here once in case email isn't set up yet:</div>
      <code style={{ fontSize: '1.2rem', padding: 12, background: 'var(--bg-2)', borderRadius: 8 }}>{temp}</code>
      <div className="form-actions"><button className="btn btn-primary" onClick={() => onDone()}>Done</button></div>
    </div>
  );
  return (
    <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(f.v); }}>
      <div className="form-grid">
        <Field label="First name"><Input required {...f.bind('firstName')} /></Field>
        <Field label="Last name"><Input required {...f.bind('lastName')} /></Field>
        <Field label="Email"><Input type="email" required {...f.bind('email')} /></Field>
        <Field label="Phone"><Input type="tel" {...f.bind('phone')} /></Field>
        <Field label="Date of birth"><Input type="date" {...f.bind('dob')} /></Field>
        {allowRole && <Field label="Role"><Select {...f.bind('role')}><option value="student">Student</option><option value="staff">Staff / Instructor</option><option value="admin">Admin</option></Select></Field>}
        <Field label="Emergency contact" className="span-2"><Input {...f.bind('emergencyContact')} /></Field>
        <Check label="Account active (inactive users cannot sign in)" {...f.bindCheck('active')} />
      </div>
      <div className="form-actions"><button type="button" className="btn btn-secondary" onClick={() => onDone()}>Cancel</button><button className="btn btn-primary" disabled={save.isPending}>{init?.id ? 'Save' : 'Create account'}</button></div>
    </form>
  );
}

export function Students() {
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const nav = useNavigate();
  const q = useList<Row[]>(['admin', 'users', 'student'], '/admin/users?role=student');
  const list = (q.data || []).filter((u) => !search || `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <Head title="Students" sub={`${q.data?.length ?? 0} student accounts`}><button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}><Plus size={16} /> Add student</button></Head>
      <div className="toolbar"><Input placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search students" /></div>
      {q.isLoading && <Loading />}
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Student</th><th>Contact</th><th>Upcoming</th><th>Certs</th><th>Status</th><th>Joined</th></tr></thead>
        <tbody>
          {list.map((u) => (
            <tr key={u.id} className="clickable" onClick={() => nav(`/admin/students/${u.id}`)}>
              <td><span className="row" style={{ gap: 10, flexWrap: 'nowrap' }}><Avatar user={u} size="sm" /><b>{fullName(u)}</b></span></td>
              <td className="small">{u.email}<br /><span className="muted">{u.phone}</span></td>
              <td>{u.upcoming}</td><td>{u.certs}</td>
              <td>{u.active ? <Tag tone="ok">Active</Tag> : <Tag tone="danger">Inactive</Tag>}</td>
              <td className="small muted">{fmtDate(u.createdAt)}</td>
            </tr>
          ))}
          {!q.isLoading && list.length === 0 && <tr><td colSpan={6} className="center muted">No students found.</td></tr>}
        </tbody>
      </table></div>
      {adding && <Modal title="Add student" onClose={() => setAdding(false)}><UserForm onDone={() => setAdding(false)} allowRole={false} /></Modal>}
    </>
  );
}

interface Detail { user: User; profile: any; enrollments: { enrollment: Enrollment; event: Event }[]; certifications: Certification[]; documents: Document[]; loggedDives: number }
const KINDS = { waiver: 'Waiver', medical: 'Medical', certification: 'Cert card', other: 'Other' } as const;
const emptyCert = { name: '', agencyId: '', certNumber: '', issuedOn: '', status: 'issued' };

export function StudentDetail() {
  const { id } = useParams();
  const { user: me } = useAuth();
  const nav = useNavigate();
  const q = useList<Detail>(['admin', 'user', id!], `/admin/users/${id}`);
  const agencies = useList<Agency[]>(['agencies'], '/agencies');
  const [editing, setEditing] = useState(false);
  const [cert, setCert] = useState<null | (typeof emptyCert & { id?: string })>(null);
  const [confirm, setConfirm] = useState<null | { title: string; text: string; run: () => void }>(null);
  const [temp, setTemp] = useState<string | null>(null);
  const [docKind, setDocKind] = useState<keyof typeof KINDS>('waiver');
  const inv = [['admin', 'user', id!], ['admin', 'users']];
  const reset = useAction(() => post<{ temporaryPassword: string }>(`/admin/users/${id}/reset-password`), { onSuccess: (r) => { setTemp(r.temporaryPassword); setConfirm(null); } });
  const remove = useAction(() => del(`/admin/users/${id}`), { invalidate: [['admin']], ok: 'Account deleted.', onSuccess: () => nav('/admin/students') });
  const saveCert = useAction((v: typeof emptyCert & { id?: string }) => { const body = { ...v, agencyId: v.agencyId || null, certNumber: v.certNumber || null, issuedOn: v.issuedOn || null }; return v.id ? put(`/admin/users/certifications/${v.id}`, body) : post(`/admin/users/${id}/certifications`, body); }, { invalidate: inv, ok: 'Certification saved.', onSuccess: () => setCert(null) });
  const rmCert = useAction((cid: string) => del(`/admin/users/certifications/${cid}`), { invalidate: inv, onSuccess: () => setConfirm(null) });
  const upDoc = useAction((f: File) => { const fd = imageForm(f); fd.append('kind', docKind); return upload(`/admin/users/${id}/documents`, fd); }, { invalidate: inv, ok: 'Uploaded.' });
  const rmDoc = useAction((did: string) => del(`/admin/users/documents/${did}`), { invalidate: inv, onSuccess: () => setConfirm(null) });
  const enrollment = useAction(({ eid, body }: { eid: string; body: any }) => put(`/admin/events/enrollments/${eid}`, body), { invalidate: [['admin'], ['events']], ok: 'Updated.' });

  if (!q.data) return <Loading />;
  const { user: u, enrollments, certifications, documents } = q.data;
  const cb = (k: keyof typeof emptyCert) => ({ value: cert![k], onChange: (e: any) => setCert({ ...cert!, [k]: e.target.value }) });
  return (
    <>
      <Link to="/admin/students" className="small">← Students</Link>
      <Head title={fullName(u)} sub={`${u.email}${u.phone ? ` · ${u.phone}` : ''}`}>
        <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Edit</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setConfirm({ title: 'Reset password?', text: `Generate a temporary password for ${fullName(u)} and sign them out everywhere?`, run: () => reset.mutate() })}><KeyRound size={16} /> Reset password</button>
        {me?.role === 'admin' && u.id !== me.id && <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ title: 'Delete account?', text: `Permanently delete ${fullName(u)} and all of their records? This cannot be undone.`, run: () => remove.mutate() })}>Delete</button>}
      </Head>
      {temp && <div className="alert alert-ok" style={{ marginBottom: 14 }}>Temporary password (also emailed): <code>{temp}</code></div>}
      <div className="two-col">
        <div className="stack">
          <div className="card card-pad">
            <h3 style={{ marginBottom: 10 }}>Classes & events</h3>
            <div className="stack">
              {enrollments.map(({ enrollment: en, event: ev }) => (
                <EventRow key={en.id} ev={ev} action={
                  <span className="row" style={{ gap: 6 }}>
                    <Select value={en.status} style={{ minHeight: 36, width: 'auto', padding: '4px 8px' }} onChange={(e) => enrollment.mutate({ eid: en.id, body: { status: e.target.value } })}>
                      {['reserved', 'waitlisted', 'completed', 'no_show', 'cancelled'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                    </Select>
                    {en.amountCents > 0 && <Check label={en.paidAt ? 'Paid' : 'Unpaid'} checked={!!en.paidAt} onChange={(e) => enrollment.mutate({ eid: en.id, body: { paid: e.target.checked } })} />}
                  </span>} />
              ))}
              {enrollments.length === 0 && <Empty>No enrollments. Add this student from an event's roster.</Empty>}
            </div>
          </div>
          <div className="card card-pad">
            <div className="row-between" style={{ marginBottom: 10 }}><h3>Certifications</h3><button className="btn btn-secondary btn-sm" onClick={() => setCert({ ...emptyCert })}><Plus size={14} /> Add</button></div>
            <div className="list">
              {certifications.map((c) => (
                <div key={c.id} className="list-item">
                  <div className="body"><b>{c.name}</b><span>{c.agency || ''}{c.issuedOn ? ` · ${fmtDate(c.issuedOn)}` : ' · In progress'}{c.certNumber ? ` · #${c.certNumber}` : ''}</span></div>
                  <Tag tone={c.status === 'issued' ? 'ok' : 'warn'}>{c.status.replace('_', ' ')}</Tag>
                  <button className="btn btn-ghost btn-sm" onClick={() => setCert({ id: c.id, name: c.name, agencyId: String(agencies.data?.find((a) => a.code === c.agency)?.id || ''), certNumber: c.certNumber || '', issuedOn: c.issuedOn ? String(c.issuedOn).slice(0, 10) : '', status: c.status })}>Edit</button>
                  <button className="btn btn-ghost btn-sm btn-icon" aria-label="Delete" onClick={() => setConfirm({ title: 'Delete certification?', text: c.name, run: () => rmCert.mutate(c.id) })}><Trash2 size={15} /></button>
                </div>
              ))}
              {certifications.length === 0 && <span className="small muted">None yet.</span>}
            </div>
          </div>
        </div>
        <div className="stack">
          <div className="card card-pad">
            <h3 style={{ marginBottom: 10 }}>Details</h3>
            <dl className="kv">
              <dt>Status</dt><dd>{u.active ? 'Active' : 'Inactive'}</dd>
              <dt>DOB</dt><dd>{u.dob ? fmtDate(String(u.dob).slice(0, 10) + 'T12:00:00') : '—'}</dd>
              <dt>Emergency</dt><dd>{u.emergencyContact || '—'}</dd>
              <dt>Dives logged</dt><dd>{q.data.loggedDives}</dd>
              <dt>Joined</dt><dd>{fmtDate(u.createdAt)}</dd>
            </dl>
          </div>
          <div className="card card-pad">
            <div className="row-between" style={{ marginBottom: 10 }}>
              <h3>Documents</h3>
              <span className="row" style={{ gap: 6 }}>
                <Select value={docKind} onChange={(e) => setDocKind(e.target.value as any)} style={{ minHeight: 36, width: 'auto', padding: '4px 8px' }}>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
                <label className="btn btn-secondary btn-sm">{upDoc.isPending ? '…' : 'Upload'}<input type="file" hidden accept="application/pdf,image/*" onChange={(e) => e.target.files?.[0] && upDoc.mutate(e.target.files[0])} /></label>
              </span>
            </div>
            <div className="list">
              {documents.map((d) => (
                <div key={d.id} className="list-item">
                  <div className="body"><b>{d.name}</b><span>{KINDS[d.kind]} · {bytes(d.size)} · {fmtDate(d.createdAt)}</span></div>
                  <a className="btn btn-ghost btn-sm btn-icon" href={`${fileUrl(d.key)}?download=1`} aria-label="Download"><Download size={15} /></a>
                  <button className="btn btn-ghost btn-sm btn-icon" aria-label="Delete" onClick={() => setConfirm({ title: 'Delete document?', text: d.name, run: () => rmDoc.mutate(d.id) })}><Trash2 size={15} /></button>
                </div>
              ))}
              {documents.length === 0 && <span className="small muted">No documents on file.</span>}
            </div>
          </div>
        </div>
      </div>
      {editing && <Modal title="Edit student" onClose={() => setEditing(false)}><UserForm init={u} allowRole={me?.role === 'admin'} onDone={() => setEditing(false)} /></Modal>}
      {cert && (
        <Modal title={cert.id ? 'Edit certification' : 'Add certification'} onClose={() => setCert(null)}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); saveCert.mutate(cert); }}>
            <div className="form-grid">
              <Field label="Certification" className="span-2"><Input required placeholder="e.g. Open Water Scuba Diver" {...cb('name')} /></Field>
              <Field label="Agency"><Select {...cb('agencyId')}><option value="">—</option>{(agencies.data || []).map((a) => <option key={a.id} value={a.id}>{a.code}</option>)}</Select></Field>
              <Field label="Status"><Select {...cb('status')}><option value="issued">Issued</option><option value="in_progress">In progress</option></Select></Field>
              <Field label="Cert number"><Input {...cb('certNumber')} /></Field>
              <Field label="Issued on"><Input type="date" {...cb('issuedOn')} /></Field>
            </div>
            <div className="form-actions"><button type="button" className="btn btn-secondary" onClick={() => setCert(null)}>Cancel</button><button className="btn btn-primary" disabled={saveCert.isPending}>Save</button></div>
          </form>
        </Modal>
      )}
      {confirm && <Confirm title={confirm.title} text={confirm.text} onYes={confirm.run} onNo={() => setConfirm(null)} />}
    </>
  );
}
