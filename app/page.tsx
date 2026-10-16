'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type Role = 'owner' | 'editor' | 'reviewer';
type ContentType = 'page' | 'blog' | 'product' | 'service';
type RequestRow = { id: string; submitted_by: string; payload: Record<string, unknown>; status: 'pending' | 'approved' | 'rejected'; created_at: string; review_note?: string | null };
type Profile = { role: Role; display_name?: string | null };
const types: { value: ContentType; label: string }[] = [
  { value: 'page', label: 'Website page / section' }, { value: 'blog', label: 'Blog or news article' },
  { value: 'product', label: 'Product' }, { value: 'service', label: 'Service' },
];

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [tab, setTab] = useState<'new' | 'pending' | 'history'>('new');
  const [email, setEmail] = useState('');
  const [kind, setKind] = useState<ContentType>('page');
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [summary, setSummary] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [price, setPrice] = useState('');
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const configured = Boolean(supabase);

  const visibleRequests = useMemo(() => requests.filter(r => tab === 'pending' ? r.status === 'pending' : tab === 'history' ? r.status !== 'pending' : true), [requests, tab]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (!data.session) setLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) { setProfile(null); setRequests([]); setLoading(false); }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session && supabase) void loadWorkspace(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [session?.user.id]);

  async function loadWorkspace() {
    if (!supabase || !session) return;
    setLoading(true); setMessage('');
    const [p, r] = await Promise.all([
      supabase.from('profiles').select('role,display_name').eq('id', session.user.id).single(),
      supabase.from('change_requests').select('*').order('created_at', { ascending: false }).limit(100),
    ]);
    if (p.error) { setMessage('Your account profile is not configured. Ask the project owner to add your user to the profiles table.'); setIsError(true); }
    else setProfile(p.data as Profile);
    if (r.error) { setMessage('Could not load requests. Confirm you ran supabase/schema.sql and configured access policies.'); setIsError(true); }
    else setRequests((r.data ?? []) as RequestRow[]);
    setLoading(false);
  }

  async function signIn(e: FormEvent) {
    e.preventDefault(); if (!supabase) return;
    setBusy(true); setMessage(''); setIsError(false);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined } });
    setBusy(false);
    if (error) { setMessage(error.message); setIsError(true); } else setMessage('Check your email for a secure sign-in link.');
  }
  async function signOut() { if (supabase) await supabase.auth.signOut(); }

  async function submitRequest(e: FormEvent) {
    e.preventDefault(); if (!supabase || !session) return;
    setBusy(true); setMessage(''); setIsError(false);
    const payload: Record<string, unknown> = { type: kind, title: title.trim(), slug: slug.trim(), summary: summary.trim(), body: body.trim(), image_url: imageUrl.trim(), ...((kind === 'product' || kind === 'service') ? { price: price.trim() } : {}) };
    const { error } = await supabase.from('change_requests').insert({ submitted_by: session.user.id, payload, status: 'pending' });
    setBusy(false);
    if (error) { setMessage(error.message); setIsError(true); return; }
    setTitle(''); setSlug(''); setSummary(''); setBody(''); setImageUrl(''); setPrice('');
    setMessage('Submitted for owner approval. The live website has not changed.');
    await loadWorkspace(); setTab('pending');
  }

  async function reviewRequest(id: string, decision: 'approve' | 'reject') {
    if (!supabase || profile?.role !== 'owner') return;
    setBusy(true); setMessage(''); setIsError(false);
    const { error } = await supabase.rpc('review_change_request', { request_id: id, decision, note: reviewNote[id] ?? '' });
    setBusy(false);
    if (error) { setMessage(error.message); setIsError(true); }
    else { setMessage(decision === 'approve' ? 'Approved and added to the published content database.' : 'Request rejected.'); await loadWorkspace(); }
  }

  if (!configured) return <main className="shell"><div className="card"><h1>Content Studio</h1><p className="muted">Connect your Supabase project to get started.</p><div className="notice error">Missing environment variables. Copy <code>.env.example</code> to <code>.env.local</code> and add your Supabase project URL and publishable/anon key.</div></div></main>;
  if (!session) return <main className="shell"><div className="card" style={{ maxWidth: 480, margin: '8vh auto' }}><div className="brand"><div className="logo">CS</div><div><h2 style={{ margin: 0 }}>Content Studio</h2><span className="muted small">Employee website management</span></div></div><h1 style={{ marginTop: 28 }}>Sign in</h1><p className="muted">Use your company email. We’ll send you a secure sign-in link.</p>{message && <div className={`notice ${isError ? 'error' : ''}`}>{message}</div>}<form onSubmit={signIn}><label htmlFor="email">Work email</label><input id="email" className="field" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"/><button className="button" style={{ width: '100%', marginTop: 16 }} disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}</button></form><p className="muted small" style={{ marginTop: 20 }}>Account access is controlled by your Supabase project and database permissions.</p></div></main>;

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const approvedCount = requests.filter(r => r.status === 'approved').length;
  const rejectedCount = requests.filter(r => r.status === 'rejected').length;
  return <main className="shell">
    <header className="topbar"><div className="brand"><div className="logo">CS</div><div><h2 style={{ margin: 0 }}>Content Studio</h2><span className="muted small">Website content & approvals</span></div></div><div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><span className="pill">{profile?.role ?? 'loading role'}</span><span className="muted small">{session.user.email}</span><button className="button secondary" onClick={signOut}>Sign out</button></div></header>
    <h1>Good to see you.</h1><p className="muted">Propose website changes without touching code. Every submission waits for owner approval.</p>{message && <div className={`notice ${isError ? 'error' : ''}`}>{message}</div>}
    <div className="stats"><div className="stat"><span className="muted small">Awaiting review</span><strong>{pendingCount}</strong></div><div className="stat"><span className="muted small">Approved</span><strong>{approvedCount}</strong></div><div className="stat"><span className="muted small">Rejected</span><strong>{rejectedCount}</strong></div></div>
    <div className="tabs"><button className={`tab ${tab === 'new' ? 'active' : ''}`} onClick={() => setTab('new')}>＋ New change</button><button className={`tab ${tab === 'pending' ? 'active' : ''}`} onClick={() => setTab('pending')}>Pending ({pendingCount})</button><button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>Review history</button></div>
    {tab === 'new' ? <div className="grid"><section className="card"><h2>Propose a content change</h2><p className="muted small">This creates a review request. It does not change the public website by itself.</p><form onSubmit={submitRequest}>
      <label htmlFor="kind">Content type</label><select id="kind" className="field" value={kind} onChange={e => setKind(e.target.value as ContentType)}>{types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
      <label htmlFor="title">Title / name</label><input id="title" className="field" required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. About us or Summer offer"/>
      <label htmlFor="slug">URL slug (optional)</label><input id="slug" className="field" value={slug} onChange={e => setSlug(e.target.value)} placeholder="about-us"/>
      <label htmlFor="summary">Short description</label><textarea id="summary" className="field" rows={2} value={summary} onChange={e => setSummary(e.target.value)} placeholder="Short introduction or summary"/>
      <label htmlFor="body">Main text / details</label><textarea id="body" className="field" rows={5} value={body} onChange={e => setBody(e.target.value)} placeholder="Write the content you want to propose…"/>
      <label htmlFor="image">Image or banner URL (optional)</label><input id="image" className="field" type="url" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://…"/>
      {(kind === 'product' || kind === 'service') && <><label htmlFor="price">Price (optional)</label><input id="price" className="field" value={price} onChange={e => setPrice(e.target.value)} placeholder="e.g. 19.99 USD"/></>}
      <button className="button" style={{ marginTop: 18, width: '100%' }} disabled={busy}>{busy ? 'Submitting…' : 'Submit for owner approval'}</button>
    </form></section><aside className="card"><h2>How approval works</h2><div className="stack" style={{ marginTop: 18 }}><div className="item"><span className="pill">01 · Draft</span><p style={{ margin: '10px 0 0' }}>An employee writes the content and submits it.</p></div><div className="item"><span className="pill">02 · Review</span><p style={{ margin: '10px 0 0' }}>The owner checks the proposed change.</p></div><div className="item"><span className="pill">03 · Publish</span><p style={{ margin: '10px 0 0' }}>Only the owner can approve it into the published content table.</p></div></div><div className="notice" style={{ marginTop: 18 }}>This starter uses a form-based editor. Drag-and-drop page sections and live visual previews are a next step.</div></aside></div> : <section className="card"><h2>{tab === 'pending' ? 'Waiting for owner approval' : 'Review history'}</h2><p className="muted small">Requests are ordered newest first.</p>{loading ? <p className="muted">Loading…</p> : visibleRequests.length === 0 ? <div className="empty">No requests in this view yet.</div> : <div className="stack">{visibleRequests.map(r => <article className="item" key={r.id}><div className="itemhead"><div><span className="pill">{String(r.payload.type ?? 'content')}</span><h3 style={{ margin: '10px 0 5px' }}>{String(r.payload.title ?? 'Untitled')}</h3><span className="muted small">{new Date(r.created_at).toLocaleString()} · submitter ID {r.submitted_by.slice(0, 8)}…</span></div><span className="pill">{r.status}</span></div>{r.payload.summary ? <p style={{ marginTop: 12 }}>{String(r.payload.summary)}</p> : null}{r.payload.body ? <p>{String(r.payload.body)}</p> : null}{r.payload.image_url ? <p className="muted small">Media URL: {String(r.payload.image_url)}</p> : null}{r.payload.price ? <p><strong>Price:</strong> {String(r.payload.price)}</p> : null}{profile?.role === 'owner' && r.status === 'pending' && <><label htmlFor={`note-${r.id}`}>Review note (optional)</label><textarea id={`note-${r.id}`} className="field" rows={2} value={reviewNote[r.id] ?? ''} onChange={e => setReviewNote(old => ({ ...old, [r.id]: e.target.value }))} placeholder="Feedback for the employee…"/><div className="actions"><button className="button" disabled={busy} onClick={() => reviewRequest(r.id, 'approve')}>Approve & publish</button><button className="button danger" disabled={busy} onClick={() => reviewRequest(r.id, 'reject')}>Reject</button></div></>}</article>)}</div>}</section>}
    <p className="muted small" style={{ marginTop: 24 }}>Starter template. Read README.md and complete its setup and production checklist before inviting your team.</p>
  </main>;
}
