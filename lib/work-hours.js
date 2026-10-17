export const MAX_SESSION_HOURS = 14;
export const WORK_ACTION_INTERVAL_MS = 5000;
export const IST_TIME_ZONE = 'Asia/Kolkata';

export function istDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(value);
  const part = type => parts.find(item => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function istMonth(value = new Date()) { return istDate(value).slice(0, 7); }

export function nextMonthStart(month) {
  const [year, number] = month.split('-').map(Number);
  return `${number === 12 ? year + 1 : year}-${String(number === 12 ? 1 : number + 1).padStart(2, '0')}-01`;
}

export function durationMinutes(start, end) {
  return Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

export function formatDuration(minutes = 0) {
  const value = Math.max(0, Math.floor(Number(minutes) || 0));
  return `${Math.floor(value / 60)}h ${value % 60}m`;
}

export function formatTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true
  }).format(new Date(value));
}

export function toISTDateTimeInput(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(value));
  const part = type => parts.find(item => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

export function istInputToISO(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Enter a valid IST date and time');
  const [, y, m, d, h, min] = match.map(Number);
  return new Date(Date.UTC(y, m - 1, d, h, min) - (5 * 60 + 30) * 60000).toISOString();
}

export function sessionDurationAt(session, now = new Date()) {
  if (session.status !== 'open') return Number(session.durationMinutes) || 0;
  const end = Math.min(new Date(now).getTime(), new Date(session.checkInAt).getTime() + MAX_SESSION_HOURS * 3600000);
  return durationMinutes(session.checkInAt, end);
}

export async function autoCloseStaleSessions(WorkSession, organizationId, employeeId, now = new Date()) {
  const cutoff = new Date(now.getTime() - MAX_SESSION_HOURS * 3600000);
  const filter = { organizationId, status: 'open', checkOutAt: null, checkInAt: { $lte: cutoff }, ...(employeeId ? { employeeId } : {}) };
  const stale = await WorkSession.find(filter).select('_id checkInAt').lean();
  if (!stale.length) return 0;
  const operations = stale.map(session => ({ updateOne: {
    filter: { _id: session._id, organizationId, status: 'open', checkOutAt: null },
    update: { $set: {
      checkOutAt: new Date(new Date(session.checkInAt).getTime() + MAX_SESSION_HOURS * 3600000),
      durationMinutes: MAX_SESSION_HOURS * 60, status: 'auto_closed'
    } }
  } }));
  const result = await WorkSession.bulkWrite(operations, { ordered: false });
  return result.modifiedCount;
}

export function summarizeSessions(sessions, now = new Date()) {
  const days = {};
  for (const session of sessions) {
    const duration = sessionDurationAt(session, now);
    const day = days[session.date] || { date: session.date, totalMinutes: 0, sessions: 0, autoClosed: false };
    day.totalMinutes += duration;
    day.sessions++;
    day.autoClosed ||= session.status === 'auto_closed';
    days[session.date] = day;
  }
  return Object.values(days).sort((a, b) => a.date.localeCompare(b.date));
}
