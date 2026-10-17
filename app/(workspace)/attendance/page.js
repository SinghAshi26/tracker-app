'use client';
import { useEffect, useRef, useState } from 'react';
import { CheckCheck, Save } from 'lucide-react';
import { api, send, today } from '@/lib/client';
import { attendanceDay, isSunday, ATTENDANCE_LEGEND } from '@/lib/attendance';
import { useLoad, PageTitle, Loading, ErrorBox, Empty, Avatar } from '@/components/ui';
const statuses = [['present', 'P', 'Present'], ['absent', 'A', 'Absent'], ['half', 'H', 'Half day'], ['leave', 'L', 'Leave']];
export default function Attendance() {
  const [date, setDate] = useState(today()), [marks, setMarks] = useState({}), [rebates, setRebates] = useState({}), [busy, setBusy] = useState(false), [saveError, setSaveError] = useState(''), [saved, setSaved] = useState(false), [dirty, setDirty] = useState(false);
  const dateRef = useRef(date); dateRef.current = date;
  const { data, loading, error } = useLoad(async () => {
    const selected = date;
    const [e, a] = await Promise.all([api('/api/employees'), api(`/api/attendance?date=${selected}`)]);
    return { employees: e.employees.filter(e => e.active), attendance: a.attendance, date: selected };
  }, [date]);
  useEffect(() => {
    if (data?.date === dateRef.current) {
      setMarks(Object.fromEntries(data.attendance.map(a => [a.employeeId, attendanceDay(data.date, a).status])));
      setRebates(Object.fromEntries(data.attendance.map(a => [a.employeeId, attendanceDay(data.date, a)])));
      setDirty(false);
    }
  }, [data]);
  useEffect(() => { const warn = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  function mark(id, status) {
    setMarks(v => ({ ...v, [id]: status }));
    if (!['absent', 'leave'].includes(status)) setRebates(v => ({ ...v, [id]: { rebate: false, rebateNote: '' } }));
    setDirty(true); setSaved(false);
  }
  function rebate(id, update) { setRebates(v => ({ ...v, [id]: { ...v[id], ...update } })); setDirty(true); setSaved(false); }
  async function save() {
    setBusy(true); setSaveError(''); setSaved(false);
    try {
      const records = data.employees.filter(e => e.joiningDate <= date && marks[e._id]).map(e => ({ employeeId: e._id, status: marks[e._id], rebate: rebates[e._id]?.rebate || false, rebateNote: rebates[e._id]?.rebateNote || '' }));
      await send('/api/attendance', 'PUT', { date, records }); setSaved(true); setDirty(false);
    } catch (e) { setSaveError(e.message); } finally { setBusy(false); }
  }
  const ready = data?.date === date && !loading && !error, sunday = isSunday(date);
  const eligible = data?.employees.filter(e => e.joiningDate <= date) || [];
  return <><PageTitle eyebrow="ONE TAP, ALL SET" title="Attendance" subtitle="A simple daily ritual for a better-run team."><label><span className="sr-only">Attendance date</span><input type="date" value={date} disabled={busy} onChange={e => { if (e.target.value && (!dirty || window.confirm('Discard unsaved attendance changes?'))) { setDate(e.target.value); setDirty(false); setSaved(false); setSaveError(''); } }} /></label></PageTitle>
    <ErrorBox message={error || saveError} /><section className="panel"><div className="panel-title flex-wrap"><div><h2>Daily roll call</h2><p>{eligible.length} team members · Tap a status, then save</p></div><button className="btn-secondary" disabled={!ready || busy || !eligible.length} onClick={() => { setMarks(Object.fromEntries(eligible.map(e => [e._id, 'present']))); setRebates({}); setDirty(true); setSaved(false); }}><CheckCheck size={18} />Mark all present</button></div>
    <div className="flex flex-wrap gap-x-5 gap-y-2 px-5 py-4 bg-slate-50/60 text-xs text-muted">{ATTENDANCE_LEGEND.map(([status, label]) => <span key={status} className="flex items-center gap-2"><i className={`legend-dot ${status}`} />{label}</span>)}</div>
    {loading ? <Loading /> : ready && (data.employees.length ? <div className="divide-y divide-slate-100">{data.employees.map(e => {
      const joined = e.joiningDate <= date;
      const status = joined ? marks[e._id] || (sunday ? 'weekly_off' : 'unmarked') : 'not_joined';
      const label = status === 'not_joined' ? 'Not joined' : ATTENDANCE_LEGEND.find(s => s[0] === status)?.[1] || 'Not marked yet';
      return <div key={e._id}><div className="attendance-row"><div className="flex gap-3 items-center min-w-0"><Avatar name={e.name} /><div className="min-w-0"><h3 className="truncate">{e.name}</h3><p className="text-xs text-muted mt-1">{status === 'weekly_off' ? <span className="status status-weekly_off">{label}</span> : label}{rebates[e._id]?.rebate && joined && <span className="status status-rebate ml-2">Rebate</span>}</p></div></div><div className="attendance-buttons">{statuses.map(([value, letter, name]) => <button key={value} disabled={busy || !joined || (sunday && value !== 'present')} aria-label={`${e.name}: ${name}`} aria-pressed={status === value} className={`attendance-button ${status === value ? value : ''}`} onClick={() => mark(e._id, value)}>{letter}</button>)}{sunday && <button disabled={busy || !joined} aria-label={`${e.name}: Weekly off (Sunday)`} aria-pressed={status === 'weekly_off'} className={`attendance-button ${status === 'weekly_off' ? 'weekly_off' : ''}`} onClick={() => mark(e._id, 'weekly_off')}>W</button>}</div></div>
      {joined && !sunday && ['absent', 'leave'].includes(status) && <div className="px-5 pb-4 space-y-2"><label className="flex items-center gap-2 text-sm min-h-[44px]"><input type="checkbox" disabled={busy} checked={rebates[e._id]?.rebate || false} onChange={event => rebate(e._id, { rebate: event.target.checked, ...(event.target.checked ? {} : { rebateNote: '' }) })} />Give rebate</label>{rebates[e._id]?.rebate && <input aria-label={`Rebate note for ${e.name}`} maxLength={500} placeholder="Rebate note (optional)" disabled={busy} value={rebates[e._id]?.rebateNote || ''} onChange={event => rebate(e._id, { rebateNote: event.target.value })} />}</div>}</div>;
    })}</div> : <Empty title="No employees for this date" text="Add active employees whose joining date is on or before this day." />)}
    <div className="panel-actions"><p className={`text-sm ${saved ? 'text-brand' : 'text-muted'}`} role="status">{saved ? 'Attendance saved successfully.' : dirty ? 'You have unsaved changes.' : 'Your daily record, all in one place.'}</p><button className="btn" disabled={!ready || busy || !dirty || !eligible.some(e => marks[e._id])} onClick={save}><Save size={18} />{busy ? 'Saving…' : 'Save attendance'}</button></div></section></>;
}
