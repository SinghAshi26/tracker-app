import { endpoint, body, json, APIError, employeeFilter } from '../../../lib/api.js';
import { attendanceSchema, date, monthRange, id } from '../../../lib/validation.js';
import { Employee, Attendance } from '../../../models/index.js';
export const dynamic = 'force-dynamic';
export const GET = endpoint(['admin', 'employee'], async (r, u) => {
  const p = new URL(r.url).searchParams;
  const requested = p.get('employeeId'); if (requested) id.parse(requested);
  const filter = { organizationId: u.organizationId, ...employeeFilter(u, requested), date: p.has('date') ? date.parse(p.get('date')) : monthRange(p.get('month')) };
  return json({ attendance: await Attendance.find(filter).sort({ date: 1 }).lean() });
});
export const PUT = endpoint(['admin'], async (r, u) => {
  const data = await body(r, attendanceSchema);
  const employees = await Employee.find({ _id: { $in: data.records.map(v => v.employeeId) }, organizationId: u.organizationId, active: true, joiningDate: { $lte: data.date } }).select('_id').lean();
  if (employees.length !== data.records.length) throw new APIError(400, 'Employees must be active, in your organization, and joined by this date');
  await Attendance.bulkWrite(data.records.map(row => ({ updateOne: {
    filter: { organizationId: u.organizationId, employeeId: row.employeeId, date: data.date },
    update: { $set: { status: row.status }, $setOnInsert: { organizationId: u.organizationId, employeeId: row.employeeId, date: data.date } }, upsert: true
  } })));
  return json({ ok: true });
});
