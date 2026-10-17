import { z } from 'zod';
export const id = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID');
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, 'Invalid calendar date');
export const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');
export const money = z.number().finite().min(0).max(100000000).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001, 'Use at most two decimal places');
export const positiveMoney = money.refine(n => n > 0, 'Amount must be positive');
export const login = z.string().trim().toLowerCase().max(120).refine(s => z.string().email().safeParse(s).success || /^\+?[0-9]{7,15}$/.test(s), 'Enter an email or phone number (7–15 digits)');
export const password = z.string().min(10).max(72).refine(s => new TextEncoder().encode(s).length <= 72, 'Password must be at most 72 bytes');
export const employeeSchema = z.object({
  name: z.string().trim().min(1).max(100), phone: z.string().trim().max(30).default(''),
  monthlySalary: money, perDayRate: money, joiningDate: date, active: z.boolean().default(true)
}).strict();
export const userSchema = z.object({ name: z.string().trim().min(1).max(100), login, password, role: z.enum(['partner', 'employee']), employeeId: id.optional() }).strict().refine(v => v.role !== 'employee' || !!v.employeeId, 'Employee account requires an employee');
export const attendanceSchema = z.object({ date, records: z.array(z.object({ employeeId: id, status: z.enum(['present', 'absent', 'half', 'leave']) }).strict()).min(1).max(500) }).strict().refine(v => new Set(v.records.map(r => r.employeeId)).size === v.records.length, 'Duplicate employee');
export const advanceSchema = z.object({ employeeId: id, amount: positiveMoney, date, note: z.string().trim().max(500).default('') }).strict();
export const expenseSchema = z.object({
  amount: positiveMoney, paidBy: id, category: z.string().trim().min(1).max(60), date,
  note: z.string().trim().max(500).default(''), splitType: z.enum(['equal', 'custom']),
  splits: z.array(z.object({ userId: id, share: money }).strict()).min(1).max(100)
}).strict().refine(v => new Set(v.splits.map(s => s.userId)).size === v.splits.length, 'Duplicate split participant');
export const settlementSchema = z.object({ fromUserId: id, toUserId: id, amount: positiveMoney, date, note: z.string().trim().max(500).default(''), requestId: z.string().uuid() }).strict().refine(v => v.fromUserId !== v.toUserId, 'Choose two different people');
export function monthRange(value) {
  month.parse(value);
  const [y, m] = value.split('-').map(Number);
  return { $gte: `${value}-01`, $lt: `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01` };
}
