import { endpoint, body, json, APIError } from '../../../../../lib/api.js';
import { id, workCorrectionSchema } from '../../../../../lib/validation.js';
import { WorkSession } from '../../../../../models/index.js';
import { durationMinutes, istDate } from '../../../../../lib/work-hours.js';

export const dynamic = 'force-dynamic';

export const PATCH = endpoint(['admin'], async (request, user) => {
  const sessionId = id.parse(request.nextUrl.pathname.split('/').at(-1));
  const input = await body(request, workCorrectionSchema);
  const session = await WorkSession.findOne({ _id: sessionId, organizationId: user.organizationId }).lean();
  if (!session) throw new APIError(404, 'Work session not found.');
  const checkInAt = input.checkInAt ? new Date(input.checkInAt) : new Date(session.checkInAt);
  const checkOutAt = input.checkOutAt ? new Date(input.checkOutAt) : session.checkOutAt && new Date(session.checkOutAt);
  if (!checkOutAt) throw new APIError(400, 'Add the corrected check-out time to close this session.');
  if (checkOutAt <= checkInAt) throw new APIError(400, 'Check-out must be after check-in.');
  if (checkOutAt.getTime() - checkInAt.getTime() > 24 * 3600000) throw new APIError(400, 'A work session cannot exceed 24 hours.');
  const duration = durationMinutes(checkInAt, checkOutAt);
  const updated = await WorkSession.findOneAndUpdate(
    { _id: session._id, organizationId: user.organizationId },
    { $set: { checkInAt, checkOutAt, date: istDate(checkInAt), durationMinutes: duration, status: 'closed', editedBy: user._id, editNote: input.editNote } },
    { new: true, runValidators: true }
  ).lean();
  return json({ session: updated });
});
