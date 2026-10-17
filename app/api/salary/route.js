import { NextResponse } from 'next/server.js';
import { endpoint, json, employeeFilter } from '../../../lib/api.js';
import { id, month } from '../../../lib/validation.js';
import { salaries } from '../../../lib/salary.js';
import { csvCell } from '../../../lib/calculations.js';
export const dynamic = 'force-dynamic';
export const GET = endpoint(['admin', 'employee'], async (r, u) => {
  const p = new URL(r.url).searchParams, selected = month.parse(p.get('month')), requested = p.get('employeeId'); if (requested) id.parse(requested);
  const data = await salaries(u.organizationId, selected, employeeFilter(u, requested).employeeId);
  if (p.get('format') !== 'csv') return json(data);
  const rows = [['Employee', 'Month', 'Present', 'Half', 'Absent', 'Leave', 'Payable days', 'Per day', 'Earned', 'Advances', 'Net salary'], ...data.rows.map(row => [row.name, selected, row.days.present, row.days.half, row.days.absent, row.days.leave, row.payableDays, row.perDayRate, row.earned, row.advances, row.netSalary])];
  return new NextResponse('\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="salary-${selected}.csv"`, 'Cache-Control': 'no-store, private' } });
});
