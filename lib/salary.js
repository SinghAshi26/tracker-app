import { Employee, Attendance, Advance } from '../models/index.js';
import { monthRange } from './validation.js';
import { salaryBreakdown } from './calculations.js';
export async function salaries(organizationId, month, employeeId) {
  const range = monthRange(month);
  const scope = { organizationId, ...(employeeId ? { employeeId } : {}), date: range };
  const [employees, attendance, advances] = await Promise.all([
    Employee.find({ organizationId, ...(employeeId ? { _id: employeeId } : {}), joiningDate: { $lt: range.$lt } }).sort({ name: 1 }).lean(),
    Attendance.find(scope).lean(), Advance.find(scope).sort({ date: -1 }).lean()
  ]);
  return { rows: employees.map(e => salaryBreakdown(e, attendance.filter(a => String(a.employeeId) === String(e._id)), advances.filter(a => String(a.employeeId) === String(e._id)))), attendance, advances };
}
