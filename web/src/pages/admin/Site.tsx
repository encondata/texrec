import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Trash2, Video } from 'lucide-react';
import { get, put, del, post, upload, thumbUrl } from '@/lib/api';
import type { Album, ContentField, ContentValues, Media } from '@/lib/types';
import { ALBUM_LABEL } from '@/lib/types';
import { Check, Confirm, Field, Input, Loading, Modal, Select, Tag, Textarea } from '@/components/ui';
import { ICONS } from '../public/Home';
import { useList, useAction, imageForm, MarkdownEditor, Head } from './shared';

// ---------------- gallery ----------------
export function MediaAdmin() {
  const q = useList<Media[]>(['admin', 'media'], '/admin/media');
  const [album, setAlbum] = useState<Album>('classes');
  const [edit, setEdit] = useState<Media | null>(null);
  const [video, setVideo] = useState(false);
  const [confirm, setConfirm] = useState<Media | null>(null);
  const inv = [['admin', 'media'], ['media']];
  const up = useAction((files: FileList) => { const fd = new FormData(); for (const f of Array.from(files)) fd.append('files', f); fd.append('album', album); return upload('/admin/media', fd); }, { invalidate: inv, ok: 'Uploaded.' });
  const save = useAction((m: Media) => put(`/admin/media/${m.id}`, { album: m.album, title: m.title, caption: m.caption, videoUrl: m.videoUrl || null, public: m.public, sort: m.sort }), { invalidate: inv, ok: 'Saved.', onSuccess: () => setEdit(null) });
  const addVideo = useAction((v: { title: string; videoUrl: string; caption: string }) => post('/admin/media/video', { ...v, album: 'videos' }), { invalidate: inv, ok: 'Video added.', onSuccess: () => setVideo(false) });
  const rm = useAction((m: Media) => del(`/admin/media/${m.id}`), { invalidate: inv, ok: 'Deleted.', onSuccess: () => setConfirm(null) });
  const [vf, setVf] = useState({ title: '', videoUrl: '', caption: '' });
  return (
    <>
      <Head title="Media Gallery" sub="Photos and videos on the public Media page.">
        <button className="btn btn-secondary btn-sm" onClick={() => setVideo(true)}><Video size={16} /> Add video link</button>
        <Select value={album} onChange={(e) => setAlbum(e.target.value as Album)} style={{ width: 'auto', minHeight: 36 }}>{(Object.keys(ALBUM_LABEL) as Album[]).filter((a) => a !== 'videos').map((a) => <option key={a} value={a}>{ALBUM_LABEL[a]}</option>)}</Select>
        <label className="btn btn-primary btn-sm">{up.isPending ? 'Uploading…' : <><Plus size={16} /> Upload photos</>}<input type="file" accept="image/*" multiple hidden disabled={up.isPending} onChange={(e) => e.target.files?.length && up.mutate(e.target.files)} /></label>
      </Head>
      {q.isLoading && <Loading />}
      <div className="gallery">
        {(q.data || []).map((m) => (
          <button key={m.id} onClick={() => setEdit({ ...m })} style={{ position: 'relative' }} aria-label={`Edit ${m.title}`}>
            {m.key ? <img src={thumbUrl(m.key)} alt={m.title} loading="lazy" /> : <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted)' }}><Video /></div>}
            <span style={{ position: 'absolute', left: 6, bottom: 6, right: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}><Tag tone="navy">{ALBUM_LABEL[m.album]}</Tag>{!m.public && <Tag tone="warn">Hidden</Tag>}</span>
          </button>
        ))}
      </div>
      {!q.isLoading && q.data?.length === 0 && <div className="empty">No media yet. Upload some photos.</div>}
      {edit && (
        <Modal title="Edit media" onClose={() => setEdit(null)}>
          <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(edit); }}>
            {edit.key && <img src={thumbUrl(edit.key)} alt="" style={{ borderRadius: 10, maxHeight: 240, objectFit: 'cover' }} />}
            <div className="form-grid">
              <Field label="Title" className="span-2"><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
              <Field label="Caption" className="span-2"><Textarea rows={2} value={edit.caption} onChange={(e) => setEdit({ ...edit, caption: e.target.value })} /></Field>
              <Field label="Album"><Select value={edit.album} onChange={(e) => setEdit({ ...edit, album: e.target.value as Album })}>{(Object.keys(ALBUM_LABEL) as Album[]).map((a) => <option key={a} value={a}>{ALBUM_LABEL[a]}</option>)}</Select></Field>
              <Field label="Sort order"><Input type="number" value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: Number(e.target.value) })} /></Field>
              {edit.videoUrl !== undefined && edit.mime === 'video/link' && <Field label="Video URL" className="span-2"><Input value={edit.videoUrl || ''} onChange={(e) => setEdit({ ...edit, videoUrl: e.target.value })} /></Field>}
              <Check label="Visible on the public site" checked={edit.public} onChange={(e) => setEdit({ ...edit, public: e.target.checked })} />
            </div>
            <div className="form-actions"><button type="button" className="btn btn-danger" onClick={() => setConfirm(edit)}><Trash2 size={15} /> Delete</button><span className="spacer" /><button type="button" className="btn btn-secondary" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" disabled={save.isPending}>Save</button></div>
          </form>
        </Modal>
      )}
      {video && (
        <Modal title="Add video" onClose={() => setVideo(false)}>
          <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); addVideo.mutate(vf); }}>
            <Field label="YouTube or Vimeo URL"><Input type="url" required value={vf.videoUrl} onChange={(e) => setVf({ ...vf, videoUrl: e.target.value })} /></Field>
            <Field label="Title"><Input required value={vf.title} onChange={(e) => setVf({ ...vf, title: e.target.value })} /></Field>
            <Field label="Caption"><Textarea rows={2} value={vf.caption} onChange={(e) => setVf({ ...vf, caption: e.target.value })} /></Field>
            <div className="form-actions"><button type="button" className="btn btn-secondary" onClick={() => setVideo(false)}>Cancel</button><button className="btn btn-primary" disabled={addVideo.isPending}>Add</button></div>
          </form>
        </Modal>
      )}
      {confirm && <Confirm title="Delete media?" text={confirm.title || 'This item'} onYes={() => { rm.mutate(confirm); setEdit(null); }} onNo={() => setConfirm(null)} />}
    </>
  );
}

// ---------------- site content (schema-driven) ----------------
export function ContentAdmin() {
  const q = useList<{ schema: ContentField[]; values: ContentValues }>(['admin', 'content'], '/admin/content');
  const [values, setValues] = useState<ContentValues>({});
  const [section, setSection] = useState('Site');
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  useEffect(() => { if (q.data) { setValues(q.data.values); setDirty(new Set()); } }, [q.data]);
  const save = useAction(() => put<{ values: ContentValues }>('/admin/content', { values: Object.fromEntries([...dirty].map((k) => [k, values[k]])) }), { invalidate: [['admin', 'content'], ['content']], ok: 'Content published.', onSuccess: () => setDirty(new Set()) });
  const img = useAction(({ key, file }: { key: string; file: File }) => { const fd = imageForm(file); fd.append('key', key); return upload<{ imageKey: string }>('/admin/content/image', fd); }, { invalidate: [['admin', 'content'], ['content']], ok: 'Image updated.' });
  if (!q.data) return <Loading />;
  const sections = [...new Set(q.data.schema.map((f) => f.section))];
  const set = (k: string, v: any) => { setValues({ ...values, [k]: v }); setDirty(new Set([...dirty, k])); };
  const fields = q.data.schema.filter((f) => f.section === section);
  return (
    <>
      <Head title="Site Content" sub="Every headline, blurb and image on the public site. Changes go live when you publish.">
        <button className="btn btn-primary btn-sm" disabled={dirty.size === 0 || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Publishing…' : `Publish${dirty.size ? ` (${dirty.size})` : ''}`}</button>
      </Head>
      <div className="section-tabs chips">{sections.map((s) => <button key={s} className={`chip ${section === s ? 'active' : ''}`} onClick={() => setSection(s)}>{s}</button>)}</div>
      <div className="card card-pad stack" style={{ gap: 18 }}>
        {fields.map((f) => (
          <div key={f.key} className="field">
            <span className="label">{f.label}{dirty.has(f.key) && <span className="muted"> · unsaved</span>}</span>
            {f.type === 'text' && <Input value={values[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} />}
            {f.type === 'textarea' && <Textarea rows={3} value={values[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} />}
            {f.type === 'markdown' && <MarkdownEditor value={values[f.key] || ''} onChange={(v) => set(f.key, v)} rows={12} />}
            {f.type === 'image' && (
              <div className="img-drop">
                {values[f.key] ? <img src={thumbUrl(values[f.key])} alt="" /> : <div style={{ width: 120, height: 80, background: 'var(--bg-2)', borderRadius: 8 }} />}
                <label className="btn btn-secondary btn-sm">{img.isPending ? 'Uploading…' : 'Upload image'}<input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && img.mutate({ key: f.key, file: e.target.files[0] })} /></label>
                <span className="tiny muted">Uploads apply immediately.</span>
              </div>
            )}
            {f.type === 'list' && (
              <div className="list-editor">
                {(values[f.key] || []).map((item: any, i: number) => (
                  <div key={i} className="item">
                    <div className="fields">
                      {f.itemFields!.map((sub) => sub.type === 'icon'
                        ? <Select key={sub.key} value={item[sub.key] || ''} onChange={(e) => set(f.key, values[f.key].map((x: any, j: number) => (j === i ? { ...x, [sub.key]: e.target.value } : x)))}>{Object.keys(ICONS).map((ic) => <option key={ic} value={ic}>{ic}</option>)}</Select>
                        : <Input key={sub.key} placeholder={sub.label} value={item[sub.key] || ''} onChange={(e) => set(f.key, values[f.key].map((x: any, j: number) => (j === i ? { ...x, [sub.key]: e.target.value } : x)))} />)}
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Remove" onClick={() => set(f.key, values[f.key].filter((_: any, j: number) => j !== i))}><Trash2 size={15} /></button>
                  </div>
                ))}
                <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => set(f.key, [...(values[f.key] || []), Object.fromEntries(f.itemFields!.map((s) => [s.key, '']))])}><Plus size={14} /> Add item</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------- settings (admin only) ----------------
interface Settings { email: any; stripe: any; registration: any }

export function SettingsAdmin() {
  const q = useList<Settings>(['admin', 'settings'], '/admin/settings');
  const [s, setS] = useState<Settings | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  useEffect(() => { if (q.data) setS(q.data); }, [q.data]);
  const save = useAction((key: keyof Settings) => put(`/admin/settings/${key}`, s![key]), { invalidate: [['admin', 'settings'], ['content']], ok: 'Settings saved.' });
  const test = useAction(async () => { try { const r = await post<any>('/admin/settings/email/test', { to: testTo }); setTestResult('Sent! Check the inbox (or Mailpit).'); return r; } catch (e: any) { setTestResult(`Failed: ${e.message}`); throw e; } });
  if (!s) return <Loading />;
  const upd = (key: keyof Settings, k: string, v: any) => setS({ ...s, [key]: { ...s[key], [k]: v } });
  const e = s.email, st = s.stripe, r = s.registration;
  const providerHelp: Record<string, string> = {
    smtp: 'Works with Mailpit (dev), Google Workspace (smtp.gmail.com:587, an App Password) and Microsoft 365 (smtp.office365.com:587, SMTP AUTH enabled).',
    sendgrid: 'Create an API key with Mail Send permission at sendgrid.com.', postmark: 'Use a Server API token from postmarkapp.com.', resend: 'Use an API key from resend.com.', none: 'Emails are logged on the server and not sent.',
  };
  return (
    <>
      <Head title="Settings" sub="Email delivery, online payments and registration." />
      <div className="stack" style={{ gap: 20 }}>
        <form className="card card-pad stack" onSubmit={(ev: FormEvent) => { ev.preventDefault(); save.mutate('email'); }}>
          <h3>Outgoing email</h3>
          <div className="form-grid">
            <Field label="Provider"><Select value={e.provider} onChange={(x) => upd('email', 'provider', x.target.value)}><option value="smtp">SMTP (Mailpit / Google / Microsoft / any)</option><option value="sendgrid">SendGrid</option><option value="postmark">Postmark</option><option value="resend">Resend</option><option value="none">Disabled</option></Select></Field>
            <Field label="From address"><Input value={e.from} onChange={(x) => upd('email', 'from', x.target.value)} placeholder="TexRec <no-reply@texrec.com>" /></Field>
            <p className="small muted span-2" style={{ margin: 0 }}>{providerHelp[e.provider]}</p>
            {e.provider === 'smtp' && <>
              <Field label="SMTP host"><Input value={e.smtpHost} onChange={(x) => upd('email', 'smtpHost', x.target.value)} /></Field>
              <Field label="Port"><Input type="number" value={e.smtpPort} onChange={(x) => upd('email', 'smtpPort', Number(x.target.value))} /></Field>
              <Field label="Username"><Input autoComplete="off" value={e.smtpUser} onChange={(x) => upd('email', 'smtpUser', x.target.value)} /></Field>
              <Field label="Password / app password"><Input type="password" autoComplete="new-password" value={e.smtpPass} onChange={(x) => upd('email', 'smtpPass', x.target.value)} /></Field>
              <Check label="Use implicit TLS (port 465)" checked={!!e.smtpSecure} onChange={(x) => upd('email', 'smtpSecure', x.target.checked)} />
            </>}
            {['sendgrid', 'postmark', 'resend'].includes(e.provider) && <Field label="API key" className="span-2"><Input type="password" autoComplete="new-password" value={e.apiKey} onChange={(x) => upd('email', 'apiKey', x.target.value)} /></Field>}
          </div>
          <div className="form-actions">
            <Input type="email" placeholder="send a test to…" value={testTo} onChange={(x) => setTestTo(x.target.value)} style={{ maxWidth: 260 }} />
            <button type="button" className="btn btn-secondary" disabled={!testTo || test.isPending} onClick={() => test.mutate()}>Send test</button>
            <button className="btn btn-primary" disabled={save.isPending}>Save email settings</button>
          </div>
          {testResult && <div className={`alert ${testResult.startsWith('Sent') ? 'alert-ok' : 'alert-err'}`}>{testResult}</div>}
          <p className="tiny muted" style={{ margin: 0 }}>Save before sending a test. Secrets are stored encrypted; a saved secret shows as •••••••• and is kept unless you type a new one.</p>
        </form>

        <form className="card card-pad stack" onSubmit={(ev: FormEvent) => { ev.preventDefault(); save.mutate('stripe'); }}>
          <h3>Online payments (Stripe)</h3>
          <p className="small muted" style={{ margin: 0 }}>With payments on, students are sent to Stripe Checkout right after reserving a paid class. Add a webhook in your Stripe dashboard pointing at <code>{window.location.origin}/api/stripe/webhook</code> for the event <code>checkout.session.completed</code> and paste its signing secret below. Without Stripe, reservations are held and marked paid by staff.</p>
          <div className="form-grid">
            <Field label="Publishable key"><Input value={st.publishableKey} onChange={(x) => upd('stripe', 'publishableKey', x.target.value)} placeholder="pk_live_…" /></Field>
            <Field label="Secret key"><Input type="password" autoComplete="new-password" value={st.secretKey} onChange={(x) => upd('stripe', 'secretKey', x.target.value)} placeholder="sk_live_…" /></Field>
            <Field label="Webhook signing secret"><Input type="password" autoComplete="new-password" value={st.webhookSecret} onChange={(x) => upd('stripe', 'webhookSecret', x.target.value)} placeholder="whsec_…" /></Field>
            <Check label="Accept card payments at enrollment" checked={!!st.enabled} onChange={(x) => upd('stripe', 'enabled', x.target.checked)} />
          </div>
          <div className="form-actions"><button className="btn btn-primary" disabled={save.isPending}>Save payment settings</button></div>
        </form>

        <form className="card card-pad stack" onSubmit={(ev: FormEvent) => { ev.preventDefault(); save.mutate('registration'); }}>
          <h3>Registration</h3>
          <Check label="Allow visitors to create their own student account" checked={!!r.allowSelfRegister} onChange={(x) => upd('registration', 'allowSelfRegister', x.target.checked)} />
          <div className="form-actions"><button className="btn btn-primary" disabled={save.isPending}>Save</button></div>
        </form>
      </div>
    </>
  );
}
