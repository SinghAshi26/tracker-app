import { endpoint, body, json, APIError } from '../../../lib/api.js';
import { salaryPaymentSchema } from '../../../lib/validation.js';
import { Employee, SalaryPayment } from '../../../models/index.js';
import { salaries } from '../../../lib/salary.js';
import { salarySnapshot } from '../../../lib/calculations.js';
import { payrollMonthNow } from '../../../lib/payroll-settings.js';
export const runtime = 'nodejs';
export const POST = endpoint(['admin'], async (request, user) => {
  const input = await body(request, salaryPaymentSchema);
  await SalaryPayment.init();
  const scope = { organizationId: user.organizationId, employeeId: input.employeeId, month: input.month };
  const employee = await Employee.findOne({ _id: input.employeeId, organizationId: user.organizationId }).select('joiningDate').lean();
  if (!employee) throw new APIError(404, 'Employee not found');
  if (input.month < employee.joiningDate.slice(0, 7) || input.month > payrollMonthNow()) throw new APIError(400, 'Salary month must be between the joining month and current month');
  if (input.action === 'undo') {
    const payment = await SalaryPayment.findOneAndUpdate({ ...scope, status: 'credited', creditedAt: new Date(input.creditedAt) }, { $set: { status: 'pending', creditedAt: null }, $unset: { creditedBy: 1, snapshot: 1 } }, { new: true, runValidators: true }).lean();
    if (!payment) throw new APIError(409, 'Payment status changed. Refresh before undoing it.');
    return json({ payment });
  }
  const existing = await SalaryPayment.findOne(scope).lean();
  if (existing?.status === 'credited') return json({ payment: existing });
  const { rows } = await salaries(user.organizationId, input.month, input.employeeId);
  if (!rows[0]) throw new APIError(404, 'Salary calculation not available');
  const update = { $set: { status: 'credited', creditedAt: new Date(), creditedBy: user._id, snapshot: salarySnapshot(rows[0]) }, $setOnInsert: scope };
  try {
    const payment = await SalaryPayment.findOneAndUpdate({ ...scope, status: 'pending' }, update, { new: true, upsert: true, runValidators: true }).lean();
    return json({ payment });
  } catch (error) {
    // Concurrent credit requests must never overwrite an already frozen slip.
    if (error.code !== 11000) throw error;
    const payment = await SalaryPayment.findOne({ ...scope, status: 'credited' }).lean();
    if (!payment) throw new APIError(409, 'Payment status changed. Refresh and retry.');
    return json({ payment });
  }
});
