'use client';
import { useEffect, useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, Clock3, Download, LogIn, LogOut, Pencil, Users } from 'lucide-react';
import { api, send } from '@/lib/client';
import { useSession } from '@/components/shell';
import { useLoad, PageTitle, Loading, ErrorBox, Empty, Field, Modal, MonthPicker, Avatar } from '@/components/ui';
import { formatDuration, formatTime, istDate, istInputToISO, istMonth, toISTDateTimeInput } from '@/lib/work-hours';

function durationClock(startAt, nowAt) {
  const seconds = Math.max(0, Math.floor((nowAt - new Date(startAt).getTime()) / 1000));
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function WorkHours() {
  const { user } = useSession();
  return user.role === 'admin' ? <AdminWorkHours /> : <EmployeeWorkHours />;
}

function EmployeeWorkHours() {
  const { user } = useSession();
  const minMonth = user.joiningDate?.slice(0, 7) || istMonth(), maxMonth = istMonth();
  const [month, setMonth] = useState(istMonth), [busy, setBusy] = useState(false), [toast, setToast] = useState(null), [tick, setTick] = useState(Date.now()), [clockOffset, setClockOffset] = useState(0);
  const { data, loading, error, reload } = useLoad(() => api(`/api/work/me?month=${month}`), [month]);
  useEffect(() => { const id = setInterval(() => setTick(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { const id = setInterval(reload, 30000); return () => clearInterval(id); }, [reload]);
  useEffect(() => { if (data?.serverNow) setClockOffset(Date.parse(data.serverNow) - Date.now()); }, [data?.serverNow]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 3500); return () => clearTimeout(id); }, [toast]);
  const working = data?.currentStatus.status === 'working' ? data.currentStatus.session : null;
  const liveNow = tick + clockOffset;
  const runningSeconds = working ? Math.max(0, Math.floor((liveNow - new Date(working.checkInAt).getTime()) / 1000)) : 0;
  const runningMinutes = Math.floor(runningSeconds / 60);
  const todayMinutes = (data?.todayTotalMinutes || 0) + runningMinutes - (data?.currentStatus.runningDurationMinutes || 0);
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const dayMap = Object.fromEntries((data?.days || []).map(day => [day.date, day]));

  async function act(action) {
    setBusy(true);
    try {
      await send(`/api/work/${action}`, 'POST', {});
      setToast({ error: false, message: action === 'check-in' ? 'You are checked in.' : 'You are checked out.' });
      await reload();
    } catch (e) { setToast({ error: true, message: e.message }); }
    finally { setBusy(false); }
  }

  function changeMonth(offset) {
    const [year, number] = month.split('-').map(Number);
    const nextDate = new Date(Date.UTC(year, number - 1 + offset, 1));
    const next = `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, '0')}`;
    if (next >= minMonth && next <= maxMonth) setMonth(next);
  }

  return <>
    <PageTitle eyebrow="YOUR WORKDAY" title="Work hours" subtitle="Check in and out to keep track of your work time.">
      <button className="icon-button" aria-label="Previous month" disabled={month <= minMonth} onClick={() => changeMonth(-1)}><ChevronLeft size={18} /></button>
      <MonthPicker value={month} onChange={setMonth} min={minMonth} max={maxMonth} />
      <button className="icon-button" aria-label="Next month" disabled={month >= maxMonth} onClick={() => changeMonth(1)}><ChevronRight size={18} /></button>
    </PageTitle>
    <ErrorBox message={error} />
    {loading && !data ? <Loading /> : data && <>
      <section className="panel mb-6"><div className="panel-title"><div><h2>Today · {data.today}</h2><p>{working ? `Checked in at ${formatTime(working.checkInAt)}` : 'Separate from attendance and salary tracking.'}</p></div><Clock3 size={20} className="text-muted" /></div>
        <div className="p-5 pt-2"><button className="btn w-full text-lg min-h-[58px]" disabled={busy} onClick={() => act(working ? 'check-out' : 'check-in')}>{working ? <><LogOut size={20} />{busy ? 'Checking out…' : 'Check out'} <span className="font-mono ml-1">{durationClock(working.checkInAt, liveNow)}</span></> : <><LogIn size={20} />{busy ? 'Checking in…' : 'Check in'}</>}</button>
          {toast && <div className={`mt-3 ${toast.error ? 'error-box' : 'info-box'}`} role={toast.error ? 'alert' : 'status'}>{toast.message}</div>}
        </div>
        <div className="grid grid-cols-2 gap-3 px-5 pb-5"><div className="stat-card"><span className="text-sm font-medium">Hours today</span><strong>{formatDuration(todayMinutes)}</strong><p className="text-xs text-muted">Across all sessions</p></div><div className="stat-card"><span className="text-sm font-medium">Sessions today</span><strong>{data.todaySessions.length}</strong><p className="text-xs text-muted">Check-in / check-out pairs</p></div></div>
        <div className="border-t divide-y divide-slate-100">{data.todaySessions.length ? data.todaySessions.map(session => <div className="list-row" key={session._id}><div className="flex-1"><p className="text-sm font-medium">{formatTime(session.checkInAt)} <span className="text-muted">→</span> {session.checkOutAt ? formatTime(session.checkOutAt) : 'Working now'}</p><p className="text-xs text-muted mt-1">{formatDuration(session.status === 'open' ? data.currentStatus.runningDurationMinutes : session.durationMinutes)}{session.status === 'auto_closed' && <span className="status status-unmarked ml-2">Auto-closed</span>}</p></div><Clock3 size={17} className={session.status === 'open' ? 'text-brand' : 'text-muted'} /></div>) : <p className="p-5 text-sm text-muted">No check-in sessions yet today.</p>}</div>
      </section>
      <section className="panel"><div className="panel-title"><div><h2>Monthly hours</h2><p>{formatDuration(data.monthTotalMinutes)} total · {data.daysWorked} days worked</p></div><CalendarClock size={20} className="text-muted" /></div>
        <div className="divide-y divide-slate-100">{Array.from({ length: daysInMonth }, (_, index) => {
          const day = `${month}-${String(index + 1).padStart(2, '0')}`, summary = dayMap[day];
          return <div className="list-row" key={day}><span className="w-24 text-sm font-medium">{new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', weekday: 'short' }).format(new Date(`${day}T12:00:00Z`))}</span><div className="flex-1 text-sm text-muted">{summary ? formatDuration(summary.totalMinutes) : '–'}{summary?.autoClosed && <span className="status status-unmarked ml-2">Auto-closed</span>}</div><span className="text-xs text-muted">{summary?.sessions ? `${summary.sessions} ${summary.sessions === 1 ? 'session' : 'sessions'}` : ''}</span></div>;
        })}</div>
      </section>
    </>}
  </>;
}

function AdminWorkHours() {
  const [date, setDate] = useState(istDate), [month, setMonth] = useState(istMonth), [selectedEmployeeId, setSelectedEmployeeId] = useState(''), [editing, setEditing] = useState(null), [editIn, setEditIn] = useState(''), [editOut, setEditOut] = useState(''), [editNote, setEditNote] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const { data: dayData, loading, error, reload: reloadDay } = useLoad(() => api(`/api/work/report?date=${date}`), [date]);
  const { data: monthData, error: monthError, reload: reloadMonth } = useLoad(() => selectedEmployeeId ? api(`/api/work/report?month=${month}&employeeId=${selectedEmployeeId}`) : Promise.resolve(null), [selectedEmployeeId, month]);
  const selectedToday = dayData?.employees.find(employee => employee._id === selectedEmployeeId);
  const selectedMonth = monthData?.employees[0];
  const monthDays = new Map((selectedMonth?.days || []).map(day => [day.date, day]));
  const dayCount = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();

  function editSession(session) {
    setEditing(session); setEditIn(toISTDateTimeInput(session.checkInAt));
    setEditOut(toISTDateTimeInput(session.checkOutAt || new Date())); setEditNote(session.editNote || ''); setMessage('');
  }

  async function saveCorrection(event) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      await send(`/api/work/sessions/${editing._id}`, 'PATCH', { checkInAt: istInputToISO(editIn), checkOutAt: istInputToISO(editOut), editNote });
      setEditing(null); setMessage('Session correction saved.'); await Promise.all([reloadDay(), reloadMonth()]);
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }

  return <>
    <PageTitle eyebrow="TEAM TIME" title="Work hours" subtitle="Review check-ins, daily totals, and monthly hours.">
      <label><span className="sr-only">Report date</span><input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
    </PageTitle>
    <ErrorBox message={error || monthError || message} />
    {message && !error && !monthError && <div role="status" className="info-box mb-4">{message}</div>}
    <section className="panel mb-6"><div className="panel-title"><div><h2>Team status</h2><p>{dayData?.employees.filter(employee => employee.status === 'working').length || 0} working now</p></div><Users size={20} className="text-muted" /></div>
      {loading ? <Loading /> : dayData?.employees.length ? <div className="divide-y divide-slate-100">{dayData.employees.map(employee => <button type="button" className="list-row w-full text-left" key={employee._id} onClick={() => setSelectedEmployeeId(employee._id)} aria-pressed={selectedEmployeeId === employee._id}>
        <Avatar name={employee.name} /><div className="flex-1 min-w-0"><h3 className="truncate">{employee.name}</h3><p className="text-xs text-muted mt-1">{employee.firstCheckInAt ? `First in ${formatTime(employee.firstCheckInAt)}` : 'Not checked in today'}{employee.lastCheckOutAt ? ` · Last out ${formatTime(employee.lastCheckOutAt)}` : ''}</p></div>
        <div className="text-right"><p className="text-sm font-semibold">{formatDuration(employee.status === 'working' ? employee.todayTotalMinutes : employee.todayTotalMinutes)}</p><p className={`text-xs ${employee.status === 'working' ? 'text-brand' : 'text-muted'}`}>{employee.status === 'working' ? `● Working · ${formatDuration(employee.runningDurationMinutes)} session` : employee.status === 'checked_out' ? 'Checked out' : 'No session'}</p></div>
      </button>)}</div> : <Empty title="No employees to show" text="Active employees appear after their joining date." />}
    </section>

    {selectedToday && <section className="panel mb-6"><div className="panel-title"><div><h2>{selectedToday.name} · {date}</h2><p>Sessions for this day</p></div><span className="status status-present">{formatDuration(selectedToday.totalMinutes)}</span></div>
      {selectedToday.sessions.length ? <div className="divide-y divide-slate-100">{selectedToday.sessions.map(session => <div className="list-row" key={session._id}><div className="flex-1 min-w-0"><p className="text-sm font-medium">{formatTime(session.checkInAt)} → {session.checkOutAt ? formatTime(session.checkOutAt) : 'Working now'}</p><p className="text-xs text-muted mt-1">{formatDuration(session.status === 'open' ? session.liveDurationMinutes : session.durationMinutes)}{session.status === 'auto_closed' ? ' · Auto-closed (forgot to check out)' : ''}{session.editNote ? ` · ${session.editNote}` : ''}</p></div>{['open', 'auto_closed'].includes(session.status) && <button className="btn-secondary" onClick={() => editSession(session)}><Pencil size={16} />Fix session</button>}</div>)}</div> : <p className="p-5 text-sm text-muted">No sessions recorded for this date.</p>}
      <div className="filter-row"><MonthPicker value={month} min={selectedToday.joiningDate?.slice(0, 7)} max={istMonth()} onChange={setMonth} /><a className="btn-secondary ml-auto" href={`/api/work/report?month=${month}&format=csv`}><Download size={17} />Export CSV</a></div>
      {monthError ? <ErrorBox message={monthError} /> : monthData && <div className="border-t"><div className="panel-title"><div><h2>{selectedMonth?.name} · Monthly hours</h2><p>{formatDuration(selectedMonth?.totalMinutes || 0)} total</p></div></div><div className="divide-y divide-slate-100">{Array.from({ length: dayCount }, (_, index) => { const day = `${month}-${String(index + 1).padStart(2, '0')}`, summary = monthDays.get(day); return <div className="list-row" key={day}><span className="w-24 text-sm font-medium">{day}</span><span className="flex-1 text-sm text-muted">{summary ? formatDuration(summary.totalMinutes) : '–'}</span>{summary?.autoClosed && <span className="status status-unmarked">Auto-closed</span>}</div>; })}</div></div>}
    </section>}
    {editing && <Modal title="Fix session" onClose={() => { if (!busy) setEditing(null); }}><form onSubmit={saveCorrection} className="space-y-4"><p className="text-sm text-muted">Edit the recorded times in India Standard Time. Add a note explaining the correction.</p><Field label="Check-in (IST)"><input type="datetime-local" required value={editIn} onChange={event => setEditIn(event.target.value)} /></Field><Field label="Check-out (IST)"><input type="datetime-local" required value={editOut} onChange={event => setEditOut(event.target.value)} /></Field><Field label="Correction note"><textarea required minLength={1} maxLength={500} value={editNote} onChange={event => setEditNote(event.target.value)} placeholder="Forgot to check out; confirmed time with employee" /></Field><button disabled={busy} className="btn w-full">{busy ? 'Saving…' : 'Save correction'}</button></form></Modal>}
  </>;
}
