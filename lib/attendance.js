export const ATTENDANCE_LEGEND = [
  ['present', 'Present'], ['absent', 'Absent'], ['half', 'Half day'],
  ['leave', 'Leave'], ['weekly_off', 'Weekly off (Sunday)'], ['rebate', 'Rebate']
];
export const isSunday = date => new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
export function attendanceDay(date, record, joiningDate) {
  if (joiningDate && date < joiningDate) return { status: 'not_joined', rebate: false, rebateNote: '' };
  // Legacy Sunday absences/leaves remain in storage, but are never deducted.
  const status = isSunday(date) && record?.status !== 'present' ? 'weekly_off' : record?.status || 'unmarked';
  const rebate = ['leave', 'absent'].includes(status) && record?.rebate === true;
  return { status, rebate, rebateNote: rebate ? record.rebateNote || '' : '' };
}
export function datesInMonth(month) {
  const [year, m] = month.split('-').map(Number);
  const count = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}
