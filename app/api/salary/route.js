import { NextResponse } from 'next/server.js';
import { endpoint, json, employeeFilter, APIError } from '../../../lib/api.js';
import { id, month } from '../../../lib/validation.js';
import { salaries } from '../../../lib/salary.js';
import { csvCell } from '../../../lib/calculations.js';
import { Employee } from '../../../models/index.js';
import { payrollMonthNow } from '../../../lib/payroll-settings.js';
export const dynamic = 'force-dynamic';
export const GET = endpoint(['admin', 'employee'], async (r, u) => {
  const p = new URL(r.url).searchParams, selected = month.parse(p.get('month')), requested = p.get('employeeId'); if (requested) id.parse(requested);
  const employeeId = employeeFilter(u, requested).employeeId;
  if (u.role === 'employee') {
    const employee = await Employee.findOne({ organizationId: u.organizationId, _id: employeeId }).select('joiningDate').lean();
    if (!employee || selected < employee.joiningDate.slice(0, 7) || selected > payrollMonthNow()) throw new APIError(400, 'Choose a month from your joining month through the current month');
  }
  const data = await salaries(u.organizationId, selected, employeeId);
  if (p.get('format') !== 'csv') return json(data);
  const rows = [['Employee', 'Month', 'Present', 'Half', 'Absent', 'Leave', 'Paid Sundays', 'Rebate days', 'Rebate amount', 'Payable days', 'Per day', 'Gross salary', 'Advances', 'Net salary', 'Payment status'], ...data.rows.map(row => [row.name, selected, row.days.present, row.days.half, row.days.absent, row.days.leave, row.sundayPaidDays, row.rebateDays, row.rebateAmount, row.payableDays, row.perDayRate, row.grossSalary, row.advances, row.netSalary, row.payment.status])];
  return new NextResponse('\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="salary-${selected}.csv"`, 'Cache-Control': 'no-store, private' } });
});
