import { endpoint, body, json, APIError } from '../../../../lib/api.js';
import { workActionSchema } from '../../../../lib/validation.js';
import { Employee, WorkSession } from '../../../../models/index.js';
import { autoCloseStaleSessions, istDate, WORK_ACTION_INTERVAL_MS } from '../../../../lib/work-hours.js';

export const dynamic = 'force-dynamic';

export const POST = endpoint(['employee'], async (request, user) => {
  await body(request, workActionSchema);
  const now = new Date(), date = istDate(now);
  await WorkSession.init();
  await autoCloseStaleSessions(WorkSession, user.organizationId, user.employeeId, now);
  const employee = await Employee.findOne({ _id: user.employeeId, organizationId: user.organizationId, active: true }).select('joiningDate').lean();
  if (!employee) throw new APIError(403, 'Your employee account is inactive. Contact your administrator.');
  if (employee.joiningDate > date) throw new APIError(403, 'Check-in is available from your joining date.');
  if (await WorkSession.exists({ organizationId: user.organizationId, employeeId: user.employeeId, status: 'open', checkOutAt: null })) {
    throw new APIError(409, 'You are already checked in. Check out before starting another session.');
  }
  const recentCutoff = new Date(now.getTime() - WORK_ACTION_INTERVAL_MS);
  if (await WorkSession.exists({ organizationId: user.organizationId, employeeId: user.employeeId, editedBy: { $exists: false }, $or: [{ checkInAt: { $gt: recentCutoff } }, { status: 'closed', checkOutAt: { $gt: recentCutoff } }] })) {
    throw new APIError(429, 'Please wait a few seconds before trying another work action.');
  }
  try {
    const session = await WorkSession.create({ organizationId: user.organizationId, employeeId: user.employeeId, date, checkInAt: now, checkOutAt: null, durationMinutes: 0, status: 'open' });
    return json({ session, serverNow: now.toISOString() }, 201);
  } catch (error) {
    if (error?.code === 11000) throw new APIError(409, 'You are already checked in. Check out before starting another session.');
    throw error;
  }
});
