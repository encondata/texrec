import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, post } from '@/lib/api';
import { useAuth, homeFor } from '@/lib/auth';
import { useContent } from '@/lib/content';
import { Field, Input } from '@/components/ui';

function useForm<T extends Record<string, string>>(init: T) {
  const [v, setV] = useState(init);
  const [err, setErr] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const bind = (k: keyof T) => ({ value: v[k], onChange: (e: any) => setV({ ...v, [k]: e.target.value }), 'aria-invalid': !!details[k as string] });
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(null); setDetails({});
    try { await fn(); } catch (e) { const a = e as ApiError; setErr(a.message); setDetails(a.details || {}); } finally { setBusy(false); }
  };
  return { v, bind, err, details, busy, run };
}

const Shell = ({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) => (
  <div className="container section-tight">
    <div className="card card-pad auth-card">
      <h1 style={{ fontSize: '1.6rem', marginBottom: 4 }}>{title}</h1>
      {sub && <p className="muted small">{sub}</p>}
      {children}
    </div>
  </div>
);

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const { allowSelfRegister } = useContent();
  const f = useForm({ email: '', password: '' });
  const submit = (e: FormEvent) => { e.preventDefault(); f.run(async () => { const u = await login(f.v.email, f.v.password); nav(u.mustChangePassword ? '/change-password' : (loc.state?.from || homeFor(u)), { replace: true }); }); };
  return (
    <Shell title="Student Login" sub="Sign in to see your classes, the calendar and your progress.">
      <form onSubmit={submit} className="stack" style={{ marginTop: 16 }}>
        {f.err && <div className="alert alert-err">{f.err}</div>}
        <Field label="Email"><Input type="email" autoComplete="email" required {...f.bind('email')} /></Field>
        <Field label="Password"><Input type="password" autoComplete="current-password" required {...f.bind('password')} /></Field>
        <button className="btn btn-primary btn-block" disabled={f.busy}>{f.busy ? 'Signing in…' : 'Sign In'}</button>
        <div className="row-between small">
          <Link to="/forgot">Forgot password?</Link>
          {allowSelfRegister && <Link to="/register">Create an account</Link>}
        </div>
      </form>
    </Shell>
  );
}

export function Register() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const f = useForm({ firstName: '', lastName: '', email: '', phone: '', password: '' });
  const submit = (e: FormEvent) => { e.preventDefault(); f.run(async () => { const { user } = await post<any>('/auth/register', f.v); setUser(user); nav('/portal', { replace: true }); }); };
  return (
    <Shell title="Create your account" sub="Reserve class spots, track certifications and log your dives.">
      <form onSubmit={submit} className="stack" style={{ marginTop: 16 }}>
        {f.err && <div className="alert alert-err">{f.err}</div>}
        <div className="form-grid">
          <Field label="First name" error={f.details.firstName}><Input autoComplete="given-name" required {...f.bind('firstName')} /></Field>
          <Field label="Last name" error={f.details.lastName}><Input autoComplete="family-name" required {...f.bind('lastName')} /></Field>
        </div>
        <Field label="Email" error={f.details.email}><Input type="email" autoComplete="email" required {...f.bind('email')} /></Field>
        <Field label="Phone (optional)"><Input type="tel" autoComplete="tel" {...f.bind('phone')} /></Field>
        <Field label="Password" hint="At least 10 characters." error={f.details.password}><Input type="password" autoComplete="new-password" required minLength={10} {...f.bind('password')} /></Field>
        <button className="btn btn-primary btn-block" disabled={f.busy}>{f.busy ? 'Creating…' : 'Create Account'}</button>
        <p className="small center" style={{ margin: 0 }}>Already have an account? <Link to="/login">Sign in</Link></p>
      </form>
    </Shell>
  );
}

export function Forgot() {
  const f = useForm({ email: '' });
  const [sent, setSent] = useState(false);
  const submit = (e: FormEvent) => { e.preventDefault(); f.run(async () => { await post('/auth/forgot', f.v); setSent(true); }); };
  return (
    <Shell title="Reset your password" sub="Enter your email and we'll send a reset link.">
      {sent ? <div className="alert alert-ok" style={{ marginTop: 16 }}>If that email has an account, a reset link is on its way. It expires in one hour.</div> : (
        <form onSubmit={submit} className="stack" style={{ marginTop: 16 }}>
          {f.err && <div className="alert alert-err">{f.err}</div>}
          <Field label="Email"><Input type="email" autoComplete="email" required {...f.bind('email')} /></Field>
          <button className="btn btn-primary btn-block" disabled={f.busy}>Send reset link</button>
        </form>
      )}
      <p className="small center" style={{ margin: '14px 0 0' }}><Link to="/login">Back to sign in</Link></p>
    </Shell>
  );
}

export function Reset() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const f = useForm({ password: '', confirm: '' });
  const submit = (e: FormEvent) => { e.preventDefault(); f.run(async () => {
    if (f.v.password !== f.v.confirm) throw new ApiError(400, 'passwords do not match');
    await post('/auth/reset', { token: sp.get('token'), password: f.v.password }); nav('/login?reset=1', { replace: true }); }); };
  return (
    <Shell title="Choose a new password">
      <form onSubmit={submit} className="stack" style={{ marginTop: 16 }}>
        {f.err && <div className="alert alert-err">{f.err}</div>}
        <Field label="New password" hint="At least 10 characters."><Input type="password" autoComplete="new-password" required minLength={10} {...f.bind('password')} /></Field>
        <Field label="Confirm password"><Input type="password" autoComplete="new-password" required {...f.bind('confirm')} /></Field>
        <button className="btn btn-primary btn-block" disabled={f.busy}>Save password</button>
      </form>
    </Shell>
  );
}

export function ChangePassword() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const f = useForm({ currentPassword: '', password: '', confirm: '' });
  const forced = !!user?.mustChangePassword;
  const submit = (e: FormEvent) => { e.preventDefault(); f.run(async () => {
    if (f.v.password !== f.v.confirm) throw new ApiError(400, 'passwords do not match');
    await post('/auth/change-password', { currentPassword: f.v.currentPassword, newPassword: f.v.password });
    await refresh(); nav(loc.state?.from || homeFor(user), { replace: true }); }); };
  return (
    <Shell title={forced ? 'Set your password' : 'Change password'} sub={forced ? 'You signed in with a temporary password. Choose a new one to continue.' : undefined}>
      <form onSubmit={submit} className="stack" style={{ marginTop: 16 }}>
        {f.err && <div className="alert alert-err">{f.err}</div>}
        {!forced && <Field label="Current password" error={f.details.currentPassword}><Input type="password" autoComplete="current-password" required {...f.bind('currentPassword')} /></Field>}
        <Field label="New password" hint="At least 10 characters." error={f.details.newPassword}><Input type="password" autoComplete="new-password" required minLength={10} {...f.bind('password')} /></Field>
        <Field label="Confirm new password"><Input type="password" autoComplete="new-password" required {...f.bind('confirm')} /></Field>
        <button className="btn btn-primary btn-block" disabled={f.busy}>Save password</button>
      </form>
    </Shell>
  );
}
