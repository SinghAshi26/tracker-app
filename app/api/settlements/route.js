import { endpoint, body, json, APIError } from '../../../lib/api.js';
import { settlementSchema } from '../../../lib/validation.js';
import { FINANCE_ROLES } from '../../../lib/permissions.js';
import { User, Settlement } from '../../../models/index.js';
export const dynamic = 'force-dynamic';
export const GET = endpoint(FINANCE_ROLES, async (_r, u) => json({ settlements: await Settlement.find({ organizationId: u.organizationId }).sort({ date: -1, createdAt: -1 }).lean() }));
export const POST = endpoint(FINANCE_ROLES, async (r, u) => {
  const data = await body(r, settlementSchema);
  if (u.role === 'partner' && String(u._id) !== data.fromUserId) throw new APIError(403, 'Partners can only record their own outgoing payments');
  const ids = [data.fromUserId, data.toUserId];
  if (await User.countDocuments({ organizationId: u.organizationId, _id: { $in: ids }, role: { $in: FINANCE_ROLES } }) !== 2) throw new APIError(400, 'Settlement participants must belong to your organization');
  const existing = await Settlement.findOne({ organizationId: u.organizationId, requestId: data.requestId }).lean();
  if (existing) return json({ settlement: existing });
  return json({ settlement: await Settlement.create({ ...data, organizationId: u.organizationId, createdBy: u._id }) }, 201);
});
