import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PublicLayout } from './components/Layout';
import { RequireAuth } from './lib/auth';
import { Loading } from './components/ui';
import Home from './pages/public/Home';
import Training, { CourseDetail } from './pages/public/Training';
import CalendarPage, { EventDetail } from './pages/public/Calendar';
import { About, Blog, Gallery, Instructors, PostPage } from './pages/public/Pages';
import { ChangePassword, Forgot, Login, Register, Reset } from './pages/public/Auth';

// portals load on demand so the public site stays small
const Portal = lazy(() => import('./pages/portal'));
const Admin = lazy(() => import('./pages/admin'));

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/training" element={<Training />} />
          <Route path="/training/:slug" element={<CourseDetail />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/calendar/:id" element={<EventDetail />} />
          <Route path="/instructors" element={<Instructors />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<PostPage />} />
          <Route path="/media" element={<Gallery />} />
          <Route path="/about" element={<About />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot" element={<Forgot />} />
          <Route path="/reset" element={<Reset />} />
          <Route path="/change-password" element={<RequireAuth><ChangePassword /></RequireAuth>} />
        </Route>
        <Route path="/portal/*" element={<RequireAuth><Portal /></RequireAuth>} />
        <Route path="/admin/*" element={<RequireAuth role="staff"><Admin /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
