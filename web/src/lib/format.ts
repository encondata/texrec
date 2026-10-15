const TZ = 'America/Chicago';

export const money = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: cents % 100 ? 2 : 0 });

export const fmtDate = (d: string | Date, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) =>
  new Date(d).toLocaleDateString('en-US', { timeZone: TZ, ...opts });

export const fmtTime = (d: string | Date) => new Date(d).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });

export const fmtRange = (a: string, b: string) => {
  const sameDay = fmtDate(a) === fmtDate(b);
  return sameDay ? `${fmtTime(a)} – ${fmtTime(b)}` : `${fmtDate(a, { month: 'short', day: 'numeric' })} – ${fmtDate(b, { month: 'short', day: 'numeric' })}`;
};

// "MAY" / "24" pieces for date tiles
export const dateParts = (d: string) => {
  const dt = new Date(d);
  return {
    month: dt.toLocaleDateString('en-US', { timeZone: TZ, month: 'short' }).toUpperCase(),
    day: dt.toLocaleDateString('en-US', { timeZone: TZ, day: 'numeric' }),
    weekday: dt.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' }),
  };
};

// yyyy-mm-dd in Central time, for grouping on calendars
export const dayKey = (d: string | Date) => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(d));
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g('year')}-${g('month')}-${g('day')}`;
};

// datetime-local input value <-> ISO
export const toLocalInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export const fullName = (u?: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');
export const initials = (u?: { firstName: string; lastName: string } | null) => (u ? `${u.firstName[0] || ''}${u.lastName[0] || ''}`.toUpperCase() : '');
export const bytes = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
