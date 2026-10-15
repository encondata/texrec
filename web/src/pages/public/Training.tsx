import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, User, BarChart3, Clock, Tag as TagIcon } from 'lucide-react';
import { get } from '@/lib/api';
import { useContent } from '@/lib/content';
import { useAuth } from '@/lib/auth';
import type { Course } from '@/lib/types';
import { CATEGORY_LABEL, LEVEL_LABEL } from '@/lib/types';
import { Chips, Empty, Img, Input, Loading, Markdown, Tag } from '@/components/ui';
import { EventRow } from '@/components/events';
import { money } from '@/lib/format';
import { EnrollButton } from './Calendar';

export default function Training() {
  const { c } = useContent();
  const q = useQuery({ queryKey: ['courses'], queryFn: () => get<Course[]>('/courses') });
  const [agency, setAgency] = useState('all');
  const [level, setLevel] = useState('all');
  const [search, setSearch] = useState('');
  const list = (q.data || []).filter((x) =>
    (agency === 'all' || x.agency === agency) &&
    (level === 'all' || x.level === level || x.category === level) &&
    (!search || `${x.name} ${x.summary}`.toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="container">
      <div className="page-head"><h1>{c('training.title')}</h1><p className="lead">{c('training.subtitle')}</p></div>
      <div className="grid grid-2" style={{ marginBottom: 16, alignItems: 'end' }}>
        <div><div className="label" style={{ marginBottom: 6 }}>Filter by Agency</div>
          <Chips value={agency} onChange={setAgency} options={[{ value: 'all', label: 'All' }, { value: 'SDI', label: 'SDI' }, { value: 'TDI', label: 'TDI' }, { value: 'RAID', label: 'RAID' }]} /></div>
        <div><div className="label" style={{ marginBottom: 6 }}>Filter by Level</div>
          <Chips value={level} onChange={setLevel} options={[{ value: 'all', label: 'All' }, { value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'technical', label: 'Technical' }, { value: 'specialty', label: 'Specialty' }, { value: 'professional', label: 'Professional' }]} /></div>
      </div>
      <div style={{ position: 'relative', maxWidth: 420, marginBottom: 20 }}>
        <Search size={18} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--muted)' }} />
        <Input placeholder="Search classes…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 40 }} aria-label="Search classes" />
      </div>
      {q.isLoading && <Loading />}
      <div className="stack">
        {list.map((course) => (
          <div key={course.id} className="card course-row">
            <Link to={`/training/${course.slug}`}><Img imageKey={course.imageKey} alt="" thumb /></Link>
            <div className="body">
              <h3><Link to={`/training/${course.slug}`}>{course.name}</Link></h3>
              <div className="row" style={{ gap: 6 }}>
                {course.agency && <Tag tone="blue">{course.agency}</Tag>}
                <Tag>{CATEGORY_LABEL[course.category]}</Tag>
                <Tag tone="cyan">{LEVEL_LABEL[course.level]}</Tag>
              </div>
              <p className="small muted" style={{ margin: 0 }}>{course.summary}</p>
            </div>
            <div className="side">
              <span className="price strong" style={{ fontSize: '1.2rem', color: 'var(--navy)' }}>{money(course.priceCents)}</span>
              <Link to={`/training/${course.slug}`} className="btn btn-primary btn-sm">View Details</Link>
            </div>
          </div>
        ))}
        {!q.isLoading && list.length === 0 && <Empty>No classes match those filters.</Empty>}
      </div>
      <div style={{ height: 48 }} />
    </div>
  );
}

const TABS = ['Overview', 'Prerequisites', "What You'll Learn", 'Schedule', 'FAQ'] as const;

export function CourseDetail() {
  const { slug } = useParams();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['course', slug], queryFn: () => get<Course>(`/courses/${slug}`) });
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview');
  if (q.isLoading) return <Loading />;
  if (!q.data) return <div className="container"><Empty>Class not found.</Empty></div>;
  const course = q.data;
  const events = course.events || [];

  return (
    <div>
      <div style={{ background: 'var(--navy-900)', color: '#fff' }}>
        <div className="container" style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', alignItems: 'center', padding: 'clamp(28px,5vw,56px) var(--gutter)' }}>
          <div>
            <h1 style={{ color: '#fff' }}>{course.name}</h1>
            <p style={{ color: '#dbe6f1', margin: '12px 0 16px', maxWidth: '52ch' }}>{course.summary}</p>
            <div className="row" style={{ gap: 6 }}>
              {course.agency && <Tag tone="navy" >{course.agency}</Tag>}
              <Tag>{CATEGORY_LABEL[course.category]}</Tag>
              <Tag tone="cyan">{LEVEL_LABEL[course.level]}</Tag>
            </div>
          </div>
          <Img imageKey={course.imageKey} alt="" className="img-cover" style={{ borderRadius: 12 } as any} />
        </div>
      </div>
      <div className="container">
        <div className="chips" style={{ margin: '20px 0', overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 4 }}>
          {TABS.map((t) => <button key={t} className={`chip ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)} style={{ whiteSpace: 'nowrap' }}>{t}</button>)}
        </div>
        <div className="grid grid-4" style={{ marginBottom: 28 }}>
          {[[User, 'Agency', course.agency || '—'], [BarChart3, 'Level', LEVEL_LABEL[course.level]], [Clock, 'Duration', course.duration || '—'], [TagIcon, 'Price', money(course.priceCents)]].map(([Icon, l, v]: any) => (
            <div key={l} className="card stat"><div className="ico"><Icon size={20} /></div><div><span>{l}</span><b style={{ fontSize: '1.1rem' }}>{v}</b></div></div>
          ))}
        </div>
        {tab === 'Overview' && <><h2 style={{ marginBottom: 10 }}>Course Overview</h2><Markdown text={course.description} /></>}
        {tab === 'Prerequisites' && <><h2 style={{ marginBottom: 10 }}>Prerequisites</h2><Markdown text={course.prerequisites || 'No prerequisites — just bring your enthusiasm.'} /></>}
        {tab === "What You'll Learn" && <><h2 style={{ marginBottom: 10 }}>What You'll Learn</h2><Markdown text={course.outcomes} /></>}
        {tab === 'FAQ' && <><h2 style={{ marginBottom: 10 }}>FAQ</h2><div className="stack">{course.faq.map((f, i) => <details key={i} className="card card-pad"><summary className="strong" style={{ cursor: 'pointer' }}>{f.q}</summary><p style={{ margin: '10px 0 0' }} className="muted">{f.a}</p></details>)}{course.faq.length === 0 && <Empty>No FAQ yet.</Empty>}</div></>}

        {(tab === 'Overview' || tab === 'Schedule') && (
          <section style={{ marginTop: 36 }}>
            <div className="row-between" style={{ marginBottom: 12 }}><h2>Upcoming Class Sessions</h2>{!user && <Link to="/login" className="small">Sign in to enroll</Link>}</div>
            <div className="stack">
              {events.map((ev) => <EventRow key={ev.id} ev={ev} showType={false} action={<EnrollButton ev={ev} />} />)}
              {events.length === 0 && <Empty>No sessions scheduled right now. <Link to="/about">Contact us</Link> about a private class.</Empty>}
            </div>
          </section>
        )}
        <div style={{ height: 48 }} />
      </div>
    </div>
  );
}
