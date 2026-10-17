import { endpoint, json } from '../../../lib/api.js';
import { date, monthRange } from '../../../lib/validation.js';
import { Employee, Attendance, Expense } from '../../../models/index.js';
import { cents, amount } from '../../../lib/calculations.js';
import { attendanceDay } from '../../../lib/attendance.js';
export const dynamic = 'force-dynamic';
export const GET = endpoint(['admin'], async (r, u) => {
  const selected = date.parse(new URL(r.url).searchParams.get('date'));
  const scope = { organizationId: u.organizationId };
  const [employees, records, expenses] = await Promise.all([
    Employee.find({ ...scope, active: true, joiningDate: { $lte: selected } }).select('name').sort({ name: 1 }).lean(),
    Attendance.find({ ...scope, date: selected }).lean(),
    Expense.find({ ...scope, date: monthRange(selected.slice(0, 7)) }).sort({ date: -1, createdAt: -1 }).lean()
  ]);
  const summary = { present: 0, absent: 0, half: 0, leave: 0, unmarked: 0, weekly_off: 0 };
  const team = employees.map(e => { const { status } = attendanceDay(selected, records.find(a => String(a.employeeId) === String(e._id))); summary[status]++; return { ...e, status }; });
  return json({ summary, employees: team, totalEmployees: employees.length, monthExpenses: amount(expenses.reduce((sum, e) => sum + cents(e.amount), 0)), recentExpenses: expenses.slice(0, 5) });
});
