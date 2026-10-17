import bcrypt from 'bcryptjs';
import { endpoint, body, json, APIError } from '../../../../../lib/api.js';
import { id, loginUpdateSchema } from '../../../../../lib/validation.js';
import { Employee, User } from '../../../../../models/index.js';

export const dynamic = 'force-dynamic';

export const PATCH = endpoint(['admin'], async (request, actor) => {
  const targetId = id.parse(request.nextUrl.pathname.split('/').at(-2));
  const input = await body(request, loginUpdateSchema);
  const target = await User.findOne({ _id: targetId, organizationId: actor.organizationId }).lean();
  if (!target || !['employee', 'partner'].includes(target.role)) throw new APIError(404, 'Login not found');

  if (target.role === 'employee' && (!target.employeeId || !await Employee.exists({ _id: target.employeeId, organizationId: actor.organizationId }))) {
    throw new APIError(404, 'Linked employee not found');
  }
  if (input.loginId !== undefined && await User.exists({ organizationId: actor.organizationId, login: input.loginId, _id: { $ne: target._id } })) {
    throw new APIError(409, 'That Login ID is already used by another user in your organization.');
  }

  const set = {};
  if (input.loginId !== undefined) set.login = input.loginId;
  if (input.password !== undefined) set.passwordHash = await bcrypt.hash(input.password, 12);
  if (input.disabled !== undefined) set.loginDisabled = input.disabled;

  const invalidateSessions = input.password !== undefined || (input.disabled !== undefined && input.disabled !== (target.loginDisabled === true));
  const update = { $set: set };
  if (invalidateSessions) update.$inc = { tokenVersion: 1 };
  let updated;
  try {
    updated = await User.findOneAndUpdate({ _id: target._id, organizationId: actor.organizationId }, update, { new: true, runValidators: true })
      .select('name role employeeId login loginDisabled').lean();
  } catch (error) {
    if (error?.code === 11000) throw new APIError(409, 'That Login ID is already used by another user in your organization.');
    throw error;
  }
  if (!updated) throw new APIError(404, 'Login not found');
  return json({ user: { _id: updated._id, name: updated.name, role: updated.role, employeeId: updated.employeeId, login: updated.login, loginDisabled: updated.loginDisabled === true } });
});
