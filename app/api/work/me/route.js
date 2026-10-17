import { endpoint, json, APIError } from '../../../../lib/api.js';
import { Employee, WorkSession } from '../../../../models/index.js';
import { id, month } from '../../../../lib/validation.js';
import { autoCloseStaleSessions, istDate, istMonth, nextMonthStart, sessionDurationAt, summarizeSessions } from '../../../../lib/work-hours.js';

export const dynamic = 'force-dynamic';

export const GET = endpoint(['employee'], async (request, user) => {
  const params = new URL(request.url).searchParams, selectedMonth = month.parse(params.get('month'));
  if (params.has('employeeId')) {
    const requested = id.parse(params.get('employeeId'));
    if (String(requested) !== String(user.employeeId)) throw new APIError(403, 'You can only access your own work hours.');
  }
  const employee = await Employee.findOne({ _id: user.employeeId, organizationId: user.organizationId, active: true }).select('joiningDate').lean();
  if (!employee) throw new APIError(403, 'Your employee account is inactive.');
  const now = new Date(), currentMonth = istMonth(now), firstAllowed = employee.joiningDate.slice(0, 7);
  if (selectedMonth < firstAllowed || selectedMonth > currentMonth) throw new APIError(400, 'Choose a month from your joining month through the current month.');
  await autoCloseStaleSessions(WorkSession, user.organizationId, user.employeeId, now);
  const today = istDate(now);
  const [sessions, currentSession, todaySessions] = await Promise.all([
    WorkSession.find({ organizationId: user.organizationId, employeeId: user.employeeId, date: { $gte: `${selectedMonth}-01`, $lt: nextMonthStart(selectedMonth) } }).sort({ checkInAt: 1 }).lean(),
    WorkSession.findOne({ organizationId: user.organizationId, employeeId: user.employeeId, status: 'open', checkOutAt: null }).lean(),
    WorkSession.find({ organizationId: user.organizationId, employeeId: user.employeeId, date: today }).sort({ checkInAt: 1 }).lean()
  ]);
  const todayTotalMinutes = todaySessions.reduce((sum, session) => sum + sessionDurationAt(session, now), 0);
  const days = summarizeSessions(sessions, now);
  const monthTotalMinutes = days.reduce((sum, day) => sum + day.totalMinutes, 0);
  return json({
    month: selectedMonth, today, serverNow: now.toISOString(), joiningDate: employee.joiningDate,
    currentStatus: currentSession ? { status: 'working', session: currentSession, runningDurationMinutes: sessionDurationAt(currentSession, now) } : { status: 'checked_out' },
    todaySessions, todayTotalMinutes, sessions, days, monthTotalMinutes,
    daysWorked: days.length
  });
});
