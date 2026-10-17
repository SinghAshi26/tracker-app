import { NextResponse } from 'next/server.js';
import { endpoint, employeeFilter, APIError } from '../../../lib/api.js';
import { id, month } from '../../../lib/validation.js';
import { SalaryPayment } from '../../../models/index.js';
import { createSalarySlip } from '../../../lib/salary-slip.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = endpoint(['admin', 'employee'], async (request, user) => {
  const params = new URL(request.url).searchParams;
  const employeeId = id.parse(params.get('employeeId')), selected = month.parse(params.get('month'));
  employeeFilter(user, employeeId);
  const payment = await SalaryPayment.findOne({ organizationId: user.organizationId, employeeId, month: selected, status: 'credited' }).lean();
  if (!payment?.snapshot) throw new APIError(404, 'Salary slip not available yet');
  const pdf = await createSalarySlip(payment);
  return new NextResponse(pdf, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="salary-slip-${selected}-${employeeId}.pdf"`, 'Cache-Control': 'no-store, private' } });
});
