'use client';
import { useEffect, useRef, useState } from 'react';
import { CheckCheck, Save } from 'lucide-react';
import { api, send, today } from '@/lib/client';
import { useLoad, PageTitle, Loading, ErrorBox, Empty, Avatar } from '@/components/ui';
const statuses = [['present', 'P', 'Present'], ['absent', 'A', 'Absent'], ['half', 'H', 'Half day'], ['leave', 'L', 'Leave']];
export default function Attendance() {
  const [date, setDate] = useState(today()), [marks, setMarks] = useState({}), [busy, setBusy] = useState(false), [saveError, setSaveError] = useState(''), [saved, setSaved] = useState(false), [dirty, setDirty] = useState(false);
  const dateRef = useRef(date); dateRef.current = date;
  const { data, loading, error } = useLoad(async () => {
    const selected = date;
    const [e, a] = await Promise.all([api('/api/employees'), api(`/api/attendance?date=${selected}`)]);
    return { employees: e.employees.filter(e => e.active && e.joiningDate <= selected), attendance: a.attendance, date: selected };
  }, [date]);
  useEffect(() => { if (data?.date === dateRef.current) { setMarks(Object.fromEntries(data.attendance.map(a => [a.employeeId, a.status]))); setDirty(false); } }, [data]);
  useEffect(() => { const warn = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  function mark(id, status) { setMarks(v => ({ ...v, [id]: status })); setDirty(true); setSaved(false); }
  async function save() {
    setBusy(true); setSaveError(''); setSaved(false);
    try { const records = data.employees.filter(e => marks[e._id]).map(e => ({ employeeId: e._id, status: marks[e._id] })); await send('/api/attendance', 'PUT', { date, records }); setSaved(true); setDirty(false); }
    catch (e) { setSaveError(e.message); } finally { setBusy(false); }
  }
  const ready = data?.date === date && !loading && !error;
  return <><PageTitle eyebrow="ONE TAP, ALL SET" title="Attendance" subtitle="A simple daily ritual for a better-run team."><label><span className="sr-only">Attendance date</span><input type="date" value={date} disabled={busy} onChange={e => { if (e.target.value && (!dirty || window.confirm('Discard unsaved attendance changes?'))) { setDate(e.target.value); setDirty(false); setSaved(false); setSaveError(''); } }} /></label></PageTitle><ErrorBox message={error || saveError} /><section className="panel"><div className="panel-title flex-wrap"><div><h2>Daily roll call</h2><p>{data?.employees.length || 0} team members · Tap a status, then save</p></div><button className="btn-secondary" disabled={!ready || busy || !data?.employees.length} onClick={() => { setMarks(Object.fromEntries(data.employees.map(e => [e._id, 'present']))); setDirty(true); setSaved(false); }}><CheckCheck size={18} />Mark all present</button></div><div className="flex flex-wrap gap-x-5 gap-y-2 px-5 py-4 bg-slate-50/60 text-xs text-muted">{statuses.map(([status, letter, label]) => <span key={status} className="flex items-center gap-2"><i className={`legend-dot ${status}`} />{letter} — {label}</span>)}</div>{loading ? <Loading /> : ready && (data.employees.length ? <div className="divide-y divide-slate-100">{data.employees.map(e => <div className="attendance-row" key={e._id}><div className="flex gap-3 items-center min-w-0"><Avatar name={e.name} /><div className="min-w-0"><h3 className="truncate">{e.name}</h3><p className="text-xs text-muted mt-1">{marks[e._id] ? statuses.find(s => s[0] === marks[e._id])[2] : 'Not marked yet'}</p></div></div><div className="attendance-buttons">{statuses.map(([status, letter, label]) => <button key={status} disabled={busy} aria-label={`${e.name}: ${label}`} aria-pressed={marks[e._id] === status} className={`attendance-button ${marks[e._id] === status ? status : ''}`} onClick={() => mark(e._id, status)}>{letter}</button>)}</div></div>)}</div> : <Empty title="No employees for this date" text="Add active employees whose joining date is on or before this day." />)}<div className="panel-actions"><p className={`text-sm ${saved ? 'text-brand' : 'text-muted'}`} role="status">{saved ? 'Attendance saved successfully.' : dirty ? 'You have unsaved changes.' : 'Your daily record, all in one place.'}</p><button className="btn" disabled={!ready || busy || !dirty || !data?.employees.some(e => marks[e._id])} onClick={save}><Save size={18} />{busy ? 'Saving…' : 'Save attendance'}</button></div></section></>;
}
