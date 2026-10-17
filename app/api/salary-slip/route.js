import { NextResponse } from 'next/server.js';
import { endpoint, employeeFilter, APIError } from '../../../lib/api.js';
import { id, month } from '../../../lib/validation.js';
import { Employee, Organization, SalaryPayment } from '../../../models/index.js';
import { ensureEmployeeCode } from '../../../lib/employee-code.js';
import { createSalarySlip } from '../../../lib/salary-slip.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = endpoint(['admin', 'employee'], async (request, user) => {
  const params = new URL(request.url).searchParams;
  const employeeId = id.parse(params.get('employeeId')), selected = month.parse(params.get('month'));
  employeeFilter(user, employeeId);
  const payment = await SalaryPayment.findOne({ organizationId: user.organizationId, employeeId, month: selected, status: 'credited' }).lean();
  if (!payment?.snapshot) throw new APIError(404, 'Salary slip not available yet');
  const [employee, organization] = await Promise.all([
    Employee.findOne({ _id: employeeId, organizationId: user.organizationId }).lean(),
    Organization.findOne({ _id: user.organizationId }).lean()
  ]);
  if (employee && !employee.employeeCode) await ensureEmployeeCode(employee);
  const pdf = await createSalarySlip(payment, { employee, organization });
  const code = (payment.snapshot.employeeCode || employee?.employeeCode || 'Employee').replace(/[^A-Za-z0-9_-]/g, '');
  return new NextResponse(pdf, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="Salary-Slip_${code}_${selected}.pdf"`, 'Cache-Control': 'no-store, private' } });
});
