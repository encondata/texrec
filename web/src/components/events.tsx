import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar as CalIcon, Clock, MapPin, ChevronLeft, ChevronRight } from 'lucide-react';
import { Avatar, Spots, Tag } from './ui';
import type { Event, EventType } from '@/lib/types';
import { EVENT_TYPE_LABEL } from '@/lib/types';
import { dateParts, dayKey, fmtDate, fmtRange, money } from '@/lib/format';

export function InstructorAvatars({ list }: { list: Event['instructors'] }) {
  if (!list?.length) return null;
  return <span className="avatar-stack" title={list.map((i) => `${i.firstName} ${i.lastName}`).join(', ')}>{list.map((i) => <Avatar key={i.id} user={i} imageKey={i.avatarKey} size="sm" />)}</span>;
}

// one line in an upcoming-sessions list; `action` renders the right-hand button
export function EventRow({ ev, action, showType = true }: { ev: Event; action?: React.ReactNode; showType?: boolean }) {
  const d = dateParts(ev.startsAt);
  return (
    <div className="event-row card">
      <div className="date-tile"><span>{d.month}</span><b>{d.day}</b></div>
      <div className="body">
        <h3><Link to={`/calendar/${ev.id}`}>{ev.title}</Link></h3>
        <div className="meta">
          {showType && <Tag tone="blue">{EVENT_TYPE_LABEL[ev.type]}</Tag>}
          <span><Clock size={14} /> {fmtRange(ev.startsAt, ev.endsAt)}</span>
          {ev.location && <span><MapPin size={14} /> {ev.location}</span>}
        </div>
      </div>
      <div className="right">
        <InstructorAvatars list={ev.instructors} />
        <Spots left={ev.spotsLeft} capacity={ev.capacity} waitlisted={ev.waitlisted} />
        {action}
      </div>
    </div>
  );
}

export const TYPE_FILTERS: { value: EventType | 'all'; label: string }[] = [
  { value: 'all', label: 'All Events' }, { value: 'class', label: 'Classes' }, { value: 'dive_trip', label: 'Dive Trips' },
  { value: 'training_dive', label: 'Training Dives' }, { value: 'pool_session', label: 'Pool Sessions' },
];

// month grid + list toggle; `linkTo` builds the href for an event
export function MonthCalendar({ events, month, onMonth, linkTo }: { events: Event[]; month: Date; onMonth: (d: Date) => void; linkTo: (e: Event) => string }) {
  const [view, setView] = useState<'month' | 'list'>('month');
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first); start.setDate(1 - first.getDay());
    const out: Date[] = [];
    for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); out.push(d); }
    return out.slice(0, out[35].getMonth() === month.getMonth() ? 42 : 35);
  }, [month]);
  const byDay = useMemo(() => {
    const m: Record<string, Event[]> = {};
    for (const e of events) {
      // multi-day events appear on every day they span
      const a = new Date(e.startsAt), b = new Date(e.endsAt);
      for (let d = new Date(a); d <= b || dayKey(d) === dayKey(b); d.setDate(d.getDate() + 1)) {
        (m[dayKey(d)] ||= []).push(e);
        if (dayKey(d) === dayKey(b)) break;
      }
    }
    return m;
  }, [events]);
  const today = dayKey(new Date());
  const label = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const inMonth = events.filter((e) => new Date(e.endsAt) >= new Date(month.getFullYear(), month.getMonth(), 1) && new Date(e.startsAt) < new Date(month.getFullYear(), month.getMonth() + 1, 1));

  return (
    <div>
      <div className="cal-toolbar">
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-secondary btn-icon" aria-label="Previous month" onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={18} /></button>
          <span className="month">{label}</span>
          <button className="btn btn-secondary btn-icon" aria-label="Next month" onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={18} /></button>
          <button className="btn btn-ghost btn-sm" onClick={() => onMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button>
        </div>
        <div className="chips">
          <button className={`chip ${view === 'month' ? 'active' : ''}`} onClick={() => setView('month')}>Month</button>
          <button className={`chip ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>List</button>
        </div>
      </div>
      {view === 'month' ? (
        <div className="cal-grid" role="grid" aria-label={label}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="dow">{d}</div>)}
          {cells.map((d) => {
            const k = dayKey(d);
            const list = byDay[k] || [];
            return (
              <div key={k} className={`cal-cell ${d.getMonth() !== month.getMonth() ? 'other' : ''} ${k === today ? 'today' : ''}`}>
                <span className="d">{d.getDate()}</span>
                <div className="dots">
                  {list.map((e) => (
                    <Link key={e.id} to={linkTo(e)} className={`cal-ev ${e.type}`} title={e.title}>
                      <span className="ev-title">{e.title} <small>{e.spotsLeft > 0 ? `${ev_taken(e)}/${e.capacity}` : 'Full'}</small></span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="stack">
          {inMonth.length === 0 && <div className="empty">Nothing scheduled in {label} yet.</div>}
          {inMonth.map((e) => <EventRow key={e.id} ev={e} action={<Link to={linkTo(e)} className="btn btn-primary btn-sm">View</Link>} />)}
        </div>
      )}
    </div>
  );
}
const ev_taken = (e: Event) => e.taken;

export function EventSummary({ ev }: { ev: Event }) {
  return (
    <div className="kv">
      <dt><CalIcon size={16} /></dt><dd>{fmtDate(ev.startsAt, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}{fmtDate(ev.startsAt) !== fmtDate(ev.endsAt) && ` – ${fmtDate(ev.endsAt, { weekday: 'long', month: 'long', day: 'numeric' })}`}</dd>
      <dt><Clock size={16} /></dt><dd>{fmtRange(ev.startsAt, ev.endsAt)}</dd>
      {ev.location && <><dt><MapPin size={16} /></dt><dd>{ev.location}</dd></>}
      <dt>Price</dt><dd>{ev.priceCents ? money(ev.priceCents) : 'Free'}</dd>
      <dt>Spots</dt><dd><Spots left={ev.spotsLeft} capacity={ev.capacity} waitlisted={ev.waitlisted} /></dd>
      {ev.instructors.length > 0 && <><dt>Instructors</dt><dd className="row" style={{ gap: 8 }}><InstructorAvatars list={ev.instructors} /><span>{ev.instructors.map((i) => `${i.firstName} ${i.lastName}`).join(', ')}</span></dd></>}
    </div>
  );
}
