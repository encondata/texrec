import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, X, Phone, Mail, MapPin } from 'lucide-react';
import { get, fileUrl, thumbUrl } from '@/lib/api';
import { useContent } from '@/lib/content';
import type { Album, Media, Post, PostCategory, Staff } from '@/lib/types';
import { ALBUM_LABEL, POST_CATEGORY_LABEL } from '@/lib/types';
import { Chips, Empty, Img, Loading, Markdown, Tag } from '@/components/ui';
import { fmtDate } from '@/lib/format';

// ---------- instructors ----------
export function Instructors() {
  const { c } = useContent();
  const q = useQuery({ queryKey: ['staff'], queryFn: () => get<Staff[]>('/staff') });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="container">
      <div className="page-head"><h1>{c('instructors.title')}</h1><p className="lead">{c('instructors.subtitle')}</p></div>
      {q.isLoading && <Loading />}
      <div className="grid grid-3">
        {(q.data || []).map((s) => (
          <div key={s.id} className="card staff-card">
            <Img imageKey={s.photoKey} alt={`${s.firstName} ${s.lastName}`} className="img-cover img-portrait" />
            <div className="body">
              <h3>{s.firstName} {s.lastName}</h3>
              <div className="title">{s.title}</div>
              <div className="row" style={{ gap: 6 }}>{s.agencies.map((a) => <Tag key={a} tone="blue">{a}</Tag>)}</div>
              <p className="bio" style={open === s.id ? undefined : { display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.bio}</p>
              {open === s.id && s.certifications.length > 0 && <ul className="small muted" style={{ paddingLeft: 18, margin: '0 0 10px' }}>{s.certifications.map((x) => <li key={x}>{x}</li>)}</ul>}
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? 'Show less' : 'Read More →'}</button>
            </div>
          </div>
        ))}
      </div>
      {q.data?.length === 0 && <Empty>Instructor bios are coming soon.</Empty>}
      <div style={{ height: 48 }} />
    </div>
  );
}

// ---------- blog ----------
export function Blog() {
  const { c } = useContent();
  const [cat, setCat] = useState<PostCategory | 'all'>('all');
  const q = useQuery({ queryKey: ['posts'], queryFn: () => get<Post[]>('/posts') });
  const list = (q.data || []).filter((p) => cat === 'all' || p.category === cat);
  return (
    <div className="container">
      <div className="page-head"><h1>{c('blog.title')}</h1><p className="lead">{c('blog.subtitle')}</p></div>
      <div style={{ marginBottom: 18 }}><Chips value={cat} onChange={setCat} options={[{ value: 'all', label: 'All' }, ...(Object.keys(POST_CATEGORY_LABEL) as PostCategory[]).map((k) => ({ value: k, label: POST_CATEGORY_LABEL[k] }))]} /></div>
      {q.isLoading && <Loading />}
      <div className="grid grid-3">
        {list.map((p) => (
          <Link key={p.id} to={`/blog/${p.slug}`} className="card post-card" style={{ color: 'inherit', textDecoration: 'none' }}>
            <Img imageKey={p.coverKey} alt="" thumb />
            <div className="body">
              <h3 style={{ fontSize: '1.05rem' }}>{p.title}</h3>
              <div className="meta">{p.publishedAt && fmtDate(p.publishedAt)} · {POST_CATEGORY_LABEL[p.category]}</div>
              <p className="small muted" style={{ margin: 0 }}>{p.excerpt}</p>
              <span className="small strong" style={{ color: 'var(--blue)', marginTop: 'auto' }}>Read →</span>
            </div>
          </Link>
        ))}
      </div>
      {!q.isLoading && list.length === 0 && <Empty>No posts yet.</Empty>}
      <div style={{ height: 48 }} />
    </div>
  );
}

export function PostPage() {
  const { slug } = useParams();
  const q = useQuery({ queryKey: ['post', slug], queryFn: () => get<Post>(`/posts/${slug}`) });
  if (q.isLoading) return <Loading />;
  if (!q.data) return <div className="container"><Empty>Post not found.</Empty></div>;
  const p = q.data;
  return (
    <article className="container" style={{ maxWidth: 820 }}>
      <div className="page-head">
        <Link to="/blog" className="small">← All posts</Link>
        <div style={{ margin: '10px 0 8px' }}><Tag tone="blue">{POST_CATEGORY_LABEL[p.category]}</Tag></div>
        <h1>{p.title}</h1>
        <p className="muted small" style={{ marginTop: 8 }}>{p.publishedAt && fmtDate(p.publishedAt, { month: 'long', day: 'numeric', year: 'numeric' })}{p.author && ` · ${p.author.firstName} ${p.author.lastName}`}</p>
      </div>
      {p.coverKey && <img className="post-hero" src={fileUrl(p.coverKey)} alt="" />}
      <div style={{ marginTop: 24 }}><Markdown text={p.body} /></div>
      <div style={{ height: 48 }} />
    </article>
  );
}

// ---------- media gallery ----------
const embedUrl = (u: string) => {
  const yt = u.match(/(?:youtu\.be\/|v=|shorts\/)([\w-]{11})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vm = u.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
};

export function Gallery() {
  const { c } = useContent();
  const [album, setAlbum] = useState<Album | 'all'>('all');
  const [idx, setIdx] = useState<number | null>(null);
  const q = useQuery({ queryKey: ['media'], queryFn: () => get<Media[]>('/media') });
  const list = (q.data || []).filter((m) => album === 'all' || m.album === album);
  const photos = list.filter((m) => m.key);
  const videos = list.filter((m) => m.videoUrl);
  useEffect(() => {
    if (idx === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIdx(null); if (e.key === 'ArrowRight') setIdx((i) => (i! + 1) % photos.length); if (e.key === 'ArrowLeft') setIdx((i) => (i! - 1 + photos.length) % photos.length); };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, [idx, photos.length]);
  return (
    <div className="container">
      <div className="page-head"><h1>{c('media.title')}</h1><p className="lead">{c('media.subtitle')}</p></div>
      <div style={{ marginBottom: 18 }}><Chips value={album} onChange={setAlbum} options={[{ value: 'all', label: 'All' }, ...(Object.keys(ALBUM_LABEL) as Album[]).map((k) => ({ value: k, label: ALBUM_LABEL[k] }))]} /></div>
      {q.isLoading && <Loading />}
      <div className="gallery">
        {photos.map((m, i) => (
          <button key={m.id} onClick={() => setIdx(i)} aria-label={m.title || 'Photo'}><img src={thumbUrl(m.key)} alt={m.title} loading="lazy" /></button>
        ))}
      </div>
      {videos.length > 0 && (
        <div className="grid grid-2" style={{ marginTop: 24 }}>
          {videos.map((m) => { const src = embedUrl(m.videoUrl!); return (
            <div key={m.id} className="card card-pad">
              {src ? <iframe className="video-embed" src={src} title={m.title} allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen loading="lazy" /> : <a href={m.videoUrl!} target="_blank" rel="noreferrer">{m.videoUrl}</a>}
              <h3 style={{ marginTop: 10 }}>{m.title}</h3>{m.caption && <p className="small muted" style={{ margin: 0 }}>{m.caption}</p>}
            </div>); })}
        </div>
      )}
      {!q.isLoading && list.length === 0 && <Empty>No photos in this album yet.</Empty>}
      {idx !== null && photos[idx] && (
        <div className="lightbox" onClick={() => setIdx(null)} role="dialog" aria-modal="true">
          <button className="btn btn-outline btn-icon close" aria-label="Close"><X /></button>
          {photos.length > 1 && <button className="btn btn-outline btn-icon nav-btn prev" aria-label="Previous" onClick={(e) => { e.stopPropagation(); setIdx((idx - 1 + photos.length) % photos.length); }}><ChevronLeft /></button>}
          <img src={fileUrl(photos[idx].key)} alt={photos[idx].title} onClick={(e) => e.stopPropagation()} />
          {(photos[idx].title || photos[idx].caption) && <div className="cap"><b>{photos[idx].title}</b>{photos[idx].caption && <div className="small">{photos[idx].caption}</div>}</div>}
          {photos.length > 1 && <button className="btn btn-outline btn-icon nav-btn next" aria-label="Next" onClick={(e) => { e.stopPropagation(); setIdx((idx + 1) % photos.length); }}><ChevronRight /></button>}
        </div>
      )}
      <div style={{ height: 48 }} />
    </div>
  );
}

// ---------- about ----------
export function About() {
  const { c } = useContent();
  const stats: { value: string; label: string }[] = c('about.stats', []);
  return (
    <div className="container">
      <div className="page-head"><h1>{c('about.title')}</h1><p className="lead">{c('about.intro')}</p></div>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Markdown text={c('about.body')} />
        <div className="stack">
          {c('about.image') ? <Img imageKey={c('about.image')} alt="" className="img-cover" style={{ borderRadius: 12 } as any} /> : <div className="hero-fallback" style={{ position: 'relative', aspectRatio: '16/10', borderRadius: 12 }} />}
          <div className="stats">{stats.map((s, i) => <div key={i} className="card stat"><div><b>{s.value}</b><span>{s.label}</span></div></div>)}</div>
          <div className="card card-pad">
            <h3 style={{ marginBottom: 10 }}>Visit the shop</h3>
            <div className="stack small" style={{ gap: 8 }}>
              <span className="row" style={{ gap: 8 }}><MapPin size={16} /> {c('site.address')}, {c('site.city')}</span>
              <span className="row" style={{ gap: 8 }}><Phone size={16} /> <a href={`tel:${String(c('site.phone')).replace(/\D/g, '')}`}>{c('site.phone')}</a></span>
              <span className="row" style={{ gap: 8 }}><Mail size={16} /> <a href={`mailto:${c('site.email')}`}>{c('site.email')}</a></span>
              <span style={{ whiteSpace: 'pre-line' }} className="muted">{c('site.hours')}</span>
            </div>
          </div>
        </div>
      </div>
      <div style={{ height: 48 }} />
    </div>
  );
}
