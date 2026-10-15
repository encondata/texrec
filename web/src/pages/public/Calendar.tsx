import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, del, ApiError } from '@/lib/api';
import { useContent } from '@/lib/content';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import type { Enrollment, Event, EventType } from '@/lib/types';
import { EVENT_TYPE_LABEL } from '@/lib/types';
import { Chips, Confirm, Empty, Img, Loading, Markdown, Tag } from '@/components/ui';
import { EventSummary, MonthCalendar, TYPE_FILTERS } from '@/components/events';

// events for a wide window so month paging is instant
export function useEvents() {
  const from = new Date(); from.setMonth(from.getMonth() - 2);
  const to = new Date(); to.setMonth(to.getMonth() + 12);
  return useQuery({ queryKey: ['events', 'window'], queryFn: () => get<Event[]>(`/events?from=${from.toISOString()}&to=${to.toISOString()}&limit=500`) });
}

export function useMyEnrollments(enabled: boolean) {
  return useQuery({ queryKey: ['me', 'enrollments'], queryFn: () => get<{ enrollment: Enrollment; event: Event }[]>('/me/enrollments'), enabled });
}

export default function CalendarPage() {
  const { c } = useContent();
  const q = useEvents();
  const [month, setMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [type, setType] = useState<EventType | 'all'>('all');
  const list = (q.data || []).filter((e) => type === 'all' || e.type === type);
  return (
    <div className="container">
      <div className="page-head"><h1>{c('calendar.title')}</h1><p className="lead">{c('calendar.subtitle')}</p></div>
      <div style={{ marginBottom: 14 }}><Chips value={type} onChange={setType} options={TYPE_FILTERS} /></div>
      {q.isLoading ? <Loading /> : <MonthCalendar events={list} month={month} onMonth={setMonth} linkTo={(e) => `/calendar/${e.id}`} />}
      <div style={{ height: 48 }} />
    </div>
  );
}

// Enroll / Waitlist / Cancel button with the right state for the signed-in user
export function EnrollButton({ ev, compact = false }: { ev: Event; compact?: boolean }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const mine = useMyEnrollments(!!user);
  const [confirm, setConfirm] = useState<null | 'cancel'>(null);
  const my = mine.data?.find((x) => x.event.id === ev.id)?.enrollment;
  const past = new Date(ev.startsAt) < new Date();

  const enroll = useMutation({
    mutationFn: () => post<{ enrollment: Enrollment; checkoutUrl?: string | null }>('/me/enrollments', { eventId: ev.id }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['events'] }); qc.invalidateQueries({ queryKey: ['me'] }); qc.invalidateQueries({ queryKey: ['course'] });
      if (r.checkoutUrl) { window.location.href = r.checkoutUrl; return; }
      toast(r.enrollment.status === 'waitlisted' ? "You're on the waitlist — we'll email you if a spot opens." : 'Your spot is reserved!');
    },
    onError: (e: ApiError) => toast(e.message, 'err'),
  });
  const cancel = useMutation({
    mutationFn: () => del(`/me/enrollments/${my!.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); qc.invalidateQueries({ queryKey: ['me'] }); qc.invalidateQueries({ queryKey: ['course'] }); toast('Reservation cancelled.'); setConfirm(null); },
    onError: (e: ApiError) => toast(e.message, 'err'),
  });

  const size = compact ? 'btn-sm' : '';
  if (past) return <span className="small muted">Started</span>;
  if (!user) return <button className={`btn btn-primary ${size}`} onClick={() => nav('/login', { state: { from: `/calendar/${ev.id}` } })}>{ev.spotsLeft > 0 ? 'Enroll' : 'Join Waitlist'}</button>;
  if (user.role !== 'student') return <Link to={`/admin/events/${ev.id}`} className={`btn btn-secondary ${size}`}>Manage</Link>;
  if (my && my.status !== 'cancelled') {
    return (
      <>
        <span className="row" style={{ gap: 8 }}>
          <Tag tone={my.status === 'waitlisted' ? 'warn' : 'ok'}>{my.status === 'waitlisted' ? 'Waitlisted' : my.paidAt ? 'Paid' : 'Reserved'}</Tag>
          {!my.paidAt && my.status !== 'completed' && <button className={`btn btn-ghost btn-sm`} onClick={() => setConfirm('cancel')}>Cancel</button>}
        </span>
        {confirm && <Confirm title="Cancel reservation?" text={`Give up your spot in ${ev.title}?`} onYes={() => cancel.mutate()} onNo={() => setConfirm(null)} />}
      </>
    );
  }
  if (ev.spotsLeft <= 0 && !ev.allowWaitlist) return <button className={`btn btn-secondary ${size}`} disabled>Full</button>;
  return <button className={`btn ${ev.spotsLeft > 0 ? 'btn-primary' : 'btn-secondary'} ${size}`} disabled={enroll.isPending} onClick={() => enroll.mutate()}>{enroll.isPending ? '…' : ev.spotsLeft > 0 ? 'Enroll' : 'Waitlist'}</button>;
}

export function EventDetail() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['event', id], queryFn: () => get<Event>(`/events/${id}`) });
  if (q.isLoading) return <Loading />;
  if (!q.data) return <div className="container"><Empty>Event not found.</Empty></div>;
  const ev = q.data;
  return (
    <div className="container" style={{ maxWidth: 900 }}>
      <div className="page-head">
        <Link to="/calendar" className="small">← Calendar</Link>
        <div className="row" style={{ gap: 8, margin: '10px 0 6px' }}><Tag tone="blue">{EVENT_TYPE_LABEL[ev.type]}</Tag>{ev.course?.agency && <Tag>{ev.course.agency}</Tag>}</div>
        <h1>{ev.title}</h1>
      </div>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          {ev.course?.imageKey && <Img imageKey={ev.course.imageKey} alt="" className="img-cover" style={{ borderRadius: 12 } as any} />}
          <div className="card card-pad"><EventSummary ev={ev} /></div>
        </div>
        <div className="stack">
          <div className="card card-pad">
            <h3 style={{ marginBottom: 8 }}>Details</h3>
            <Markdown text={ev.description || 'Details to come — contact the shop with questions.'} />
            {ev.course && <p className="small">Part of <Link to={`/training/${ev.course.slug}`}>{ev.course.name}</Link> — see prerequisites and what you'll learn.</p>}
            <div className="row" style={{ marginTop: 12 }}><EnrollButton ev={ev} /></div>
          </div>
        </div>
      </div>
      <div style={{ height: 48 }} />
    </div>
  );
}
