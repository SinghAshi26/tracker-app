import { endpoint, body, json, APIError } from '../../../../lib/api.js';
import { workActionSchema } from '../../../../lib/validation.js';
import { WorkSession } from '../../../../models/index.js';
import { autoCloseStaleSessions, durationMinutes, WORK_ACTION_INTERVAL_MS } from '../../../../lib/work-hours.js';

export const dynamic = 'force-dynamic';

export const POST = endpoint(['employee'], async (request, user) => {
  await body(request, workActionSchema);
  const now = new Date();
  await autoCloseStaleSessions(WorkSession, user.organizationId, user.employeeId, now);
  const openSession = await WorkSession.findOne({ organizationId: user.organizationId, employeeId: user.employeeId, status: 'open', checkOutAt: null }).lean();
  if (!openSession) throw new APIError(409, 'You are not checked in right now. Check in before checking out.');
  const recentCutoff = new Date(now.getTime() - WORK_ACTION_INTERVAL_MS);
  if (await WorkSession.exists({ organizationId: user.organizationId, employeeId: user.employeeId, editedBy: { $exists: false }, $or: [{ checkInAt: { $gt: recentCutoff } }, { status: 'closed', checkOutAt: { $gt: recentCutoff } }] })) {
    throw new APIError(429, 'Please wait a few seconds before trying another work action.');
  }
  const minutes = durationMinutes(openSession.checkInAt, now);
  const session = await WorkSession.findOneAndUpdate(
    { _id: openSession._id, organizationId: user.organizationId, employeeId: user.employeeId, status: 'open', checkOutAt: null },
    { $set: { checkOutAt: now, durationMinutes: minutes, status: 'closed' } }, { new: true }
  ).lean();
  if (!session) throw new APIError(409, 'This session was already checked out on another device. Refresh your work hours.');
  return json({ session, serverNow: now.toISOString() });
});
