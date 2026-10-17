import bcrypt from 'bcryptjs';
import { endpoint, body, json, APIError } from '../../../lib/api.js';
import { userSchema } from '../../../lib/validation.js';
import { Employee, User } from '../../../models/index.js';
import { FINANCE_ROLES } from '../../../lib/permissions.js';
export const dynamic = 'force-dynamic';
export const GET = endpoint(FINANCE_ROLES, async (_r, u) => json({ users: await User.find({ organizationId: u.organizationId, ...(u.role === 'partner' ? { role: { $in: FINANCE_ROLES } } : {}) }).select('name role employeeId login loginDisabled').sort({ name: 1 }).lean() }));
export const POST = endpoint(['admin'], async (r, u) => {
  const { password, ...data } = await body(r, userSchema);
  if (data.role === 'employee' && !await Employee.exists({ _id: data.employeeId, organizationId: u.organizationId, active: true })) throw new APIError(400, 'Choose an active employee in this organization');
  if (data.role === 'partner') delete data.employeeId;
  const user = await User.create({ ...data, organizationId: u.organizationId, passwordHash: await bcrypt.hash(password, 12) });
  return json({ user: { _id: user._id, name: user.name, role: user.role } }, 201);
});
