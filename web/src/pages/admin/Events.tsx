import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Copy, Trash2 } from 'lucide-react';
import { get, post, put, del } from '@/lib/api';
import type { Course, DiveSite, Enrollment, Event, EventType, User } from '@/lib/types';
import { EVENT_TYPE_LABEL } from '@/lib/types';
import { Check, Confirm, Empty, Field, Input, Loading, Modal, Select, Spots, Tag, Textarea } from '@/components/ui';
import { EventSummary, MonthCalendar, TYPE_FILTERS } from '@/components/events';
import { fmtDate, fmtRange, fromLocalInput, fullName, money, toLocalInput } from '@/lib/format';
import { useList, useAction, useFormState, Head } from './shared';

type StaffRow = User & { profile: any };
const inv = [['admin'], ['events'], ['event'], ['course']];

const blank = { type: 'class' as EventType, courseId: '', diveSiteId: '', title: '', description: '', location: '', startsAt: '', endsAt: '', capacity: '6', priceCents: '', published: true, allowWaitlist: true, instructorIds: [] as string[] };

export function EventForm({ init, onDone }: { init?: Event; onDone: () => void }) {
  const courses = useList<Course[]>(['admin', 'courses'], '/admin/courses');
  const sites = useList<DiveSite[]>(['admin', 'sites'], '/admin/dive-sites');
  const staff = useList<StaffRow[]>(['admin', 'staff'], '/admin/users/staff');
  const f = useFormState(init ? { ...blank, type: init.type, courseId: init.course?.id || '', diveSiteId: init.diveSite?.id || '', title: init.title, description: init.description, location: init.location,
    startsAt: toLocalInput(init.startsAt), endsAt: toLocalInput(init.endsAt), capacity: String(init.capacity), priceCents: init.course && init.priceCents === undefined ? '' : '', published: init.published, allowWaitlist: init.allowWaitlist, instructorIds: init.instructors.map((i) => i.id) } : { ...blank });
  const save = useAction((v: typeof f.v) => {
    const body = { ...v, courseId: v.courseId || null, diveSiteId: v.diveSiteId || null, startsAt: fromLocalInput(v.startsAt), endsAt: fromLocalInput(v.endsAt), capacity: Number(v.capacity), priceCents: v.priceCents === '' ? null : Math.round(Number(v.priceCents) * 100) };
    return init ? put(`/admin/events/${init.id}`, body) : post('/admin/events', body);
  }, { invalidate: inv, ok: 'Event saved.', onSuccess: onDone });
  // picking a course fills in the title
  const pickCourse = (id: string) => { const c = courses.data?.find((x) => x.id === id); f.setV({ ...f.v, courseId: id, title: c && (!f.v.title || courses.data?.some((x) => x.name === f.v.title)) ? c.name : f.v.title }); };
  const pickSite = (id: string) => { const s = sites.data?.find((x) => x.id === id); f.setV({ ...f.v, diveSiteId: id, location: s && !f.v.location ? `${s.name}, ${s.location}` : f.v.location }); };
  const toggleInstructor = (id: string) => f.set('instructorIds', f.v.instructorIds.includes(id) ? f.v.instructorIds.filter((x) => x !== id) : [...f.v.instructorIds, id]);
  const coursePrice = courses.data?.find((x) => x.id === f.v.courseId)?.priceCents;
  return (
    <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(f.v); }}>
      <div className="form-grid">
        <Field label="Type"><Select {...f.bind('type')}>{(Object.keys(EVENT_TYPE_LABEL) as EventType[]).map((t) => <option key={t} value={t}>{EVENT_TYPE_LABEL[t]}</option>)}</Select></Field>
        <Field label="Course (for classes)"><Select value={f.v.courseId} onChange={(e) => pickCourse(e.target.value)}><option value="">— none —</option>{(courses.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Title" className="span-2"><Input required {...f.bind('title')} /></Field>
        <Field label="Starts"><Input type="datetime-local" required {...f.bind('startsAt')} /></Field>
        <Field label="Ends"><Input type="datetime-local" required {...f.bind('endsAt')} /></Field>
        <Field label="Dive site"><Select value={f.v.diveSiteId} onChange={(e) => pickSite(e.target.value)}><option value="">— none —</option>{(sites.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Location / meeting point"><Input {...f.bind('location')} placeholder="Tex Rec Pool, Burleson, TX" /></Field>
        <Field label="Capacity (students)"><Input type="number" min={0} required inputMode="numeric" {...f.bind('capacity')} /></Field>
        <Field label="Price ($)" hint={coursePrice !== undefined ? `Blank = course price (${money(coursePrice)})` : 'Blank = free'}><Input type="number" min={0} step="0.01" inputMode="decimal" {...f.bind('priceCents')} /></Field>
        <Field label="Description (shown to students)" className="span-2"><Textarea rows={4} {...f.bind('description')} /></Field>
        <div className="span-2">
          <div className="label" style={{ marginBottom: 6 }}>Instructors</div>
          <div className="chips">{(staff.data || []).map((s) => <button type="button" key={s.id} className={`chip ${f.v.instructorIds.includes(s.id) ? 'active' : ''}`} onClick={() => toggleInstructor(s.id)}>{fullName(s)}</button>)}</div>
        </div>
        <Check label="Published (visible on the public calendar)" {...f.bindCheck('published')} />
        <Check label="Allow waitlist when full" {...f.bindCheck('allowWaitlist')} />
      </div>
      <div className="form-actions"><button type="button" className="btn btn-secondary" onClick={onDone}>Cancel</button><button className="btn btn-primary" disabled={save.isPending}>{init ? 'Save' : 'Create event'}</button></div>
    </form>
  );
}

export function Events() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [type, setType] = useState<EventType | 'all'>('all');
  const [month, setMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [creating, setCreating] = useState(false);
  const [past, setPast] = useState(false);
  useEffect(() => { if (sp.get('new')) { setCreating(true); setSp({}, { replace: true }); } }, [sp]);
  const q = useList<Event[]>(['admin', 'events', past ? 'all' : 'upcoming'], past ? '/admin/events?past=1' : '/admin/events');
  const list = (q.data || []).filter((e) => type === 'all' || e.type === type);
  return (
    <>
      <Head title="Classes & Events" sub="Create and manage classes, training dives, trips and pool sessions."><button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Plus size={16} /> Add Event</button></Head>
      <div className="toolbar">
        <div className="chips" style={{ flex: 1 }}>{TYPE_FILTERS.map((o) => <button key={o.value} className={`chip ${type === o.value ? 'active' : ''}`} onClick={() => setType(o.value)}>{o.label}</button>)}</div>
        <Check label="Include past" checked={past} onChange={(e) => setPast(e.target.checked)} />
        <div className="chips"><button className={`chip ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>List</button><button className={`chip ${view === 'calendar' ? 'active' : ''}`} onClick={() => setView('calendar')}>Calendar</button></div>
      </div>
      {q.isLoading && <Loading />}
      {view === 'calendar' ? <MonthCalendar events={list} month={month} onMonth={setMonth} linkTo={(e) => `/admin/events/${e.id}`} /> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Date</th><th>Title</th><th>Type</th><th>Location</th><th>Instructors</th><th>Spots</th><th /></tr></thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id} className="clickable" onClick={() => nav(`/admin/events/${e.id}`)}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.startsAt)}<br /><span className="tiny muted">{fmtRange(e.startsAt, e.endsAt)}</span></td>
                <td><b>{e.title}</b>{!e.published && <> <Tag tone="warn">Draft</Tag></>}</td>
                <td><Tag tone="blue">{EVENT_TYPE_LABEL[e.type]}</Tag></td>
                <td className="small">{e.location}</td>
                <td className="small">{e.instructors.map((i) => i.firstName).join(', ') || <span className="muted">—</span>}</td>
                <td><span className={e.spotsLeft === 0 ? 'strong' : ''} style={{ color: e.spotsLeft === 0 ? 'var(--danger)' : undefined }}>{e.taken} / {e.capacity}</span>{e.waitlisted > 0 && <span className="tiny muted"> +{e.waitlisted} WL</span>}</td>
                <td className="actions"><Link className="btn btn-secondary btn-sm" to={`/admin/events/${e.id}`} onClick={(ev) => ev.stopPropagation()}>Manage</Link></td>
              </tr>
            ))}
            {!q.isLoading && list.length === 0 && <tr><td colSpan={7} className="center muted">No events. Add one to get started.</td></tr>}
          </tbody>
        </table></div>
      )}
      {creating && <Modal title="Add event" onClose={() => setCreating(false)} wide><EventForm onDone={() => setCreating(false)} /></Modal>}
    </>
  );
}

type Roster = (Enrollment & { user: User })[];

export function EventDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const q = useList<Event>(['event', id!], `/events/${id}`);
  const adminQ = useList<Event[]>(['admin', 'events', 'all'], '/admin/events?past=1'); // includes unpublished
  const ev = (adminQ.data || []).find((e) => e.id === id) || q.data;
  const roster = useList<Roster>(['admin', 'roster', id!], `/admin/events/${id}/enrollments`);
  const students = useList<User[]>(['admin', 'users', 'student'], '/admin/users?role=student');
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dup, setDup] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { title: string; text: string; run: () => void }>(null);
  const [pick, setPick] = useState('');
  const rinv = [['admin'], ['events'], ['event', id!], ['course']];
  const update = useAction(({ eid, body }: { eid: string; body: any }) => put(`/admin/events/enrollments/${eid}`, body), { invalidate: rinv });
  const add = useAction((userId: string) => post(`/admin/events/${id}/enrollments`, { userId }), { invalidate: rinv, ok: 'Student added.', onSuccess: () => { setAdding(false); setPick(''); } });
  const removeEn = useAction((eid: string) => del(`/admin/events/enrollments/${eid}`), { invalidate: rinv, onSuccess: () => setConfirm(null) });
  const removeEv = useAction(() => del(`/admin/events/${id}`), { invalidate: rinv, ok: 'Event deleted.', onSuccess: () => nav('/admin/events') });
  const duplicate = useAction((startsAt: string) => post<Event>(`/admin/events/${id}/duplicate`, { startsAt: fromLocalInput(startsAt) }), { invalidate: rinv, ok: 'Copied as a draft.', onSuccess: (e) => nav(`/admin/events/${e.id}`) });
  if (!ev) return <Loading />;
  const rows = roster.data || [];
  const onRoster = new Set(rows.filter((r) => r.status !== 'cancelled').map((r) => r.userId));
  return (
    <>
      <Link to="/admin/events" className="small">← Events</Link>
      <Head title={ev.title} sub={`${EVENT_TYPE_LABEL[ev.type]} · ${fmtDate(ev.startsAt)} · ${fmtRange(ev.startsAt, ev.endsAt)}`}>
        {!ev.published && <Tag tone="warn">Draft</Tag>}
        <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Edit</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setDup(toLocalInput(ev.startsAt))}><Copy size={15} /> Duplicate</button>
        <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ title: 'Delete event?', text: 'This removes the event and every reservation on it.', run: () => removeEv.mutate() })}><Trash2 size={15} /></button>
      </Head>
      <div className="two-col">
        <div className="card card-pad">
          <div className="row-between" style={{ marginBottom: 10 }}>
            <h3>Roster <span className="muted small">({ev.taken} / {ev.capacity}{ev.waitlisted ? `, ${ev.waitlisted} waitlisted` : ''})</span></h3>
            <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}><Plus size={15} /> Add student</button>
          </div>
          <div className="table-wrap"><table className="table" style={{ minWidth: 520 }}>
            <thead><tr><th>Student</th><th>Status</th><th>Payment</th><th>Notes</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link to={`/admin/students/${r.userId}`}><b>{fullName(r.user)}</b></Link><br /><span className="tiny muted">{r.user.email}{r.user.phone ? ` · ${r.user.phone}` : ''}</span></td>
                  <td><Select value={r.status} style={{ minHeight: 36, padding: '4px 8px', width: 'auto' }} onChange={(e) => update.mutate({ eid: r.id, body: { status: e.target.value } })}>
                    {['reserved', 'waitlisted', 'completed', 'no_show', 'cancelled'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</Select></td>
                  <td>{r.amountCents > 0 ? <Check label={r.paidAt ? `Paid ${money(r.paidCents)}` : `Due ${money(r.amountCents)}`} checked={!!r.paidAt} onChange={(e) => update.mutate({ eid: r.id, body: { paid: e.target.checked } })} /> : <span className="muted small">Free</span>}</td>
                  <td><Input defaultValue={r.notes} placeholder="notes" style={{ minHeight: 36, padding: '4px 8px', minWidth: 120 }} onBlur={(e) => e.target.value !== r.notes && update.mutate({ eid: r.id, body: { notes: e.target.value } })} /></td>
                  <td className="actions"><button className="btn btn-ghost btn-sm btn-icon" aria-label="Remove" onClick={() => setConfirm({ title: 'Remove from roster?', text: `Remove ${fullName(r.user)} from this event entirely?`, run: () => removeEn.mutate(r.id) })}><Trash2 size={15} /></button></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="center muted">Nobody signed up yet.</td></tr>}
            </tbody>
          </table></div>
        </div>
        <div className="stack">
          <div className="card card-pad"><h3 style={{ marginBottom: 10 }}>Details</h3><EventSummary ev={ev} /></div>
          {ev.description && <div className="card card-pad small" style={{ whiteSpace: 'pre-wrap' }}>{ev.description}</div>}
          {ev.course && <div className="card card-pad small">Course: <Link to="/admin/courses">{ev.course.name}</Link> · Public page: <Link to={`/calendar/${ev.id}`}>view</Link></div>}
        </div>
      </div>
      {editing && <Modal title="Edit event" onClose={() => setEditing(false)} wide><EventForm init={ev} onDone={() => setEditing(false)} /></Modal>}
      {adding && (
        <Modal title="Add student to roster" onClose={() => setAdding(false)}>
          <div className="stack">
            <Field label="Student"><Select value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Choose…</option>{(students.data || []).filter((s) => !onRoster.has(s.id)).map((s) => <option key={s.id} value={s.id}>{fullName(s)} — {s.email}</option>)}</Select></Field>
            <p className="small muted">They'll be reserved (or waitlisted if the event is full) and emailed a confirmation. Need a new account? <Link to="/admin/students">Add a student</Link> first.</p>
            <div className="form-actions"><button className="btn btn-secondary" onClick={() => setAdding(false)}>Cancel</button><button className="btn btn-primary" disabled={!pick || add.isPending} onClick={() => add.mutate(pick)}>Add</button></div>
          </div>
        </Modal>
      )}
      {dup !== null && (
        <Modal title="Duplicate event" onClose={() => setDup(null)}>
          <div className="stack">
            <Field label="New start date & time" hint="Same length, course, instructors and capacity. Created as a draft."><Input type="datetime-local" value={dup} onChange={(e) => setDup(e.target.value)} /></Field>
            <div className="form-actions"><button className="btn btn-secondary" onClick={() => setDup(null)}>Cancel</button><button className="btn btn-primary" disabled={!dup} onClick={() => duplicate.mutate(dup)}>Duplicate</button></div>
          </div>
        </Modal>
      )}
      {confirm && <Confirm title={confirm.title} text={confirm.text} onYes={confirm.run} onNo={() => setConfirm(null)} />}
    </>
  );
}
