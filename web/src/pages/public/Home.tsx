import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, MapPin, Compass, Users, HeartHandshake, Shield, Anchor, Waves, Award, Calendar } from 'lucide-react';
import { get, fileUrl } from '@/lib/api';
import { useContent } from '@/lib/content';
import type { Course, Event } from '@/lib/types';
import { Img, Spots } from '@/components/ui';
import { fmtDate, fmtTime, money } from '@/lib/format';

// icons an admin can pick for the feature cards
export const ICONS: Record<string, React.ComponentType<any>> = { 'map-pin': MapPin, compass: Compass, users: Users, 'heart-handshake': HeartHandshake, shield: Shield, anchor: Anchor, waves: Waves, award: Award, calendar: Calendar };

export default function Home() {
  const { c } = useContent();
  const courses = useQuery({ queryKey: ['courses'], queryFn: () => get<Course[]>('/courses') });
  const events = useQuery({ queryKey: ['events', 'next'], queryFn: () => get<Event[]>('/events?upcoming=1&limit=1') });
  const featured = (courses.data || []).filter((x) => x.featured).slice(0, 4);
  const next = events.data?.[0];
  const heroLines = String(c('home.hero.title')).split('\n').filter(Boolean);
  const features: { icon: string; title: string; text: string }[] = c('home.features', []);

  return (
    <>
      <section className="hero">
        {c('home.hero.image') ? <img className="hero-bg" src={fileUrl(c('home.hero.image'))} alt="" fetchPriority="high" /> : <div className="hero-fallback" />}
        <div className="container">
          <div className="hero-inner">
            <h1>{heroLines.map((l, i) => <span key={i}>{l}</span>)}</h1>
            <p>{c('home.hero.subtitle')}</p>
            <div className="hero-cta">
              <Link to="/training" className="btn btn-primary">{c('home.hero.ctaPrimary')}</Link>
              <Link to="/calendar" className="btn btn-outline">{c('home.hero.ctaSecondary')}</Link>
            </div>
            <div className="agency-row hero-agencies"><span className="agency-badge">SDI</span><span className="agency-badge">TDI</span><span className="agency-badge">RAID</span></div>
          </div>
        </div>
      </section>

      <section className="section-tight">
        <div className="container grid grid-4">
          {features.map((f, i) => {
            const Icon = ICONS[f.icon] || Shield;
            return (
              <div key={i} className="feature">
                <div className="ico"><Icon size={24} /></div>
                <div><h3>{f.title}</h3><p>{f.text}</p></div>
              </div>
            );
          })}
        </div>
      </section>

      {featured.length > 0 && (
        <section className="section-tight">
          <div className="container">
            <div className="row-between" style={{ marginBottom: 16 }}>
              <h2>{c('home.featured.title')}</h2>
              <Link to="/training" className="btn btn-ghost btn-sm">All classes <ArrowRight size={16} /></Link>
            </div>
            <div className="grid grid-4">
              {featured.map((course) => (
                <Link key={course.id} to={`/training/${course.slug}`} className="card course-card" style={{ color: 'inherit', textDecoration: 'none' }}>
                  <Img imageKey={course.imageKey} alt={course.name} thumb />
                  <div className="body">
                    <h3 style={{ fontSize: '1rem' }}>{course.name}</h3>
                    <div className="row-between"><span className="small muted">{course.agency}</span><span className="price">{money(course.priceCents)}</span></div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {next && (
        <section className="section-tight">
          <div className="container">
            <div className="next-event">
              {(c('home.nextEvent.image') || next.course?.imageKey) ? <img src={fileUrl(c('home.nextEvent.image') || next.course?.imageKey)} alt="" loading="lazy" /> : <div className="hero-fallback" style={{ position: 'relative', minHeight: 160 }} />}
              <div className="body">
                <span className="label">{c('home.nextEvent.label')}</span>
                <h3>{next.title}</h3>
                <div className="meta">
                  <span>{fmtDate(next.startsAt, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <span>{fmtTime(next.startsAt)}</span>
                  <Spots left={next.spotsLeft} capacity={next.capacity} />
                </div>
                <div><Link to={`/calendar/${next.id}`} className="btn btn-primary btn-sm" style={{ marginTop: 8 }}>View Event</Link></div>
              </div>
            </div>
          </div>
        </section>
      )}
      <div style={{ height: 32 }} />
    </>
  );
}
