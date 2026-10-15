import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { post, put, del, upload } from '@/lib/api';
import type { Agency, Course, DiveSite, Post, PostCategory } from '@/lib/types';
import { CATEGORY_LABEL, LEVEL_LABEL, POST_CATEGORY_LABEL } from '@/lib/types';
import { Check, Confirm, Field, ImagePicker, Input, Loading, Modal, Select, Tag, Textarea, Img } from '@/components/ui';
import { fmtDate, fromLocalInput, money, toLocalInput } from '@/lib/format';
import { useList, useAction, useFormState, imageForm, MarkdownEditor, Head } from './shared';

// ---------------- courses ----------------
const blankCourse = { name: '', agencyId: '', category: 'recreational', level: 'beginner', price: '', duration: '', summary: '', description: '', prerequisites: '', outcomes: '', faq: [] as { q: string; a: string }[], featured: false, active: true, sort: '100' };

function CourseForm({ init, onDone }: { init?: Course; onDone: () => void }) {
  const agencies = useList<Agency[]>(['agencies'], '/agencies');
  const f = useFormState(init ? { ...blankCourse, name: init.name, agencyId: String(init.agencyId || ''), category: init.category, level: init.level, price: String(init.priceCents / 100), duration: init.duration, summary: init.summary, description: init.description, prerequisites: init.prerequisites, outcomes: init.outcomes, faq: init.faq, featured: init.featured, active: init.active, sort: String(init.sort) } : { ...blankCourse });
  const [imageKey, setImageKey] = useState(init?.imageKey);
  const save = useAction((v: typeof f.v) => { const body = { ...v, agencyId: v.agencyId ? Number(v.agencyId) : null, priceCents: Math.round(Number(v.price || 0) * 100), sort: Number(v.sort) }; return init ? put(`/admin/courses/${init.id}`, body) : post<Course>('/admin/courses', body); }, { invalidate: [['admin', 'courses'], ['courses'], ['course']], ok: 'Course saved.', onSuccess: onDone });
  const img = useAction((file: File) => upload<{ imageKey: string }>(`/admin/courses/${init!.id}/image`, imageForm(file)), { invalidate: [['admin', 'courses'], ['courses']], ok: 'Image updated.', onSuccess: (r) => setImageKey(r.imageKey) });
  const faq = f.v.faq;
  const setFaq = (i: number, k: 'q' | 'a', val: string) => f.set('faq', faq.map((x, j) => (j === i ? { ...x, [k]: val } : x)));
  return (
    <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(f.v); }}>
      <div className="form-grid">
        <Field label="Course name" className="span-2"><Input required {...f.bind('name')} /></Field>
        <Field label="Agency"><Select {...f.bind('agencyId')}><option value="">—</option>{(agencies.data || []).map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</Select></Field>
        <Field label="Category"><Select {...f.bind('category')}>{Object.entries(CATEGORY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Level"><Select {...f.bind('level')}>{Object.entries(LEVEL_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Price ($)"><Input type="number" min={0} step="0.01" inputMode="decimal" {...f.bind('price')} /></Field>
        <Field label="Duration"><Input placeholder="2–4 days" {...f.bind('duration')} /></Field>
        <Field label="Sort order" hint="Lower shows first"><Input type="number" {...f.bind('sort')} /></Field>
        <Field label="Short summary (list card)" className="span-2"><Textarea rows={2} maxLength={400} {...f.bind('summary')} /></Field>
        <div className="span-2"><div className="label" style={{ marginBottom: 6 }}>Overview</div><MarkdownEditor value={f.v.description} onChange={(v) => f.set('description', v)} rows={8} /></div>
        <div className="span-2"><div className="label" style={{ marginBottom: 6 }}>Prerequisites</div><MarkdownEditor value={f.v.prerequisites} onChange={(v) => f.set('prerequisites', v)} rows={4} /></div>
        <div className="span-2"><div className="label" style={{ marginBottom: 6 }}>What you'll learn</div><MarkdownEditor value={f.v.outcomes} onChange={(v) => f.set('outcomes', v)} rows={4} /></div>
        <div className="span-2 list-editor">
          <div className="row-between"><span className="label">FAQ</span><button type="button" className="btn btn-secondary btn-sm" onClick={() => f.set('faq', [...faq, { q: '', a: '' }])}><Plus size={14} /> Question</button></div>
          {faq.map((x, i) => (
            <div key={i} className="item"><div className="fields" style={{ gridTemplateColumns: '1fr' }}><Input placeholder="Question" value={x.q} onChange={(e) => setFaq(i, 'q', e.target.value)} /><Textarea rows={2} placeholder="Answer" value={x.a} onChange={(e) => setFaq(i, 'a', e.target.value)} /></div><button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Remove" onClick={() => f.set('faq', faq.filter((_, j) => j !== i))}><Trash2 size={15} /></button></div>
          ))}
        </div>
        {init && <div className="span-2"><div className="label" style={{ marginBottom: 6 }}>Course image</div><ImagePicker imageKey={imageKey} onFile={(file) => img.mutate(file)} busy={img.isPending} /></div>}
        {!init && <p className="small muted span-2">Save the course first, then add its image.</p>}
        <Check label="Featured on the home page" {...f.bindCheck('featured')} />
        <Check label="Active (shown on the site)" {...f.bindCheck('active')} />
      </div>
      <div className="form-actions"><button type="button" className="btn btn-secondary" onClick={onDone}>Cancel</button><button className="btn btn-primary" disabled={save.isPending}>Save</button></div>
    </form>
  );
}

export function Courses() {
  const q = useList<Course[]>(['admin', 'courses'], '/admin/courses');
  const [edit, setEdit] = useState<Course | 'new' | null>(null);
  const [confirm, setConfirm] = useState<Course | null>(null);
  const rm = useAction((c: Course) => del(`/admin/courses/${c.id}`), { invalidate: [['admin', 'courses'], ['courses']], ok: 'Course deleted.', onSuccess: () => setConfirm(null) });
  return (
    <>
      <Head title="Courses" sub="The class catalog shown on the Training page."><button className="btn btn-primary btn-sm" onClick={() => setEdit('new')}><Plus size={16} /> Add course</button></Head>
      {q.isLoading && <Loading />}
      <div className="table-wrap"><table className="table">
        <thead><tr><th /><th>Course</th><th>Agency</th><th>Level</th><th>Price</th><th>Status</th><th /></tr></thead>
        <tbody>
          {(q.data || []).map((c) => (
            <tr key={c.id}>
              <td style={{ width: 70 }}><Img imageKey={c.imageKey} thumb className="img-cover" style={{ width: 56, aspectRatio: '1', borderRadius: 8 } as any} /></td>
              <td><b>{c.name}</b>{c.featured && <> <Tag tone="cyan">Featured</Tag></>}<br /><span className="tiny muted">/training/{c.slug}</span></td>
              <td>{c.agency}</td><td className="small">{LEVEL_LABEL[c.level]} · {CATEGORY_LABEL[c.category]}</td><td>{money(c.priceCents)}</td>
              <td>{c.active ? <Tag tone="ok">Active</Tag> : <Tag>Hidden</Tag>}</td>
              <td className="actions"><button className="btn btn-secondary btn-sm" onClick={() => setEdit(c)}>Edit</button> <button className="btn btn-ghost btn-sm btn-icon" aria-label="Delete" onClick={() => setConfirm(c)}><Trash2 size={15} /></button></td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {edit && <Modal title={edit === 'new' ? 'Add course' : `Edit ${edit.name}`} onClose={() => setEdit(null)} wide><CourseForm init={edit === 'new' ? undefined : edit} onDone={() => setEdit(null)} /></Modal>}
      {confirm && <Confirm title="Delete course?" text={`Delete ${confirm.name}? Events linked to it keep their details but lose the course link.`} onYes={() => rm.mutate(confirm)} onNo={() => setConfirm(null)} />}
    </>
  );
}

// ---------------- dive sites ----------------
const blankSite = { name: '', location: '', description: '', difficulty: 'all', lat: '', lng: '', active: true, sort: '100' };

function SiteForm({ init, onDone }: { init?: DiveSite; onDone: () => void }) {
  const f = useFormState(init ? { ...blankSite, name: init.name, location: init.location, description: init.description, difficulty: init.difficulty, lat: String(init.lat ?? ''), lng: String(init.lng ?? ''), active: init.active, sort: String(init.sort) } : { ...blankSite });
  const [imageKey, setImageKey] = useState(init?.imageKey);
  const save = useAction((v: typeof f.v) => { const body = { ...v, lat: v.lat === '' ? null : Number(v.lat), lng: v.lng === '' ? null : Number(v.lng), sort: Number(v.sort) }; return init ? put(`/admin/dive-sites/${init.id}`, body) : post('/admin/dive-sites', body); }, { invalidate: [['admin', 'sites'], ['sites']], ok: 'Dive site saved.', onSuccess: onDone });
  const img = useAction((file: File) => upload<{ imageKey: string }>(`/admin/dive-sites/${init!.id}/image`, imageForm(file)), { invalidate: [['admin', 'sites']], ok: 'Image updated.', onSuccess: (r) => setImageKey(r.imageKey) });
  return (
    <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(f.v); }}>
      <div className="form-grid">
        <Field label="Name"><Input required {...f.bind('name')} /></Field>
        <Field label="Location"><Input placeholder="Granbury, TX" {...f.bind('location')} /></Field>
        <Field label="Difficulty"><Select {...f.bind('difficulty')}>{['all', 'beginner', 'intermediate', 'advanced', 'technical'].map((d) => <option key={d} value={d}>{d}</option>)}</Select></Field>
        <Field label="Sort order"><Input type="number" {...f.bind('sort')} /></Field>
        <Field label="Latitude"><Input type="number" step="any" {...f.bind('lat')} /></Field>
        <Field label="Longitude"><Input type="number" step="any" {...f.bind('lng')} /></Field>
        <div className="span-2"><div className="label" style={{ marginBottom: 6 }}>Description</div><MarkdownEditor value={f.v.description} onChange={(v) => f.set('description', v)} rows={5} /></div>
        {init && <div className="span-2"><ImagePicker imageKey={imageKey} onFile={(file) => img.mutate(file)} busy={img.isPending} /></div>}
        <Check label="Active" {...f.bindCheck('active')} />
      </div>
      <div className="form-actions"><button type="button" className="btn btn-secondary" onClick={onDone}>Cancel</button><button className="btn btn-primary" disabled={save.isPending}>Save</button></div>
    </form>
  );
}

export function DiveSites() {
  const q = useList<DiveSite[]>(['admin', 'sites'], '/admin/dive-sites');
  const [edit, setEdit] = useState<DiveSite | 'new' | null>(null);
  const [confirm, setConfirm] = useState<DiveSite | null>(null);
  const rm = useAction((s: DiveSite) => del(`/admin/dive-sites/${s.id}`), { invalidate: [['admin', 'sites']], ok: 'Deleted.', onSuccess: () => setConfirm(null) });
  return (
    <>
      <Head title="Dive Sites" sub="Locations you train and dive at. Attach them to events."><button className="btn btn-primary btn-sm" onClick={() => setEdit('new')}><Plus size={16} /> Add site</button></Head>
      {q.isLoading && <Loading />}
      <div className="grid grid-3">
        {(q.data || []).map((s) => (
          <div key={s.id} className="card">
            <Img imageKey={s.imageKey} thumb />
            <div className="card-pad">
              <div className="row-between"><h3>{s.name}</h3><Tag tone="cyan">{s.difficulty}</Tag></div>
              <div className="small muted">{s.location}</div>
              <div className="row" style={{ marginTop: 10 }}><button className="btn btn-secondary btn-sm" onClick={() => setEdit(s)}>Edit</button><button className="btn btn-ghost btn-sm" onClick={() => setConfirm(s)}>Delete</button>{!s.active && <Tag>Hidden</Tag>}</div>
            </div>
          </div>
        ))}
      </div>
      {edit && <Modal title={edit === 'new' ? 'Add dive site' : `Edit ${edit.name}`} onClose={() => setEdit(null)} wide><SiteForm init={edit === 'new' ? undefined : edit} onDone={() => setEdit(null)} /></Modal>}
      {confirm && <Confirm title="Delete dive site?" text={confirm.name} onYes={() => rm.mutate(confirm)} onNo={() => setConfirm(null)} />}
    </>
  );
}

// ---------------- blog posts ----------------
const blankPost = { title: '', category: 'news' as PostCategory, excerpt: '', body: '', publishedAt: '' };

function PostForm({ init, onDone }: { init?: Post; onDone: () => void }) {
  const f = useFormState(init ? { title: init.title, category: init.category, excerpt: init.excerpt, body: init.body || '', publishedAt: toLocalInput(init.publishedAt) } : { ...blankPost });
  const [coverKey, setCoverKey] = useState(init?.coverKey);
  const save = useAction((v: typeof f.v) => { const body = { ...v, publishedAt: v.publishedAt ? fromLocalInput(v.publishedAt) : null }; return init ? put(`/admin/posts/${init.id}`, body) : post('/admin/posts', body); }, { invalidate: [['admin', 'posts'], ['posts'], ['post']], ok: 'Post saved.', onSuccess: onDone });
  const cover = useAction((file: File) => upload<{ coverKey: string }>(`/admin/posts/${init!.id}/cover`, imageForm(file)), { invalidate: [['admin', 'posts'], ['posts']], ok: 'Cover updated.', onSuccess: (r) => setCoverKey(r.coverKey) });
  return (
    <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(f.v); }}>
      <div className="form-grid">
        <Field label="Title" className="span-2"><Input required {...f.bind('title')} /></Field>
        <Field label="Category"><Select {...f.bind('category')}>{Object.entries(POST_CATEGORY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Publish date" hint="Leave blank to keep as a draft."><Input type="datetime-local" {...f.bind('publishedAt')} /></Field>
        <Field label="Excerpt (shown on the list)" className="span-2"><Textarea rows={2} maxLength={500} {...f.bind('excerpt')} /></Field>
        <div className="span-2"><div className="label" style={{ marginBottom: 6 }}>Body</div><MarkdownEditor value={f.v.body} onChange={(v) => f.set('body', v)} rows={16} /></div>
        {init ? <div className="span-2"><div className="label" style={{ marginBottom: 6 }}>Cover image</div><ImagePicker imageKey={coverKey} onFile={(file) => cover.mutate(file)} busy={cover.isPending} /></div> : <p className="small muted span-2">Save the post first, then add a cover image.</p>}
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onDone}>Cancel</button>
        {!f.v.publishedAt && <button type="button" className="btn btn-secondary" onClick={() => { f.set('publishedAt', toLocalInput(new Date().toISOString())); setTimeout(() => save.mutate({ ...f.v, publishedAt: toLocalInput(new Date().toISOString()) }), 0); }}>Publish now</button>}
        <button className="btn btn-primary" disabled={save.isPending}>Save</button>
      </div>
    </form>
  );
}

export function Posts() {
  const q = useList<Post[]>(['admin', 'posts'], '/admin/posts');
  const [edit, setEdit] = useState<Post | 'new' | null>(null);
  const [confirm, setConfirm] = useState<Post | null>(null);
  const rm = useAction((p: Post) => del(`/admin/posts/${p.id}`), { invalidate: [['admin', 'posts'], ['posts']], ok: 'Post deleted.', onSuccess: () => setConfirm(null) });
  return (
    <>
      <Head title="Blog / Newsletter" sub="News, training tips, trip reports and more."><button className="btn btn-primary btn-sm" onClick={() => setEdit('new')}><Plus size={16} /> New post</button></Head>
      {q.isLoading && <Loading />}
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Title</th><th>Category</th><th>Status</th><th>Author</th><th /></tr></thead>
        <tbody>
          {(q.data || []).map((p) => (
            <tr key={p.id}>
              <td><b>{p.title}</b><br /><span className="tiny muted">{p.excerpt.slice(0, 80)}</span></td>
              <td><Tag tone="blue">{POST_CATEGORY_LABEL[p.category]}</Tag></td>
              <td>{p.publishedAt && new Date(p.publishedAt) <= new Date() ? <Tag tone="ok">Published {fmtDate(p.publishedAt)}</Tag> : p.publishedAt ? <Tag tone="cyan">Scheduled {fmtDate(p.publishedAt)}</Tag> : <Tag tone="warn">Draft</Tag>}</td>
              <td className="small">{p.author ? `${p.author.firstName} ${p.author.lastName}` : '—'}</td>
              <td className="actions"><Link to={`/blog/${p.slug}`} className="btn btn-ghost btn-sm">View</Link> <button className="btn btn-secondary btn-sm" onClick={() => setEdit(p)}>Edit</button> <button className="btn btn-ghost btn-sm btn-icon" aria-label="Delete" onClick={() => setConfirm(p)}><Trash2 size={15} /></button></td>
            </tr>
          ))}
          {!q.isLoading && q.data?.length === 0 && <tr><td colSpan={5} className="center muted">No posts yet.</td></tr>}
        </tbody>
      </table></div>
      {edit && <Modal title={edit === 'new' ? 'New post' : 'Edit post'} onClose={() => setEdit(null)} wide><PostForm init={edit === 'new' ? undefined : edit} onDone={() => setEdit(null)} /></Modal>}
      {confirm && <Confirm title="Delete post?" text={confirm.title} onYes={() => rm.mutate(confirm)} onNo={() => setConfirm(null)} />}
    </>
  );
}
