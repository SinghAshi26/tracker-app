'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowUpRight, LoaderCircle, X } from 'lucide-react';

export function useLoad(loader, dependencies = []) {
  const loaderRef = useRef(loader); loaderRef.current = loader;
  const sequence = useRef(0);
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const reload = useCallback(async () => {
    const run = ++sequence.current;
    setLoading(true); setError('');
    try { const value = await loaderRef.current(); if (run === sequence.current) setData(value); }
    catch (e) { if (run === sequence.current) setError(e.message); }
    finally { if (run === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => { reload(); return () => { sequence.current++; }; }, [reload, ...dependencies]);
  return { data, loading, error, reload };
}
export function PageTitle({ eyebrow, title, subtitle, children }) { return <div className="page-title"><div><p className="eyebrow">{eyebrow || 'YOUR WORKSPACE'}</p><h1>{title}</h1>{subtitle && <p className="text-muted mt-2">{subtitle}</p>}</div><div className="flex flex-wrap gap-2">{children}</div></div>; }
export function ErrorBox({ message }) { return message ? <div role="alert" className="error-box"><AlertCircle size={18} className="shrink-0" />{message}</div> : null; }
export function Loading() { return <div className="flex items-center justify-center gap-3 py-16 text-muted" role="status"><LoaderCircle className="animate-spin" size={22} /> Loading your workspace…</div>; }
export function Empty({ title, text }) { return <div className="py-12 px-4 text-center"><div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-brand"><ArrowUpRight /></div><h3>{title}</h3><p className="mt-2 text-sm text-muted">{text}</p></div>; }
export function Field({ label, children, hint }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function Modal({ title, children, onClose }) {
  const ref = useRef(null);
  useEffect(() => { const el = ref.current; el.showModal(); return () => el.close(); }, []);
  return <dialog ref={ref} onCancel={onClose} className="modal"><div className="flex items-center justify-between gap-4 mb-5"><h2>{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></div>{children}</dialog>;
}
export function Stat({ label, value, note, icon: Icon, accent = false }) { return <div className={`stat-card ${accent ? 'stat-accent' : ''}`}><div className="flex justify-between items-start gap-2"><span className="text-sm font-medium">{label}</span>{Icon && <Icon size={20} />}</div><strong>{value}</strong><p className="text-xs opacity-75">{note}</p></div>; }
export function Status({ status }) { return <span className={`status status-${status}`}>{status === 'half' ? 'Half day' : status === 'weekly_off' ? 'Weekly off (Sunday)' : status[0].toUpperCase() + status.slice(1)}</span>; }
export function Avatar({ name }) { return <span className="avatar">{name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}</span>; }
export function MonthPicker({ value, onChange, min, max, disabled = false }) { return <label className="flex items-center gap-2 text-sm font-medium"><span className="sr-only">Select month</span><input aria-label="Select month" className="!w-auto" type="month" required value={value} min={min} max={max} disabled={disabled} onChange={e => { const next = e.target.value; if (next && (!min || next >= min) && (!max || next <= max)) onChange(next); }} /></label>; }
