import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SESSION_HOURS, durationMinutes, formatDuration, formatTime, istDate, istInputToISO, sessionDurationAt, summarizeSessions, toISTDateTimeInput } from '../lib/work-hours.js';

test('work dates and times use India Standard Time while dates remain stored as UTC instants', () => {
  const instant = new Date('2026-10-01T18:31:00.000Z');
  assert.equal(istDate(instant), '2026-10-02');
  assert.equal(toISTDateTimeInput(instant), '2026-10-02T00:01');
  assert.equal(istInputToISO('2026-10-02T00:01'), instant.toISOString());
  assert.match(formatTime(instant), /12:01/);
});

test('session durations floor to whole minutes and display consistently', () => {
  assert.equal(durationMinutes('2026-10-01T04:00:00Z', '2026-10-01T10:45:59Z'), 405);
  assert.equal(formatDuration(405), '6h 45m');
  assert.equal(formatDuration(0), '0h 0m');
});

test('open sessions are capped at the configured auto-close limit in summaries', () => {
  const start = new Date('2026-10-01T00:00:00Z'), now = new Date(start.getTime() + (MAX_SESSION_HOURS + 2) * 3600000);
  const session = { date: '2026-10-01', checkInAt: start, checkOutAt: null, durationMinutes: 0, status: 'open' };
  assert.equal(sessionDurationAt(session, now), MAX_SESSION_HOURS * 60);
  assert.deepEqual(summarizeSessions([session], now), [{ date: '2026-10-01', totalMinutes: MAX_SESSION_HOURS * 60, sessions: 1, autoClosed: false }]);
});

test('day totals sum multiple sessions and preserve the auto-closed flag', () => {
  const day = '2026-10-01';
  const summaries = summarizeSessions([
    { date: day, checkInAt: '2026-10-01T01:00:00Z', checkOutAt: '2026-10-01T04:00:00Z', durationMinutes: 180, status: 'closed' },
    { date: day, checkInAt: '2026-10-01T05:00:00Z', checkOutAt: '2026-10-01T07:00:00Z', durationMinutes: 120, status: 'auto_closed' }
  ]);
  assert.deepEqual(summaries, [{ date: day, totalMinutes: 300, sessions: 2, autoClosed: true }]);
});
