import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, MapPin, Compass, Users, HeartHandshake, Shield, Anchor, Waves, Award, Calendar, Clock } from 'lucide-react';
import { get, fileUrl, thumbUrl } from '@/lib/api';
import { useContent } from '@/lib/content';
import type { Course, Event, Post, Staff } from '@/lib/types';
import { LEVEL_LABEL, POST_CATEGORY_LABEL } from '@/lib/types';
import { Img, Spots, Tag } from '@/components/ui';
import { fmtDate, fmtTime, money } from '@/lib/format';

// icons an admin can pick for the feature cards
export const ICONS: Record<string, React.ComponentType<any>> = { 'map-pin': MapPin, compass: Compass, users: Users, 'heart-handshake': HeartHandshake, shield: Shield, anchor: Anchor, waves: Waves, award: Award, calendar: Calendar };

const Eyebrow = ({ children }: { children: React.ReactNode }) => <div className="eyebrow">{children}</div>;

export default function Home() {
  const { c } = useContent();
  const courses = useQuery({ queryKey: ['courses'], queryFn: () => get<Course[]>('/courses') });
  const events = useQuery({ queryKey: ['events', 'next'], queryFn: () => get<Event[]>('/events?upcoming=1&limit=1') });
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => get<Staff[]>('/staff') });
  const posts = useQuery({ queryKey: ['posts', 'home'], queryFn: () => get<Post[]>('/posts?limit=3') });
  const featured = (courses.data || []).filter((x) => x.featured).slice(0, 4);
  const next = events.data?.[0];
  const heroLines = String(c('home.hero.title')).split('\n').filter(Boolean);
  const features: { icon: string; title: string; text: string }[] = c('home.features', []);
  const stats: { value: string; label: string }[] = c('home.stats', []);
  const instructors = (staff.data || []).slice(0, 4);

  return (
    <>
      {/* ---------- hero ---------- */}
      <section className="hero hero-xl">
        {c('home.hero.image') ? <img className="hero-bg" src={fileUrl(c('home.hero.image'))} alt="" fetchPriority="high" /> : <div className="hero-fallback" />}
        <div className="bubbles" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <span key={i} style={{ left: `${(i * 7.3 + 3) % 100}%`, animationDelay: `${(i * 1.7) % 9}s`, animationDuration: `${9 + (i % 5) * 2}s`, width: 6 + (i % 4) * 4 }} />)}</div>
        <div className="container">
          <div className="hero-inner">
            <Eyebrow>{c('home.hero.eyebrow')}</Eyebrow>
            <h1>{heroLines.map((l, i) => <span key={i}>{l}</span>)}</h1>
            <p>{c('home.hero.subtitle')}</p>
            <div className="hero-cta">
              <Link to="/training" className="btn btn-primary btn-lg">{c('home.hero.ctaPrimary')} <ArrowRight size={18} /></Link>
              <Link to="/calendar" className="btn btn-outline btn-lg">{c('home.hero.ctaSecondary')}</Link>
            </div>
            <div className="hero-agencies">
              <span className="tiny" style={{ letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9fb3c8', fontWeight: 700 }}>Certifying through</span>
              <div className="agency-row"><span className="agency-badge">SDI</span><span className="agency-badge">TDI</span><span className="agency-badge">RAID</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- stats band ---------- */}
      {stats.length > 0 && (
        <section className="stats-band">
          <div className="container stats-grid">
            {stats.map((s, i) => <div key={i} className="stat-item"><b>{s.value}</b><span>{s.label}</span></div>)}
          </div>
        </section>
      )}

      {/* ---------- features ---------- */}
      <section className="section-tight">
        <div className="container grid grid-4">
          {features.map((f, i) => {
            const Icon = ICONS[f.icon] || Shield;
            return (
              <div key={i} className="feature feature-card">
                <div className="ico"><Icon size={24} /></div>
                <div><h3>{f.title}</h3><p>{f.text}</p></div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------- featured classes ---------- */}
      {featured.length > 0 && (
        <section className="section-tight">
          <div className="container">
            <div className="row-between" style={{ marginBottom: 18, alignItems: 'flex-end' }}>
              <div><Eyebrow>Start here</Eyebrow><h2 className="h-accent">{c('home.featured.title')}</h2></div>
              <Link to="/training" className="btn btn-ghost btn-sm">All classes <ArrowRight size={16} /></Link>
            </div>
            <div className="grid grid-4">
              {featured.map((course) => (
                <Link key={course.id} to={`/training/${course.slug}`} className="photo-card">
                  <Img imageKey={course.imageKey} alt="" className="photo-card-img" />
                  <div className="photo-card-body">
                    <div className="row" style={{ gap: 6, marginBottom: 6 }}>{course.agency && <Tag tone="cyan">{course.agency}</Tag>}<Tag tone="navy">{LEVEL_LABEL[course.level]}</Tag></div>
                    <h3>{course.name}</h3>
                    <div className="row-between"><span className="price">{money(course.priceCents)}</span><span className="small" style={{ opacity: 0.85 }}>Details →</span></div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------- next event ---------- */}
      {next && (
        <section className="section-tight">
          <div className="container">
            <div className="next-event">
              {(c('home.nextEvent.image') || next.course?.imageKey) ? <img src={fileUrl(c('home.nextEvent.image') || next.course?.imageKey)} alt="" loading="lazy" /> : <div className="hero-fallback" style={{ position: 'relative', minHeight: 160 }} />}
              <div className="body">
                <span className="label">{c('home.nextEvent.label')}</span>
                <h3>{next.title}</h3>
                <div className="meta">
                  <span><Calendar size={14} /> {fmtDate(next.startsAt, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <span><Clock size={14} /> {fmtTime(next.startsAt)}</span>
                  {next.location && <span><MapPin size={14} /> {next.location}</span>}
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <Link to={`/calendar/${next.id}`} className="btn btn-primary">View Event</Link>
                  <Spots left={next.spotsLeft} capacity={next.capacity} />
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ---------- instructors ---------- */}
      {instructors.length > 0 && (
        <section className="section section-alt">
          <div className="container">
            <div className="split-head">
              <div><Eyebrow>Our team</Eyebrow><h2 className="h-accent">{c('home.instructors.title')}</h2></div>
              <p className="muted" style={{ maxWidth: '52ch', margin: 0 }}>{c('home.instructors.text')}</p>
            </div>
            <div className="grid grid-4" style={{ marginTop: 24 }}>
              {instructors.map((s) => (
                <Link key={s.id} to="/instructors" className="card staff-card" style={{ color: 'inherit', textDecoration: 'none' }}>
                  <Img imageKey={s.photoKey} alt="" className="img-cover img-square" />
                  <div className="body" style={{ padding: 14 }}>
                    <h3 style={{ fontSize: '1.02rem' }}>{s.firstName} {s.lastName}</h3>
                    <div className="title" style={{ margin: 0 }}>{s.title}</div>
                    <div className="row" style={{ gap: 6, marginTop: 8 }}>{s.agencies.map((a) => <Tag key={a} tone="blue">{a}</Tag>)}</div>
                  </div>
                </Link>
              ))}
            </div>
            <div style={{ marginTop: 20 }}><Link to="/instructors" className="btn btn-secondary">Meet the whole team <ArrowRight size={16} /></Link></div>
          </div>
        </section>
      )}

      {/* ---------- blog ---------- */}
      {(posts.data?.length || 0) > 0 && (
        <section className="section-tight" style={{ paddingTop: 40 }}>
          <div className="container">
            <div className="row-between" style={{ marginBottom: 18, alignItems: 'flex-end' }}>
              <div><Eyebrow>From the shop</Eyebrow><h2 className="h-accent">{c('home.blog.title')}</h2></div>
              <Link to="/blog" className="btn btn-ghost btn-sm">All posts <ArrowRight size={16} /></Link>
            </div>
            <div className="grid grid-3">
              {posts.data!.map((p) => (
                <Link key={p.id} to={`/blog/${p.slug}`} className="card post-card" style={{ color: 'inherit', textDecoration: 'none' }}>
                  <img className="img-cover" src={thumbUrl(p.coverKey)} alt="" loading="lazy" style={{ display: p.coverKey ? undefined : 'none' }} />
                  <div className="body">
                    <div className="meta">{p.publishedAt && fmtDate(p.publishedAt)} · {POST_CATEGORY_LABEL[p.category]}</div>
                    <h3 style={{ fontSize: '1.05rem' }}>{p.title}</h3>
                    <p className="small muted" style={{ margin: 0 }}>{p.excerpt}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------- closing CTA ---------- */}
      <section className="cta-band">
        {c('home.cta.image') && <img src={fileUrl(c('home.cta.image'))} alt="" loading="lazy" />}
        <div className="container cta-inner">
          <h2>{c('home.cta.title')}</h2>
          <p>{c('home.cta.text')}</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link to="/calendar" className="btn btn-primary btn-lg">{c('home.cta.button')} <ArrowRight size={18} /></Link>
            <Link to="/register" className="btn btn-outline btn-lg">Create an account</Link>
          </div>
        </div>
      </section>
    </>
  );
}
