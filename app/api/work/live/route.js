import { endpoint, json } from '../../../../lib/api.js';
import { Employee, WorkSession } from '../../../../models/index.js';
import { autoCloseStaleSessions, istDate, sessionDurationAt } from '../../../../lib/work-hours.js';

export const dynamic = 'force-dynamic';

export const GET = endpoint(['admin'], async (_request, user) => {
  const now = new Date(), today = istDate(now);
  await autoCloseStaleSessions(WorkSession, user.organizationId, undefined, now);
  const [employees, sessions] = await Promise.all([
    Employee.find({ organizationId: user.organizationId, active: true }).select('name employeeCode').sort({ name: 1 }).lean(),
    WorkSession.find({ organizationId: user.organizationId, $or: [{ date: today }, { status: 'open' }] }).sort({ checkInAt: 1 }).lean()
  ]);
  const rows = employees.map(employee => {
    const ownSessions = sessions.filter(session => String(session.employeeId) === String(employee._id));
    const openSession = ownSessions.find(session => session.status === 'open');
    const todaySessions = ownSessions.filter(session => session.date === today);
    const todayMinutes = todaySessions.reduce((sum, session) => sum + sessionDurationAt(session, now), 0);
    const lastClosed = todaySessions.filter(session => session.checkOutAt).sort((a, b) => new Date(b.checkOutAt) - new Date(a.checkOutAt))[0];
    return {
      _id: employee._id, name: employee.name, employeeCode: employee.employeeCode || '',
      status: openSession ? 'working' : lastClosed ? 'checked_out' : 'not_checked_in',
      currentSession: openSession || null,
      runningDurationMinutes: openSession ? sessionDurationAt(openSession, now) : 0,
      lastCheckOutAt: lastClosed?.checkOutAt || null, todayTotalMinutes: todayMinutes
    };
  });
  return json({ date: today, serverNow: now.toISOString(), working: rows.filter(row => row.status === 'working'), employees: rows });
});
