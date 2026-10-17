import { attendanceDay, datesInMonth } from './attendance.js';
import { DEFAULT_SUNDAY_PAID } from './payroll-settings.js';
export const cents = n => Math.round(n * 100);
export const amount = n => n / 100;
export function salaryBreakdown(employee, attendance, advances, { month, sundayPaid = DEFAULT_SUNDAY_PAID } = {}) {
  const days = { present: 0, absent: 0, half: 0, leave: 0 };
  let sundayPaidDays = 0, weeklyOffDays = 0;
  const rebatedDates = [];
  const records = new Map(attendance.map(row => [row.date, row]));
  const dates = month ? datesInMonth(month) : attendance.map(row => row.date);
  for (const [i, date] of dates.entries()) {
    const row = month ? records.get(date) : attendance[i];
    const effective = date ? attendanceDay(date, row, employee.joiningDate) : { ...row, rebate: row.rebate === true };
    if (effective.status in days) days[effective.status]++;
    if (effective.status === 'weekly_off') { weeklyOffDays++; if (sundayPaid) sundayPaidDays++; }
    if (effective.rebate && ['leave', 'absent'].includes(effective.status)) rebatedDates.push({ date, note: effective.rebateNote || '' });
  }
  const rebateDays = rebatedDates.length;
  const payableDays = days.present + 0.5 * days.half + sundayPaidDays + rebateDays;
  const earned = Math.round(payableDays * cents(employee.perDayRate));
  const deducted = advances.filter(row => (!month || row.date?.startsWith(month + '-')) && (!employee.joiningDate || !row.date || row.date >= employee.joiningDate)).reduce((sum, row) => sum + cents(row.amount), 0);
  return { employeeId: String(employee._id), employeeCode: employee.employeeCode || '', name: employee.name, phone: employee.phone || '', joiningDate: employee.joiningDate, active: employee.active, monthlySalary: employee.monthlySalary, perDayRate: employee.perDayRate, days, payableDays, weeklyOffDays, sundayPaidDays, rebateDays, rebateAmount: amount(rebateDays * cents(employee.perDayRate)), rebatedDates, earned: amount(earned), grossSalary: amount(earned), advances: amount(deducted), netSalary: amount(earned - deducted) };
}
export function salarySnapshot(row, { month, employee = {} } = {}) {
  const leaveDays = row.days.leave, absentDays = row.days.absent;
  const unpaidDays = Math.max(0, leaveDays + absentDays - row.rebateDays + row.days.half * 0.5);
  return {
    employeeCode: row.employeeCode || employee.employeeCode || '', employeeName: row.name || employee.name || '',
    phone: row.phone || employee.phone || '', employeePhone: row.phone || employee.phone || '', joiningDate: row.joiningDate || employee.joiningDate || '',
    monthlySalary: row.monthlySalary ?? employee.monthlySalary ?? 0,
    perDayRate: row.perDayRate, presentDays: row.days.present, halfDays: row.days.half, leaveDays, absentDays,
    sundayPaidDays: row.sundayPaidDays, rebateDays: row.rebateDays, rebateAmount: row.rebateAmount,
    advances: row.advances, grossSalary: row.grossSalary, netSalary: row.netSalary,
    daysInMonth: month ? datesInMonth(month).length : undefined, unpaidDays,
    unpaidDeduction: Math.max(0, (row.monthlySalary ?? employee.monthlySalary ?? 0) - row.grossSalary), totalDeductions: row.advances
  };
}
export function equalSplits(total, userIds) {
  const totalCents = cents(total), base = Math.floor(totalCents / userIds.length), rest = totalCents % userIds.length;
  return userIds.map((userId, index) => ({ userId, share: amount(base + (index < rest ? 1 : 0)) }));
}
export function splitBalances(users, expenses, settlements) {
  const totals = new Map(users.map(u => [String(u._id), { userId: String(u._id), name: u.name, paid: 0, shares: 0, settled: 0 }]));
  for (const e of expenses) {
    if (totals.has(String(e.paidBy))) totals.get(String(e.paidBy)).paid += cents(e.amount);
    for (const s of e.splits) if (totals.has(String(s.userId))) totals.get(String(s.userId)).shares += cents(s.share);
  }
  for (const s of settlements) {
    if (totals.has(String(s.fromUserId))) totals.get(String(s.fromUserId)).settled += cents(s.amount);
    if (totals.has(String(s.toUserId))) totals.get(String(s.toUserId)).settled -= cents(s.amount);
  }
  const raw = [...totals.values()].map(u => ({ ...u, balance: u.paid - u.shares + u.settled }));
  const creditors = raw.filter(u => u.balance > 0).map(u => ({ ...u }));
  const debtors = raw.filter(u => u.balance < 0).map(u => ({ ...u }));
  const transfers = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const value = Math.min(-debtors[i].balance, creditors[j].balance);
    transfers.push({ fromUserId: debtors[i].userId, fromName: debtors[i].name, toUserId: creditors[j].userId, toName: creditors[j].name, amount: amount(value) });
    debtors[i].balance += value; creditors[j].balance -= value;
    if (debtors[i].balance === 0) i++;
    if (creditors[j].balance === 0) j++;
  }
  return { balances: raw.map(u => ({ ...u, paid: amount(u.paid), shares: amount(u.shares), settled: amount(u.settled), balance: amount(u.balance) })), transfers };
}
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
