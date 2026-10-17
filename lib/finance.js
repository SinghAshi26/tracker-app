import { User, Expense, Settlement } from '../models/index.js';
import { splitBalances } from './calculations.js';
import { FINANCE_ROLES } from './permissions.js';
export async function financialSummary(organizationId) {
  const [users, expenses, settlements] = await Promise.all([
    User.find({ organizationId, role: { $in: FINANCE_ROLES } }).select('name role').sort({ _id: 1 }).lean(),
    Expense.find({ organizationId }).lean(), Settlement.find({ organizationId }).sort({ date: -1, createdAt: -1 }).lean()
  ]);
  return { ...splitBalances(users, expenses, settlements), settlements };
}
