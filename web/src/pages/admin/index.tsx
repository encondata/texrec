import { Link, Route, Routes } from 'react-router-dom';
import { LayoutDashboard, Users, CalendarDays, GraduationCap, UserCog, MapPin, Newspaper, Image, PenLine, Settings as SettingsIcon, UserCircle, Clock, AlertCircle, UserPlus, Armchair } from 'lucide-react';
import { AppShell } from '@/components/Layout';
import { useAuth, hasRole } from '@/lib/auth';
import { Loading, Tag } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { useList, Head } from './shared';
import { Students, StudentDetail } from './Students';
import { Events, EventDetail } from './Events';
import { Courses, DiveSites, Posts } from './Catalog';
import { Staff, MyAccount } from './Staff';
import { MediaAdmin, ContentAdmin, SettingsAdmin } from './Site';

export default function Admin() {
  const { user } = useAuth();
  const links = [
    { to: '/admin', label: 'Dashboard', icon: <LayoutDashboard size={18} />, end: true },
    { to: '/admin/students', label: 'Students', icon: <Users size={18} /> },
    { to: '/admin/events', label: 'Classes & Events', icon: <CalendarDays size={18} /> },
    { to: '/admin/courses', label: 'Courses', icon: <GraduationCap size={18} /> },
    { to: '/admin/instructors', label: 'Instructors', icon: <UserCog size={18} /> },
    { to: '/admin/dive-sites', label: 'Dive Sites', icon: <MapPin size={18} /> },
    { to: '/admin/posts', label: 'Blog / Newsletter', icon: <Newspaper size={18} /> },
    { to: '/admin/media', label: 'Media', icon: <Image size={18} /> },
    { to: '/admin/content', label: 'Site Content', icon: <PenLine size={18} /> },
    ...(hasRole(user, 'admin') ? [{ to: '/admin/settings', label: 'Settings', icon: <SettingsIcon size={18} /> }] : []),
    { to: '/admin/profile', label: 'My Account', icon: <UserCircle size={18} /> },
  ];
  return (
    <Routes>
      <Route element={<AppShell links={links} title="Admin" />}>
        <Route index element={<Dashboard />} />
        <Route path="students" element={<Students />} />
        <Route path="students/:id" element={<StudentDetail />} />
        <Route path="events" element={<Events />} />
        <Route path="events/:id" element={<EventDetail />} />
        <Route path="courses" element={<Courses />} />
        <Route path="instructors" element={<Staff />} />
        <Route path="dive-sites" element={<DiveSites />} />
        <Route path="posts" element={<Posts />} />
        <Route path="media" element={<MediaAdmin />} />
        <Route path="content" element={<ContentAdmin />} />
        <Route path="settings" element={<SettingsAdmin />} />
        <Route path="profile" element={<MyAccount />} />
      </Route>
    </Routes>
  );
}

interface Dash { stats: { students: number; upcomingEvents: number; upcomingSeats: number; waitlisted: number; unpaid: number; newStudents30d: number }; recent: { id: string; status: string; createdAt: string; student: string; event: string; startsAt: string }[]; paymentsEnabled: boolean }

function Dashboard() {
  const { user } = useAuth();
  const q = useList<Dash>(['admin', 'dashboard'], '/admin/dashboard');
  if (!q.data) return <Loading />;
  const s = q.data.stats;
  const stat = (Icon: any, n: number, label: string, to: string) => <Link to={to} className="card stat" style={{ color: 'inherit', textDecoration: 'none' }}><div className="ico"><Icon size={20} /></div><div><b>{n}</b><span>{label}</span></div></Link>;
  return (
    <>
      <Head title={`Welcome, ${user?.firstName}!`} sub="Here's what's happening at Tex Rec.">
        <Link to="/admin/events?new=1" className="btn btn-primary btn-sm">+ Add Event</Link>
      </Head>
      <div className="stats" style={{ marginBottom: 20 }}>
        {stat(Users, s.students, 'Active students', '/admin/students')}
        {stat(CalendarDays, s.upcomingEvents, 'Upcoming events', '/admin/events')}
        {stat(Armchair, s.upcomingSeats, 'Seats reserved', '/admin/events')}
        {stat(Clock, s.waitlisted, 'On waitlists', '/admin/events')}
        {stat(AlertCircle, s.unpaid, 'Unpaid reservations', '/admin/events')}
        {stat(UserPlus, s.newStudents30d, 'New students (30d)', '/admin/students')}
      </div>
      <div className="card card-pad">
        <h3 style={{ marginBottom: 10 }}>Recent sign-ups</h3>
        <div className="list">
          {q.data.recent.map((r) => (
            <div key={r.id} className="list-item">
              <span className={`status-dot ${r.status}`} />
              <div className="body"><b>{r.student}</b><span>{r.event} · {fmtDate(r.startsAt)}</span></div>
              <Tag tone={r.status === 'waitlisted' ? 'warn' : r.status === 'cancelled' ? 'danger' : 'blue'}>{r.status}</Tag>
              <span className="tiny muted">{fmtDate(r.createdAt)}</span>
            </div>
          ))}
          {q.data.recent.length === 0 && <span className="small muted">No sign-ups yet.</span>}
        </div>
      </div>
      {!q.data.paymentsEnabled && hasRole(user, 'admin') && <p className="small muted" style={{ marginTop: 14 }}>Online payments are off. Enter your Stripe keys under <Link to="/admin/settings">Settings</Link> to accept cards at enrollment.</p>}
    </>
  );
}
