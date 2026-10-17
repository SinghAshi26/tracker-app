import { endpoint, body, json, APIError, employeeFilter } from '../../../lib/api.js';
import { advanceSchema, monthRange, id } from '../../../lib/validation.js';
import { Employee, Advance } from '../../../models/index.js';
export const dynamic = 'force-dynamic';
export const GET = endpoint(['admin', 'employee'], async (r, u) => {
  const p = new URL(r.url).searchParams, requested = p.get('employeeId'); if (requested) id.parse(requested);
  return json({ advances: await Advance.find({ organizationId: u.organizationId, ...employeeFilter(u, requested), date: monthRange(p.get('month')) }).sort({ date: -1 }).lean() });
});
export const POST = endpoint(['admin'], async (r, u) => {
  const data = await body(r, advanceSchema);
  if (!await Employee.exists({ _id: data.employeeId, organizationId: u.organizationId, active: true, joiningDate: { $lte: data.date } })) throw new APIError(400, 'Choose an active employee who has joined by this date');
  return json({ advance: await Advance.create({ ...data, organizationId: u.organizationId }) }, 201);
});
