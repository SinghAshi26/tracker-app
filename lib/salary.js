import { Employee, Attendance, Advance, Organization, SalaryPayment } from '../models/index.js';
import { monthRange } from './validation.js';
import { salaryBreakdown } from './calculations.js';
import { DEFAULT_SUNDAY_PAID } from './payroll-settings.js';
export async function salaries(organizationId, month, employeeId) {
  const range = monthRange(month);
  const scope = { organizationId, ...(employeeId ? { employeeId } : {}), date: range };
  const [employees, attendance, advances, organization, payments] = await Promise.all([
    Employee.find({ organizationId, ...(employeeId ? { _id: employeeId } : {}), joiningDate: { $lt: range.$lt } }).sort({ name: 1 }).lean(),
    Attendance.find(scope).lean(), Advance.find(scope).sort({ date: -1 }).lean(),
    Organization.findOne({ _id: organizationId }).select('sundayPaid').lean(),
    SalaryPayment.find({ organizationId, month, ...(employeeId ? { employeeId } : {}) }).lean()
  ]);
  const sundayPaid = organization?.sundayPaid ?? DEFAULT_SUNDAY_PAID;
  const eligible = row => employees.some(e => String(e._id) === String(row.employeeId) && row.date >= e.joiningDate);
  const scopedAttendance = attendance.filter(eligible).map(row => ({ ...row, rebate: row.rebate ?? false, rebateNote: row.rebateNote || '' }));
  const scopedAdvances = advances.filter(eligible);
  return { month, sundayPaid, rows: employees.map(e => ({
    ...salaryBreakdown(e, scopedAttendance.filter(a => String(a.employeeId) === String(e._id)), scopedAdvances.filter(a => String(a.employeeId) === String(e._id)), { month, sundayPaid }),
    payment: payments.find(p => String(p.employeeId) === String(e._id)) || { status: 'pending' }
  })), attendance: scopedAttendance, advances: scopedAdvances };
}
