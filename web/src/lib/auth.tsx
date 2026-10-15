import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { get, post } from './api';
import type { Role, User } from './types';

interface AuthCtx {
  user: User | null; loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  setUser: (u: User | null) => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null!);
const RANK: Record<Role, number> = { student: 1, staff: 2, admin: 3 };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try { setUser((await get<{ user: User | null }>('/auth/me')).user); }
    catch { setUser(null); }
  };
  useEffect(() => { refresh().finally(() => setLoading(false)); }, []);

  const login = async (email: string, password: string) => {
    const { user } = await post<{ user: User }>('/auth/login', { email, password });
    setUser(user);
    return user;
  };
  const logout = async () => { await post('/auth/logout'); setUser(null); };

  return <Ctx.Provider value={{ user, loading, login, logout, setUser, refresh }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
export const hasRole = (user: User | null, role: Role) => !!user && RANK[user.role] >= RANK[role];

// route guard; sends to /login (remembering where we were) or to the forced password change
export function RequireAuth({ role = 'student', children }: { role?: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="page-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (user.mustChangePassword && loc.pathname !== '/change-password') return <Navigate to="/change-password" state={{ from: loc.pathname }} replace />;
  if (!hasRole(user, role)) return <Navigate to="/portal" replace />;
  return <>{children}</>;
}

export const homeFor = (user: User | null) => (user && hasRole(user, 'staff') ? '/admin' : '/portal');
