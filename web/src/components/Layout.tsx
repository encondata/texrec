import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, X, Phone, Mail, MapPin } from 'lucide-react';
import { useContent } from '@/lib/content';
import { useAuth, homeFor } from '@/lib/auth';

const NAV = [
  ['/training', 'Training'], ['/calendar', 'Calendar'], ['/instructors', 'Instructors'],
  ['/blog', 'Blog'], ['/media', 'Media'], ['/about', 'About'],
] as const;

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className="brand" aria-label="Tex Rec home">
      <img src="/img/texrec-logo.png" alt="" width={40} height={38} />
      <span className="brand-text"><b>TEX REC</b><span style={light ? { color: 'var(--cyan)' } : undefined}>SCUBA TRAINING</span></span>
    </Link>
  );
}

export function PublicLayout() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const { user } = useAuth();
  const { c } = useContent();
  useEffect(() => { setOpen(false); window.scrollTo({ top: 0 }); }, [loc.pathname]);
  useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [open]);

  const links = (cls: string) => (
    <>
      {NAV.map(([to, label]) => <NavLink key={to} to={to} className={cls}>{label}</NavLink>)}
      <Link to={user ? homeFor(user) : '/login'} className="btn btn-primary">{user ? (user.role === 'student' ? 'My Portal' : 'Admin') : 'Student Login'}</Link>
    </>
  );

  return (
    <div className="app">
      <header className="site-header">
        <div className="container bar">
          <Brand />
          <nav className="nav" aria-label="Main">{links('')}</nav>
          <button className="menu-btn" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <X /> : <Menu />}
          </button>
        </div>
        {open && <nav className="mobile-nav" aria-label="Main">{links('')}</nav>}
      </header>
      <main><Outlet /></main>
      <footer className="site-footer">
        <div className="container">
          <div className="foot-grid">
            <div>
              <Brand light />
              <p className="small" style={{ marginTop: 14, maxWidth: '36ch' }}>{c('site.footer')}</p>
              <div className="agency-row"><span className="agency-badge">SDI</span><span className="agency-badge">TDI</span><span className="agency-badge">RAID</span></div>
            </div>
            <div>
              <h4>Visit</h4>
              <p className="small"><MapPin size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> {c('site.address')}<br />{c('site.city')}</p>
              <p className="small" style={{ whiteSpace: 'pre-line' }}>{c('site.hours')}</p>
            </div>
            <div>
              <h4>Contact</h4>
              <p className="small"><Phone size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> <a href={`tel:${c('site.phone').replace(/\D/g, '')}`}>{c('site.phone')}</a></p>
              <p className="small"><Mail size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> <a href={`mailto:${c('site.email')}`}>{c('site.email')}</a></p>
              <p className="small row" style={{ gap: 12 }}>
                {c('site.facebook') && <a href={c('site.facebook')} target="_blank" rel="noreferrer">Facebook</a>}
                {c('site.instagram') && <a href={c('site.instagram')} target="_blank" rel="noreferrer">Instagram</a>}
                {c('site.youtube') && <a href={c('site.youtube')} target="_blank" rel="noreferrer">YouTube</a>}
              </p>
            </div>
            <div>
              <h4>Explore</h4>
              <div className="stack small" style={{ gap: 6 }}>
                {NAV.map(([to, label]) => <Link key={to} to={to}>{label}</Link>)}
                <Link to="/login">Student Login</Link>
              </div>
            </div>
          </div>
          <div className="legal">
            <span>© {new Date().getFullYear()} {c('site.name')}. All rights reserved.</span>
            <span>{c('site.tagline')}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ---------- shared shell for the student portal and the admin portal ----------
export function AppShell({ links, title }: { links: { to: string; label: string; icon: React.ReactNode; end?: boolean }[]; title: string }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const { user, logout } = useAuth();
  useEffect(() => { setOpen(false); }, [loc.pathname]);

  const nav = (cls: string) => (
    <>
      {links.map((l) => <NavLink key={l.to} to={l.to} end={l.end} className={cls}>{l.icon}{l.label}</NavLink>)}
      <div className="sb-sep" />
      <Link to="/">← Public site</Link>
      <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}>Log out</a>
    </>
  );

  return (
    <div className="app">
      <div className="app-top">
        <Brand light />
        <span className="small" style={{ opacity: 0.7, marginLeft: 4 }}>{title}</span>
        <span className="spacer" />
        <Link to={user?.role === 'student' ? '/portal/profile' : '/admin/profile'} className="small" style={{ color: '#fff' }}>{user?.firstName}</Link>
        <button className="menu-btn" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
      </div>
      {open && <nav className="drawer">{nav('')}</nav>}
      <div className="app-body">
        <aside className="sidebar"><nav style={{ display: 'contents' }}>{nav('')}</nav></aside>
        <main className="app-main"><div className="container"><Outlet /></div></main>
      </div>
    </div>
  );
}
