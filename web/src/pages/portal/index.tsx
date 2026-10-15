import { useState, type FormEvent } from 'react';
import { Link, Route, Routes, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, CalendarDays, Calendar, User, FileText, BookOpen, Award, ChevronRight, Trophy, Waves, Trash2, Download, Plus } from 'lucide-react';
import { AppShell } from '@/components/Layout';
import { useAuth } from '@/lib/auth';
import { useContent } from '@/lib/content';
import { useToast } from '@/lib/toast';
import { get, post, put, del, upload, ApiError, fileUrl } from '@/lib/api';
import type { Certification, DiveLog, Document, Enrollment, Event, User as U } from '@/lib/types';
import { Avatar, Confirm, Empty, Field, Input, Loading, Modal, Select, Tag, Textarea } from '@/components/ui';
import { EventRow, MonthCalendar } from '@/components/events';
import { EnrollButton, useEvents, useMyEnrollments } from '../public/Calendar';
import { bytes, fmtDate, fullName } from '@/lib/format';

const LINKS = [
  { to: '/portal', label: 'Dashboard', icon: <LayoutDashboard size={18} />, end: true },
  { to: '/portal/classes', label: 'My Classes', icon: <CalendarDays size={18} /> },
  { to: '/portal/calendar', label: 'Calendar', icon: <Calendar size={18} /> },
  { to: '/portal/profile', label: 'My Profile', icon: <User size={18} /> },
  { to: '/portal/documents', label: 'Documents', icon: <FileText size={18} /> },
  { to: '/portal/certifications', label: 'Certifications', icon: <Award size={18} /> },
  { to: '/portal/logbook', label: 'Logbook', icon: <BookOpen size={18} /> },
];

export default function Portal() {
  return (
    <Routes>
      <Route element={<AppShell links={LINKS} title="Student Portal" />}>
        <Route index element={<Dashboard />} />
        <Route path="classes" element={<MyClasses />} />
        <Route path="calendar" element={<PortalCalendar />} />
        <Route path="profile" element={<Profile />} />
        <Route path="documents" element={<Documents />} />
        <Route path="certifications" element={<Certifications />} />
        <Route path="logbook" element={<Logbook />} />
      </Route>
    </Routes>
  );
}

interface Dash { upcoming: Event[]; certifications: Certification[]; stats: { upcomingClasses: number; completedCertifications: number; loggedDives: number } }

function Dashboard() {
  const { user } = useAuth();
  const { c } = useContent();
  const q = useQuery({ queryKey: ['me', 'dashboard'], queryFn: () => get<Dash>('/me/dashboard') });
  if (q.isLoading || !q.data) return <Loading />;
  const d = q.data;
  return (
    <>
      <div className="app-head"><div><h1>Welcome, {user?.firstName}!</h1><p>{c('portal.welcome')}</p></div><Avatar user={user} size="lg" /></div>
      <div className="stats" style={{ marginBottom: 20 }}>
        <div className="card stat"><div className="ico"><CalendarDays size={20} /></div><div><b>{d.stats.upcomingClasses}</b><span>Upcoming Classes</span></div></div>
        <div className="card stat"><div className="ico"><Trophy size={20} /></div><div><b>{d.stats.completedCertifications}</b><span>Completed Certifications</span></div></div>
        <div className="card stat"><div className="ico"><Waves size={20} /></div><div><b>{d.stats.loggedDives}</b><span>Logged Dives</span></div></div>
      </div>
      <div className="two-col">
        <div className="card card-pad">
          <h3 style={{ marginBottom: 12 }}>My Upcoming Classes</h3>
          <div className="stack">
            {d.upcoming.map((ev) => <EventRow key={ev.id} ev={ev} action={<EnrollButton ev={ev} compact />} />)}
            {d.upcoming.length === 0 && <Empty>Nothing booked yet. <Link to="/portal/calendar">Browse the calendar</Link> to reserve a spot.</Empty>}
          </div>
          <Link to="/portal/calendar" className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}>View Full Calendar →</Link>
        </div>
        <div className="stack">
          <div className="card card-pad">
            <h3 style={{ marginBottom: 10 }}>My Certifications</h3>
            <div className="list">
              {d.certifications.map((x) => <CertRow key={x.id} x={x} />)}
              {d.certifications.length === 0 && <span className="small muted">No certifications on file yet — they appear here once your instructor issues them.</span>}
            </div>
          </div>
          <div className="card card-pad quick-links">
            <h3 style={{ marginBottom: 10 }}>Quick Links</h3>
            <Link to="/portal/calendar"><Calendar size={18} /> Schedule a Class <ChevronRight size={16} /></Link>
            <Link to="/portal/profile"><User size={18} /> Update My Profile <ChevronRight size={16} /></Link>
            <Link to="/portal/documents"><FileText size={18} /> Upload Documents <ChevronRight size={16} /></Link>
            <Link to="/instructors"><Award size={18} /> Meet the Instructors <ChevronRight size={16} /></Link>
          </div>
        </div>
      </div>
    </>
  );
}

const CertRow = ({ x }: { x: Certification }) => (
  <div className="list-item">
    <div className="ico" style={{ width: 36, height: 36, borderRadius: 8, background: x.status === 'issued' ? 'var(--ok-50)' : 'var(--warn-50)', color: x.status === 'issued' ? 'var(--ok)' : 'var(--warn)', display: 'grid', placeItems: 'center' }}><Award size={18} /></div>
    <div className="body"><b>{x.name}</b><span>{x.agency || ''}{x.issuedOn ? ` · Issued ${fmtDate(x.issuedOn)}` : ' · In Progress'}{x.certNumber ? ` · #${x.certNumber}` : ''}</span></div>
  </div>
);

function MyClasses() {
  const [sp] = useSearchParams();
  const q = useMyEnrollments(true);
  const now = new Date();
  const rows = q.data || [];
  const upcoming = rows.filter((r) => new Date(r.event.endsAt) >= now && r.enrollment.status !== 'cancelled');
  const past = rows.filter((r) => new Date(r.event.endsAt) < now || r.enrollment.status === 'cancelled');
  const statusTag = (e: Enrollment) => e.status === 'waitlisted' ? <Tag tone="warn">Waitlisted</Tag> : e.status === 'cancelled' ? <Tag tone="danger">Cancelled</Tag> : e.status === 'completed' ? <Tag tone="ok">Completed</Tag> : e.paidAt ? <Tag tone="ok">Paid</Tag> : <Tag tone="blue">Reserved</Tag>;
  return (
    <>
      <div className="app-head"><div><h1>My Classes</h1><p>Everything you've reserved, past and upcoming.</p></div><Link to="/portal/calendar" className="btn btn-primary btn-sm">Find a class</Link></div>
      {sp.get('paid') === '1' && <div className="alert alert-ok" style={{ marginBottom: 14 }}>Payment received — thank you! Your spot is confirmed.</div>}
      {sp.get('paid') === '0' && <div className="alert alert-info" style={{ marginBottom: 14 }}>Checkout was cancelled. Your spot is still reserved; you can pay at the shop.</div>}
      {q.isLoading && <Loading />}
      <h3 style={{ margin: '8px 0 10px' }}>Upcoming</h3>
      <div className="stack">
        {upcoming.map((r) => <EventRow key={r.enrollment.id} ev={r.event} action={r.enrollment.status === 'completed' ? statusTag(r.enrollment) : <EnrollButton ev={r.event} compact />} />)}
        {!q.isLoading && upcoming.length === 0 && <Empty>No upcoming classes.</Empty>}
      </div>
      {past.length > 0 && <>
        <h3 style={{ margin: '24px 0 10px' }}>Past</h3>
        <div className="stack">{past.map((r) => <EventRow key={r.enrollment.id} ev={r.event} action={statusTag(r.enrollment)} />)}</div>
      </>}
    </>
  );
}

function PortalCalendar() {
  const q = useEvents();
  const [month, setMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  return (
    <>
      <div className="app-head"><div><h1>Class Calendar</h1><p>Click an event to view details and sign up.</p></div></div>
      {q.isLoading ? <Loading /> : <MonthCalendar events={q.data || []} month={month} onMonth={setMonth} linkTo={(e) => `/calendar/${e.id}`} />}
    </>
  );
}

function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [v, setV] = useState({ firstName: user!.firstName, lastName: user!.lastName, phone: user!.phone || '', dob: user!.dob ? String(user!.dob).slice(0, 10) : '', emergencyContact: user!.emergencyContact || '' });
  const save = useMutation({ mutationFn: () => put<{ user: U }>('/me/profile', { ...v, dob: v.dob || null }), onSuccess: (r) => { setUser(r.user); toast('Profile saved.'); }, onError: (e: ApiError) => toast(e.message, 'err') });
  const avatar = useMutation({ mutationFn: (f: File) => { const fd = new FormData(); fd.append('file', f); return upload<{ user: U }>('/me/avatar', fd); }, onSuccess: (r) => { setUser(r.user); toast('Photo updated.'); }, onError: (e: ApiError) => toast(e.message, 'err') });
  const b = (k: keyof typeof v) => ({ value: v[k], onChange: (e: any) => setV({ ...v, [k]: e.target.value }) });
  return (
    <>
      <div className="app-head"><div><h1>My Profile</h1><p>Keep your contact details current so instructors can reach you.</p></div></div>
      <div className="two-col">
        <form className="card card-pad stack" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
          <div className="form-grid">
            <Field label="First name"><Input required {...b('firstName')} /></Field>
            <Field label="Last name"><Input required {...b('lastName')} /></Field>
            <Field label="Phone"><Input type="tel" {...b('phone')} /></Field>
            <Field label="Date of birth"><Input type="date" {...b('dob')} /></Field>
            <Field label="Emergency contact" className="span-2" hint="Name and phone number."><Input {...b('emergencyContact')} /></Field>
          </div>
          <div className="form-actions"><button className="btn btn-primary" disabled={save.isPending}>Save changes</button></div>
        </form>
        <div className="stack">
          <div className="card card-pad row" style={{ gap: 16 }}>
            <Avatar user={user} size="lg" />
            <div>
              <b>{fullName(user)}</b><div className="small muted">{user?.email}</div>
              <label className="btn btn-secondary btn-sm" style={{ marginTop: 8 }}>{avatar.isPending ? 'Uploading…' : 'Change photo'}<input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && avatar.mutate(e.target.files[0])} /></label>
            </div>
          </div>
          <div className="card card-pad"><h3 style={{ marginBottom: 6 }}>Password</h3><p className="small muted">Change the password you use to sign in.</p><Link to="/change-password" className="btn btn-secondary btn-sm">Change password</Link></div>
        </div>
      </div>
    </>
  );
}

const KINDS = { waiver: 'Liability Waiver', medical: 'Medical Form', certification: 'Certification Card', other: 'Other' } as const;

function Documents() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['me', 'documents'], queryFn: () => get<Document[]>('/me/documents') });
  const [kind, setKind] = useState<keyof typeof KINDS>('waiver');
  const [confirm, setConfirm] = useState<Document | null>(null);
  const up = useMutation({ mutationFn: (f: File) => { const fd = new FormData(); fd.append('file', f); fd.append('kind', kind); return upload('/me/documents', fd); }, onSuccess: () => { qc.invalidateQueries({ queryKey: ['me', 'documents'] }); toast('Uploaded.'); }, onError: (e: ApiError) => toast(e.message, 'err') });
  const rm = useMutation({ mutationFn: (d: Document) => del(`/me/documents/${d.id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['me', 'documents'] }); setConfirm(null); } });
  return (
    <>
      <div className="app-head"><div><h1>Documents</h1><p>Waivers, medical forms and certification cards. Only you and Tex Rec staff can see these.</p></div></div>
      <div className="card card-pad row" style={{ marginBottom: 16 }}>
        <Select value={kind} onChange={(e) => setKind(e.target.value as any)} style={{ width: 'auto' }}>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        <label className="btn btn-primary">{up.isPending ? 'Uploading…' : <><Plus size={16} /> Upload file</>}<input type="file" accept="application/pdf,image/*" hidden disabled={up.isPending} onChange={(e) => e.target.files?.[0] && up.mutate(e.target.files[0])} /></label>
        <span className="small muted">PDF or photo, up to 25 MB.</span>
      </div>
      {q.isLoading && <Loading />}
      <div className="card list" style={{ padding: '0 16px' }}>
        {(q.data || []).map((d) => (
          <div key={d.id} className="list-item">
            <FileText size={22} style={{ color: 'var(--blue)' }} />
            <div className="body"><b>{d.name}</b><span>{KINDS[d.kind]} · {bytes(d.size)} · {fmtDate(d.createdAt)}</span></div>
            <a className="btn btn-secondary btn-sm" href={`${fileUrl(d.key)}?download=1`}><Download size={16} /> Download</a>
            <button className="btn btn-danger btn-sm btn-icon" aria-label="Delete" onClick={() => setConfirm(d)}><Trash2 size={16} /></button>
          </div>
        ))}
        {!q.isLoading && q.data?.length === 0 && <div className="empty" style={{ margin: 16 }}>No documents uploaded yet.</div>}
      </div>
      {confirm && <Confirm title="Delete document?" text={`Delete ${confirm.name}? This can't be undone.`} onYes={() => rm.mutate(confirm)} onNo={() => setConfirm(null)} />}
    </>
  );
}

function Certifications() {
  const q = useQuery({ queryKey: ['me', 'certifications'], queryFn: () => get<Certification[]>('/me/certifications') });
  return (
    <>
      <div className="app-head"><div><h1>Certifications</h1><p>Issued by your instructors as you complete courses.</p></div></div>
      {q.isLoading && <Loading />}
      <div className="card list" style={{ padding: '0 16px' }}>
        {(q.data || []).map((x) => <CertRow key={x.id} x={x} />)}
        {!q.isLoading && q.data?.length === 0 && <div className="empty" style={{ margin: 16 }}>No certifications on file yet.</div>}
      </div>
    </>
  );
}

const emptyLog = { doveOn: new Date().toISOString().slice(0, 10), site: '', maxDepthFt: '', durationMin: '', notes: '' };

function Logbook() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['me', 'logs'], queryFn: () => get<DiveLog[]>('/me/dive-logs') });
  const [edit, setEdit] = useState<null | (typeof emptyLog & { id?: string })>(null);
  const [confirm, setConfirm] = useState<DiveLog | null>(null);
  const save = useMutation({
    mutationFn: (v: typeof emptyLog & { id?: string }) => { const body = { ...v, maxDepthFt: v.maxDepthFt || null, durationMin: v.durationMin || null }; return v.id ? put(`/me/dive-logs/${v.id}`, body) : post('/me/dive-logs', body); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['me'] }); setEdit(null); toast('Dive logged.'); }, onError: (e: ApiError) => toast(e.message, 'err'),
  });
  const rm = useMutation({ mutationFn: (l: DiveLog) => del(`/me/dive-logs/${l.id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['me'] }); setConfirm(null); } });
  const b = (k: keyof typeof emptyLog) => ({ value: edit![k], onChange: (e: any) => setEdit({ ...edit!, [k]: e.target.value }) });
  return (
    <>
      <div className="app-head"><div><h1>Logbook</h1><p>{q.data?.length || 0} dives logged.</p></div><button className="btn btn-primary btn-sm" onClick={() => setEdit({ ...emptyLog })}><Plus size={16} /> Log a dive</button></div>
      {q.isLoading && <Loading />}
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Date</th><th>Site</th><th>Max depth</th><th>Time</th><th>Notes</th><th /></tr></thead>
        <tbody>
          {(q.data || []).map((l) => (
            <tr key={l.id}>
              <td>{fmtDate(l.doveOn + 'T12:00:00')}</td><td>{l.site}</td><td>{l.maxDepthFt ? `${l.maxDepthFt} ft` : '—'}</td><td>{l.durationMin ? `${l.durationMin} min` : '—'}</td><td className="muted small">{l.notes}</td>
              <td className="actions"><button className="btn btn-ghost btn-sm" onClick={() => setEdit({ id: l.id, doveOn: l.doveOn.slice(0, 10), site: l.site, maxDepthFt: String(l.maxDepthFt ?? ''), durationMin: String(l.durationMin ?? ''), notes: l.notes })}>Edit</button><button className="btn btn-ghost btn-sm" onClick={() => setConfirm(l)}>Delete</button></td>
            </tr>
          ))}
          {!q.isLoading && q.data?.length === 0 && <tr><td colSpan={6} className="center muted">No dives logged yet.</td></tr>}
        </tbody>
      </table></div>
      {edit && (
        <Modal title={edit.id ? 'Edit dive' : 'Log a dive'} onClose={() => setEdit(null)}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); save.mutate(edit); }}>
            <div className="form-grid">
              <Field label="Date"><Input type="date" required {...b('doveOn')} /></Field>
              <Field label="Dive site"><Input {...b('site')} /></Field>
              <Field label="Max depth (ft)"><Input type="number" min={0} step="0.1" inputMode="decimal" {...b('maxDepthFt')} /></Field>
              <Field label="Bottom time (min)"><Input type="number" min={0} inputMode="numeric" {...b('durationMin')} /></Field>
              <Field label="Notes" className="span-2"><Textarea {...b('notes')} /></Field>
            </div>
            <div className="form-actions"><button type="button" className="btn btn-secondary" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" disabled={save.isPending}>Save</button></div>
          </form>
        </Modal>
      )}
      {confirm && <Confirm title="Delete dive?" text="Remove this dive from your logbook?" onYes={() => rm.mutate(confirm)} onNo={() => setConfirm(null)} />}
    </>
  );
}
