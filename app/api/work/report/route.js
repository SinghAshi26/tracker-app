import { endpoint, json } from '../../../../lib/api.js';
import { APIError } from '../../../../lib/api.js';
import { date, id, month } from '../../../../lib/validation.js';
import { Employee, WorkSession } from '../../../../models/index.js';
import { autoCloseStaleSessions, formatDuration, nextMonthStart, sessionDurationAt, summarizeSessions } from '../../../../lib/work-hours.js';

export const dynamic = 'force-dynamic';

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s\t]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export const GET = endpoint(['admin'], async (request, user) => {
  const params = new URL(request.url).searchParams;
  const employeeParam = params.get('employeeId'), selectedDate = params.get('date'), selectedMonth = params.get('month');
  if (Boolean(selectedDate) === Boolean(selectedMonth)) throw new APIError(400, 'Choose a date or month for the work report.');
  const employeeId = employeeParam ? id.parse(employeeParam) : undefined;
  if (selectedDate && employeeId) throw new APIError(400, 'Employee filter is available with a monthly report.');
  const selected = selectedDate ? date.parse(selectedDate) : month.parse(selectedMonth);
  const now = new Date();
  await autoCloseStaleSessions(WorkSession, user.organizationId, employeeId, now);
  const scope = {
    organizationId: user.organizationId,
    ...(employeeId ? { employeeId } : {}),
    ...(selectedDate ? { date: selected } : { date: { $gte: `${selected}-01`, $lt: nextMonthStart(selected) } })
  };
  const [sessions, employees] = await Promise.all([
    WorkSession.find(scope).sort({ employeeId: 1, checkInAt: 1 }).lean(),
    Employee.find({ organizationId: user.organizationId, ...(employeeId ? { _id: employeeId } : {}) }).select('name employeeCode phone active joiningDate').sort({ name: 1 }).lean()
  ]);
  if (employeeId && !employees.length) throw new APIError(404, 'Employee not found in this organization.');
  const employeeRows = employees.map(employee => {
    const own = sessions.filter(session => String(session.employeeId) === String(employee._id));
    const days = summarizeSessions(own, now);
    const openSession = own.find(session => session.status === 'open');
    const first = own[0];
    const lastCheckout = own.filter(session => session.checkOutAt).sort((a, b) => new Date(b.checkOutAt) - new Date(a.checkOutAt))[0];
    const totalMinutes = days.reduce((sum, day) => sum + day.totalMinutes, 0);
    return {
      _id: employee._id, name: employee.name, employeeCode: employee.employeeCode || '', phone: employee.phone || '',
      active: employee.active, joiningDate: employee.joiningDate, status: selectedDate ? openSession ? 'working' : lastCheckout ? 'checked_out' : 'not_checked_in' : undefined,
      firstCheckInAt: first?.checkInAt || null, lastCheckOutAt: lastCheckout?.checkOutAt || null,
      todayTotalMinutes: selectedDate ? totalMinutes : undefined, totalMinutes, days,
      sessions: own.map(session => ({ ...session, liveDurationMinutes: sessionDurationAt(session, now) }))
    };
  });
  if (params.get('format') === 'csv') {
    if (selectedDate) throw new APIError(400, 'CSV export is available for monthly reports.');
    const rows = [['Employee ID', 'Employee', 'Date (IST)', 'Check-in (IST)', 'Check-out (IST)', 'Status', 'Duration']];
    for (const employee of employeeRows) for (const session of employee.sessions) rows.push([
      employee.employeeCode, employee.name, session.date, session.checkInAt ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }).format(new Date(session.checkInAt)) : '',
      session.checkOutAt ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }).format(new Date(session.checkOutAt)) : '',
      session.status, formatDuration(sessionDurationAt(session, now))
    ]);
    return new Response(rows.map(row => row.map(csvCell).join(',')).join('\r\n'), { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="work-hours_${selected}.csv"`, 'Cache-Control': 'no-store, private' } });
  }
  const byDay = summarizeSessions(sessions, now);
  return json({ ...(selectedDate ? { date: selected } : { month: selected }), serverNow: now.toISOString(), employees: employeeRows, days: byDay, totalMinutes: byDay.reduce((sum, day) => sum + day.totalMinutes, 0) });
});
