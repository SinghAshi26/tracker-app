import { endpoint, body, json, APIError } from '../../../lib/api.js';
import { expenseSchema, monthRange, id } from '../../../lib/validation.js';
import { Expense, User } from '../../../models/index.js';
import { FINANCE_ROLES } from '../../../lib/permissions.js';
import { cents, equalSplits } from '../../../lib/calculations.js';
export const dynamic = 'force-dynamic';
export const GET = endpoint(FINANCE_ROLES, async (r, u) => {
  const p = new URL(r.url).searchParams, filter = { organizationId: u.organizationId, date: monthRange(p.get('month')) };
  if (p.get('category')) filter.category = p.get('category');
  if (p.get('paidBy')) filter.paidBy = id.parse(p.get('paidBy'));
  return json({ expenses: await Expense.find(filter).sort({ date: -1, createdAt: -1 }).lean() });
});
export const POST = endpoint(FINANCE_ROLES, async (r, u) => {
  const data = await body(r, expenseSchema);
  const ids = [...new Set([data.paidBy, ...data.splits.map(s => s.userId)])];
  const count = await User.countDocuments({ organizationId: u.organizationId, _id: { $in: ids }, role: { $in: FINANCE_ROLES } });
  if (count !== ids.length) throw new APIError(400, 'Payer and participants must be admins or partners in your organization');
  if (data.splitType === 'equal') data.splits = equalSplits(data.amount, data.splits.map(s => s.userId));
  if (data.splits.reduce((sum, s) => sum + cents(s.share), 0) !== cents(data.amount)) throw new APIError(400, 'Custom shares must add up to the expense amount');
  return json({ expense: await Expense.create({ ...data, organizationId: u.organizationId }) }, 201);
});
