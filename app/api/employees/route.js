import { endpoint, body, json, APIError } from '../../../lib/api.js';
import { employeeSchema, id } from '../../../lib/validation.js';
import { Employee } from '../../../models/index.js';
export const dynamic = 'force-dynamic';
export const GET = endpoint(['admin'], async (_r, u) => json({ employees: await Employee.find({ organizationId: u.organizationId }).sort({ active: -1, name: 1 }).lean() }));
export const POST = endpoint(['admin'], async (r, u) => json({ employee: await Employee.create({ ...await body(r, employeeSchema), organizationId: u.organizationId }) }, 201));
export const PATCH = endpoint(['admin'], async (r, u) => {
  const { employeeId, ...updates } = await body(r, employeeSchema.partial().extend({ employeeId: id }));
  const employee = await Employee.findOneAndUpdate({ _id: employeeId, organizationId: u.organizationId }, { $set: updates }, { new: true, runValidators: true });
  if (!employee) throw new APIError(404, 'Employee not found');
  return json({ employee });
});
