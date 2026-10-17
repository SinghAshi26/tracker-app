import { endpoint, json } from '../../../../lib/api.js';
import { ALL_ROLES } from '../../../../lib/permissions.js';
import { Organization, Employee } from '../../../../models/index.js';
export const dynamic = 'force-dynamic';
export const GET = endpoint(ALL_ROLES, async (_request, user) => {
  const organization = await Organization.findOne({ _id: user.organizationId }).select('name').lean();
  const employee = user.role === 'employee' ? await Employee.findOne({ organizationId: user.organizationId, _id: user.employeeId }).select('joiningDate').lean() : null;
  return json({ user: { _id: user._id, name: user.name, role: user.role, employeeId: user.employeeId, organizationId: user.organizationId, ...(employee ? { joiningDate: employee.joiningDate } : {}) }, organization });
});
